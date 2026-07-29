import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';

export type TailorProfileRecord = {
  user_id: string;
  phone: string | null;
  cloud_notes: string | null;
  shop_name: string | null;
};

export type TailorProfileUpsert = {
  user_id: string;
  phone: string;
  cloud_notes: string;
  shop_name: string;
};

const LOCAL_PROFILE_KEY = 'mistarh_tailor_profile';

/** لا تُرسل أبداً في Insert/Update — تُدار في PostgreSQL عبر DEFAULT فقط. */
const FORBIDDEN_WRITE_COLUMNS = ['updated_at', 'created_at'] as const;

/** قد تغيب في جداول قديمة أو في Schema Cache قبل التحديث. */
const OPTIONAL_WRITE_COLUMNS = ['shop_name'] as const;

export function isMissingSchemaColumn(error: PostgrestError, column: string): boolean {
  const msg = (error.message ?? '').toLowerCase();
  const col = column.toLowerCase();
  return msg.includes(col) || (error.code === 'PGRST204' && msg.includes(col));
}

function isTimestampSchemaCacheError(error: PostgrestError): boolean {
  return (
    error.code === 'PGRST204' &&
    (isMissingSchemaColumn(error, 'updated_at') || isMissingSchemaColumn(error, 'created_at'))
  );
}

/** يبني كائن الحفظ من قائمة بيضاء — يتجاهل أي حقول زمنية حتى لو أُرفقت بالخطأ. */
export function buildTailorProfileWriteRow(
  payload: TailorProfileUpsert & Partial<Record<(typeof FORBIDDEN_WRITE_COLUMNS)[number], string>>
): Record<string, string> {
  return {
    user_id: payload.user_id,
    phone: payload.phone,
    cloud_notes: payload.cloud_notes,
    shop_name: payload.shop_name,
  };
}

export function loadLocalTailorProfile(): Partial<TailorProfileUpsert> | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(LOCAL_PROFILE_KEY);
    return raw ? (JSON.parse(raw) as Partial<TailorProfileUpsert>) : null;
  } catch {
    return null;
  }
}

export function saveLocalTailorProfile(profile: Omit<TailorProfileUpsert, 'user_id'>): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(
    LOCAL_PROFILE_KEY,
    JSON.stringify({ ...profile, user_id: 'guest-local-user' })
  );
}

export async function fetchTailorProfile(
  supabase: SupabaseClient,
  userId: string
): Promise<TailorProfileRecord | null> {
  const fullSelect = await supabase
    .from('tailor_profiles')
    .select('user_id, phone, cloud_notes, shop_name')
    .eq('user_id', userId)
    .maybeSingle();

  if (!fullSelect.error) {
    return fullSelect.data as TailorProfileRecord | null;
  }

  if (isMissingSchemaColumn(fullSelect.error, 'shop_name')) {
    const legacy = await supabase
      .from('tailor_profiles')
      .select('user_id, phone, cloud_notes')
      .eq('user_id', userId)
      .maybeSingle();
    if (legacy.error) {
      throw new Error(legacy.error.message);
    }
    return legacy.data
      ? { ...(legacy.data as TailorProfileRecord), shop_name: null }
      : null;
  }

  throw new Error(fullSelect.error.message);
}

async function profileRowExists(
  supabase: SupabaseClient,
  userId: string
): Promise<{ exists: boolean; error: PostgrestError | null }> {
  const { data, error } = await supabase
    .from('tailor_profiles')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    return { exists: false, error };
  }
  return { exists: Boolean(data), error: null };
}

/**
 * insert أو update فقط (بدون upsert) لتجنب مسارات PostgREST التي قد تلمس أعمدة زمنية في الـ cache.
 */
async function writeTailorProfileRow(
  supabase: SupabaseClient,
  row: Record<string, string>
): Promise<PostgrestError | null> {
  const userId = row.user_id;
  const updateFields = { ...row };
  delete updateFields.user_id;

  const { exists, error: existsError } = await profileRowExists(supabase, userId);
  if (existsError && !isTimestampSchemaCacheError(existsError)) {
    return existsError;
  }

  if (exists) {
    const { error } = await supabase.from('tailor_profiles').update(updateFields).eq('user_id', userId);
    return error;
  }

  const { error } = await supabase.from('tailor_profiles').insert(row);
  return error;
}

/**
 * يحفظ ملف الخياط — لا تُضمَّن `updated_at` / `created_at` في الـ payload نهائياً.
 */
export async function upsertTailorProfile(
  supabase: SupabaseClient,
  payload: TailorProfileUpsert
): Promise<void> {
  let row = buildTailorProfileWriteRow(payload);

  const maxAttempts = OPTIONAL_WRITE_COLUMNS.length + 3;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const error = await writeTailorProfileRow(supabase, row);

    if (!error) {
      return;
    }

    if (isTimestampSchemaCacheError(error)) {
      const retry = await writeTailorProfileRow(supabase, row);
      if (!retry) {
        return;
      }

      const legacyRow: Record<string, string> = {
        user_id: row.user_id,
        phone: row.phone,
        cloud_notes: row.cloud_notes,
      };
      const legacyError = await writeTailorProfileRow(supabase, legacyRow);
      if (!legacyError) {
        return;
      }
    }

    let stripped = false;
    for (const col of OPTIONAL_WRITE_COLUMNS) {
      if (col in row && isMissingSchemaColumn(error, col)) {
        const next = { ...row };
        delete next[col];
        row = next;
        stripped = true;
        break;
      }
    }

    if (!stripped) {
      throw new Error(error.message);
    }
  }

  throw new Error('تعذّر حفظ إعدادات الخياط بعد عدة محاولات.');
}
