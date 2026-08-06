import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchOrganizationContextForUser } from '@/lib/organization-server';

/** يجلب معرف المنظمة النشطة من جلسة Supabase (للاستخدام في مسارات الخادم). */
export async function getOrganizationIdForUser(
  supabase: SupabaseClient,
  userId: string
): Promise<string | null> {
  const context = await fetchOrganizationContextForUser(supabase, userId);
  return context?.organizationId ?? null;
}

export { fetchOrganizationContextForUser } from '@/lib/organization-server';
export type { OrganizationContext } from '@/lib/organization';
