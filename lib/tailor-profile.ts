import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';

export type TailorProfileRecord = {
  user_id: string;
  organization_id: string | null;
  phone: string | null;
  cloud_notes: string | null;
  shop_name: string | null;
  avatar_url: string | null;
};

export type TailorProfileUpsert = {
  user_id: string;
  organization_id?: string;
  phone: string;
  cloud_notes: string;
  shop_name: string;
  avatar_url?: string;
};

const LOCAL_PROFILE_KEY = 'mistarh_tailor_profile';
const LOCAL_AVATAR_PREFIX = 'mistarh_tailor_avatar:';

export type AvatarPersistTarget = 'database' | 'local';

/** لا تُرسل أبداً في Insert/Update — تُدار في PostgreSQL عبر DEFAULT فقط. */
const FORBIDDEN_WRITE_COLUMNS = ['updated_at', 'created_at'] as const;

/** قد تغيب في جداول قديمة أو في Schema Cache قبل التحديث. */
const OPTIONAL_WRITE_COLUMNS = ['shop_name', 'avatar_url', 'organization_id'] as const;

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
  const row: Record<string, string> = {
    user_id: payload.user_id,
    phone: payload.phone,
    cloud_notes: payload.cloud_notes,
    shop_name: payload.shop_name,
  };
  if (payload.avatar_url?.trim()) {
    row.avatar_url = payload.avatar_url.trim();
  }
  if (payload.organization_id?.trim()) {
    row.organization_id = payload.organization_id.trim();
  }
  return row;
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

/** يحفظ رابط الصورة محلياً على الجهاز (ذاكرة تخزين مؤقتة / احتياط). */
export function saveLocalAvatarUrl(userId: string, avatarUrl: string): void {
  if (typeof window === 'undefined' || !userId) return;
  try {
    localStorage.setItem(`${LOCAL_AVATAR_PREFIX}${userId}`, avatarUrl.trim());
  } catch {
    /* تجاهل: قد يمتلئ التخزين المحلي */
  }
}

export function loadLocalAvatarUrl(userId: string): string | null {
  if (typeof window === 'undefined' || !userId) return null;
  try {
    return localStorage.getItem(`${LOCAL_AVATAR_PREFIX}${userId}`);
  } catch {
    return null;
  }
}

/** يدمج رابط الصورة — قاعدة البيانات أولاً، ثم النسخة المحلية الاحتياطية. */
export function resolveAvatarUrl(dbUrl: string | null | undefined, userId: string): string {
  const fromDb = dbUrl?.trim();
  if (fromDb) return fromDb;
  return loadLocalAvatarUrl(userId)?.trim() ?? '';
}

function cacheAvatarLocally(userId: string, avatarUrl: string): void {
  if (avatarUrl.trim()) {
    saveLocalAvatarUrl(userId, avatarUrl);
  }
}

function enrichProfileWithLocalAvatar(
  record: TailorProfileRecord | null,
  userId: string
): TailorProfileRecord | null {
  if (!record) {
    const localAvatar = loadLocalAvatarUrl(userId);
    if (!localAvatar) return null;
    return {
      user_id: userId,
      organization_id: null,
      phone: null,
      cloud_notes: null,
      shop_name: null,
      avatar_url: localAvatar,
    };
  }

  const dbAvatar = record.avatar_url?.trim() ?? '';
  if (dbAvatar) {
    cacheAvatarLocally(userId, dbAvatar);
    return record;
  }

  const localAvatar = loadLocalAvatarUrl(userId)?.trim();
  if (!localAvatar) return record;

  return { ...record, avatar_url: localAvatar };
}

/** يحاول كتابة avatar_url مباشرة في tailor_profiles — المسار الأساسي بعد تفعيل العمود. */
async function trySaveAvatarUrlToDatabase(
  supabase: SupabaseClient,
  userId: string,
  avatarUrl: string,
  profile: Omit<TailorProfileUpsert, 'user_id' | 'avatar_url'>
): Promise<boolean> {
  const trimmedUrl = avatarUrl.trim();
  const { exists, error: existsError } = await profileRowExists(supabase, userId);
  if (existsError && !isTimestampSchemaCacheError(existsError)) {
    return false;
  }

  if (exists) {
    const { error: avatarOnlyError } = await supabase
      .from('tailor_profiles')
      .update({ avatar_url: trimmedUrl })
      .eq('user_id', userId);

    if (!avatarOnlyError) {
      return true;
    }

    if (isMissingSchemaColumn(avatarOnlyError, 'avatar_url')) {
      return false;
    }

    if (!isTimestampSchemaCacheError(avatarOnlyError)) {
      /* fall through to upsert */
    }
  }

  try {
    await upsertTailorProfile(supabase, {
      user_id: userId,
      phone: profile.phone,
      cloud_notes: profile.cloud_notes,
      shop_name: profile.shop_name,
      avatar_url: trimmedUrl,
    });

    const { data: verifyRow, error: verifyError } = await supabase
      .from('tailor_profiles')
      .select('avatar_url')
      .eq('user_id', userId)
      .maybeSingle();

    if (verifyError) {
      if (isMissingSchemaColumn(verifyError, 'avatar_url')) {
        return false;
      }
      return false;
    }

    return String((verifyRow as { avatar_url?: string } | null)?.avatar_url ?? '').trim() === trimmedUrl;
  } catch {
    return false;
  }
}

/**
 * إن وُجدت صورة محلية قديمة ولم تُحفظ بعد في Supabase، تُزامَن تلقائياً عند تسجيل الدخول.
 */
export async function syncLocalAvatarToDatabaseIfNeeded(
  supabase: SupabaseClient,
  userId: string,
  profile: Omit<TailorProfileUpsert, 'user_id' | 'avatar_url'>
): Promise<void> {
  const localAvatar = loadLocalAvatarUrl(userId)?.trim();
  if (!localAvatar) return;

  const { data, error } = await supabase
    .from('tailor_profiles')
    .select('avatar_url')
    .eq('user_id', userId)
    .maybeSingle();

  if (error && isMissingSchemaColumn(error, 'avatar_url')) {
    return;
  }

  if (String((data as { avatar_url?: string } | null)?.avatar_url ?? '').trim()) {
    return;
  }

  await trySaveAvatarUrlToDatabase(supabase, userId, localAvatar, profile);
}

export async function fetchTailorProfile(
  supabase: SupabaseClient,
  userId: string
): Promise<TailorProfileRecord | null> {
  const fullSelect = await supabase
    .from('tailor_profiles')
    .select('user_id, organization_id, phone, cloud_notes, shop_name, avatar_url')
    .eq('user_id', userId)
    .maybeSingle();

  if (!fullSelect.error) {
    const row = fullSelect.data as TailorProfileRecord | null;
    return enrichProfileWithLocalAvatar(
      row ? { ...row, avatar_url: row.avatar_url ?? null } : null,
      userId
    );
  }

  if (
    isMissingSchemaColumn(fullSelect.error, 'shop_name') ||
    isMissingSchemaColumn(fullSelect.error, 'avatar_url') ||
    isMissingSchemaColumn(fullSelect.error, 'organization_id')
  ) {
    const legacy = await supabase
      .from('tailor_profiles')
      .select('user_id, phone, cloud_notes, shop_name')
      .eq('user_id', userId)
      .maybeSingle();
    if (legacy.error) {
      if (isMissingSchemaColumn(legacy.error, 'shop_name')) {
        const minimal = await supabase
          .from('tailor_profiles')
          .select('user_id, phone, cloud_notes')
          .eq('user_id', userId)
          .maybeSingle();
        if (minimal.error) {
          throw new Error(minimal.error.message);
        }
        return enrichProfileWithLocalAvatar(
          minimal.data
            ? {
                ...(minimal.data as TailorProfileRecord),
                shop_name: null,
                avatar_url: null,
                organization_id: null,
              }
            : null,
          userId
        );
      }
      throw new Error(legacy.error.message);
    }
    return enrichProfileWithLocalAvatar(
      legacy.data
        ? { ...(legacy.data as TailorProfileRecord), avatar_url: null, organization_id: null }
        : null,
      userId
    );
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

/**
 * يحفظ رابط صورة الحساب — Supabase (`tailor_profiles.avatar_url`) أولاً،
 * مع نسخة محلية احتياطية دائماً لضمان استمرار العرض بعد Refresh.
 */
export async function persistTailorAvatarUrl(
  supabase: SupabaseClient,
  userId: string,
  avatarUrl: string,
  profile: Omit<TailorProfileUpsert, 'user_id' | 'avatar_url'>
): Promise<AvatarPersistTarget> {
  const trimmedUrl = avatarUrl.trim();
  if (!trimmedUrl) {
    throw new Error('رابط صورة الحساب فارغ.');
  }

  const savedToDatabase = await trySaveAvatarUrlToDatabase(supabase, userId, trimmedUrl, profile);
  cacheAvatarLocally(userId, trimmedUrl);

  return savedToDatabase ? 'database' : 'local';
}

/** يدمج avatar_url في ملف الخياط المحلي (وضع التجربة). */
export function persistLocalTailorAvatarUrl(
  avatarUrl: string,
  profile: Omit<TailorProfileUpsert, 'user_id' | 'avatar_url'>,
  userId = 'guest-local-user'
): void {
  const existing = loadLocalTailorProfile();
  saveLocalTailorProfile({
    phone: profile.phone || existing?.phone || '',
    cloud_notes: profile.cloud_notes ?? existing?.cloud_notes ?? '',
    shop_name: profile.shop_name ?? existing?.shop_name ?? '',
    avatar_url: avatarUrl,
  });
  saveLocalAvatarUrl(userId, avatarUrl);
}
