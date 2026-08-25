import { doc, getDoc, setDoc } from 'firebase/firestore';
import { getFirebaseAuthClient, getFirebaseFirestoreClient, isFirebaseConfigured } from '@/lib/firebase';

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

export function buildTailorProfileWriteRow(payload: TailorProfileUpsert): Record<string, string> {
  const row: Record<string, string> = {
    user_id: payload.user_id,
    phone: payload.phone,
    cloud_notes: payload.cloud_notes,
    shop_name: payload.shop_name,
  };
  if (payload.avatar_url?.trim()) {
    row.avatar_url = payload.avatar_url.trim();
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

export function saveLocalAvatarUrl(userId: string, avatarUrl: string): void {
  if (typeof window === 'undefined' || !userId) return;
  try {
    localStorage.setItem(`${LOCAL_AVATAR_PREFIX}${userId}`, avatarUrl.trim());
  } catch {
    /* ignore */
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

function mapProfileDoc(userId: string, data: Record<string, unknown>): TailorProfileRecord {
  return {
    user_id: userId,
    organization_id: data.organization_id != null ? String(data.organization_id) : null,
    phone: data.phone != null ? String(data.phone) : null,
    cloud_notes: data.cloud_notes != null ? String(data.cloud_notes) : null,
    shop_name: data.shop_name != null ? String(data.shop_name) : null,
    avatar_url: data.avatar_url != null ? String(data.avatar_url) : null,
  };
}

export async function fetchTailorProfile(userId: string): Promise<TailorProfileRecord | null> {
  if (!isFirebaseConfigured()) return null;

  const db = getFirebaseFirestoreClient();
  const snap = await getDoc(doc(db, 'tailor_profiles', userId));
  if (!snap.exists()) {
    return enrichProfileWithLocalAvatar(null, userId);
  }

  const record = mapProfileDoc(userId, snap.data() as Record<string, unknown>);
  return enrichProfileWithLocalAvatar(record, userId);
}

export async function syncLocalAvatarToDatabaseIfNeeded(
  userId: string,
  profile: Omit<TailorProfileUpsert, 'user_id' | 'avatar_url'>
): Promise<void> {
  const localAvatar = loadLocalAvatarUrl(userId)?.trim();
  if (!localAvatar || !isFirebaseConfigured()) return;

  const existing = await fetchTailorProfile(userId);
  if (existing?.avatar_url?.trim()) return;

  await upsertTailorProfile({
    user_id: userId,
    phone: profile.phone,
    cloud_notes: profile.cloud_notes,
    shop_name: profile.shop_name,
    avatar_url: localAvatar,
  });
}

export async function upsertTailorProfile(payload: TailorProfileUpsert): Promise<void> {
  if (!isFirebaseConfigured()) {
    saveLocalTailorProfile({
      phone: payload.phone,
      cloud_notes: payload.cloud_notes,
      shop_name: payload.shop_name,
      avatar_url: payload.avatar_url,
    });
    return;
  }

  const authUser = getFirebaseAuthClient().currentUser;
  if (!authUser || authUser.uid !== payload.user_id) {
    throw new Error('يجب تسجيل الدخول لحفظ إعدادات الخياط.');
  }

  const row = buildTailorProfileWriteRow(payload);
  const db = getFirebaseFirestoreClient();
  await setDoc(
    doc(db, 'tailor_profiles', payload.user_id),
    {
      ...row,
      updated_at: new Date().toISOString(),
    },
    { merge: true }
  );
}

export async function persistTailorAvatarUrl(
  userId: string,
  avatarUrl: string,
  profile: Omit<TailorProfileUpsert, 'user_id' | 'avatar_url'>
): Promise<AvatarPersistTarget> {
  const trimmedUrl = avatarUrl.trim();
  if (!trimmedUrl) {
    throw new Error('رابط صورة الحساب فارغ.');
  }

  if (!isFirebaseConfigured()) {
    cacheAvatarLocally(userId, trimmedUrl);
    return 'local';
  }

  try {
    await upsertTailorProfile({
      user_id: userId,
      phone: profile.phone,
      cloud_notes: profile.cloud_notes,
      shop_name: profile.shop_name,
      avatar_url: trimmedUrl,
    });
    cacheAvatarLocally(userId, trimmedUrl);
    return 'database';
  } catch {
    cacheAvatarLocally(userId, trimmedUrl);
    return 'local';
  }
}

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
