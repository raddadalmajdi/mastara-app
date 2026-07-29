import type { SupabaseClient } from '@supabase/supabase-js';

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
  const { data, error } = await supabase
    .from('tailor_profiles')
    .select('user_id, phone, cloud_notes, shop_name')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  return data as TailorProfileRecord | null;
}

export async function upsertTailorProfile(
  supabase: SupabaseClient,
  payload: TailorProfileUpsert
): Promise<void> {
  const row: Record<string, string> = {
    user_id: payload.user_id,
    phone: payload.phone,
    cloud_notes: payload.cloud_notes,
    shop_name: payload.shop_name,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase.from('tailor_profiles').upsert(row, { onConflict: 'user_id' });

  if (error) {
    const missingShopColumn =
      error.message.includes('shop_name') ||
      (error.code === 'PGRST204' && error.message.includes('shop_name'));
    if (missingShopColumn) {
      const { shop_name: _removed, ...legacyRow } = row;
      const retry = await supabase.from('tailor_profiles').upsert(legacyRow, { onConflict: 'user_id' });
      if (retry.error) {
        throw new Error(retry.error.message);
      }
      throw new Error(
        'تم حفظ الهاتف والملاحظات، لكن عمود shop_name غير موجود. نفّذ migration من supabase/migrations/20260729190000_tailor_shop_name_and_customers.sql.'
      );
    }
    throw new Error(error.message);
  }
}
