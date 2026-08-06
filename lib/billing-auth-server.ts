import type { User } from '@supabase/supabase-js';
import { createSupabaseAdminClient } from '@/lib/delete-auth-user-admin';

export async function getUserFromBearerToken(request: Request): Promise<User | null> {
  const header = request.headers.get('authorization') ?? '';
  const token = header.replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user;
}

export async function assertUserOrganizationAccess(
  userId: string,
  organizationId: string
): Promise<{ role: 'owner' | 'member' }> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from('organization_members')
    .select('role')
    .eq('user_id', userId)
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  if (!data) {
    throw new Error('FORBIDDEN_ORG');
  }
  return { role: (data.role as 'owner' | 'member') ?? 'member' };
}

export async function requireBillingOwner(
  userId: string,
  organizationId: string
): Promise<void> {
  const access = await assertUserOrganizationAccess(userId, organizationId);
  if (access.role !== 'owner') {
    throw new Error('FORBIDDEN_NOT_OWNER');
  }
}
