import { fetchOrganizationContextForUser } from '@/lib/organization-server';

/** يجلب معرف المنظمة النشطة للمستخدم (Admin SDK — للخادم). */
export async function getOrganizationIdForUser(userId: string): Promise<string | null> {
  const context = await fetchOrganizationContextForUser(userId);
  return context?.organizationId ?? null;
}

export { fetchOrganizationContextForUser } from '@/lib/organization-server';
export type { OrganizationContext } from '@/lib/organization';
