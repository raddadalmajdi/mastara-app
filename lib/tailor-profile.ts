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

/** أعمدة اختيارية قد تغيب في Supabase القديم أو في Schema Cache قبل التحديث. */
const OPTIONAL_TAILOR_PROFILE_COLUMNS = ['updated_at', 'created_at', 'shop_name'] as const;

export function isMissingSchemaColumn(error: PostgrestError, column: string): boolean {
  const msg = (error.message ?? '').toLowerCase();
  const col = column.toLowerCase();
  return msg.includes(col) || (error.code === 'PGRST204' && msg.includes(col));
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

/**
 * يحفظ ملف الخياط — الحقول الزمنية (`updated_at` / `created_at`) لا تُرسَل افتراضياً
 * (تُدار في DB عبر DEFAULT/TRIGGER). عند PGRST204 يُعاد المحاولة بدون الأعمدة غير المعروفة.
 */
export async function upsertTailorProfile(
  supabase: SupabaseClient,
  payload: TailorProfileUpsert
): Promise<void> {
  const core: Record<string, string> = {
    user_id: payload.user_id,
    phone: payload.phone,
    cloud_notes: payload.cloud_notes,
    shop_name: payload.shop_name,
  };

  let row: Record<string, string> = { ...core };

  for (let attempt = 0; attempt < OPTIONAL_TAILOR_PROFILE_COLUMNS.length + 2; attempt++) {
    const { error } = await supabase.from('tailor_profiles').upsert(row, { onConflict: 'user_id' });

    if (!error) {
      return;
    }

    let stripped = false;
    for (const col of OPTIONAL_TAILOR_PROFILE_COLUMNS) {
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
