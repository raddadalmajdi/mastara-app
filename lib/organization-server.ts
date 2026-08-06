import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseAdminClient } from '@/lib/delete-auth-user-admin';
import {
  buildOrganizationSlug,
  defaultOrganizationNameFromEmail,
  type OrganizationContext,
  type OrganizationRecord,
} from '@/lib/organization';
import { ensureStarterSubscription } from '@/lib/subscription-server';

export type EnsureOrganizationResult =
  | { ok: true; organizationId: string; created: boolean }
  | { ok: false; message: string };

async function findExistingMembership(
  admin: SupabaseClient,
  userId: string
): Promise<{ organizationId: string; role: 'owner' | 'member' } | null> {
  const { data, error } = await admin
    .from('organization_members')
    .select('organization_id, role')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    if (
      error.message.includes('organization_members') ||
      error.code === 'PGRST204' ||
      error.code === '42P01'
    ) {
      return null;
    }
    throw new Error(error.message);
  }

  if (!data?.organization_id) return null;
  return {
    organizationId: data.organization_id,
    role: (data.role as 'owner' | 'member') ?? 'owner',
  };
}

async function insertOrganizationWithRetry(
  admin: SupabaseClient,
  params: { userId: string; email: string; shopName?: string }
): Promise<string> {
  const baseName = params.shopName?.trim() || defaultOrganizationNameFromEmail(params.email);
  let slug = buildOrganizationSlug(params.email, params.userId);

  for (let attempt = 0; attempt < 5; attempt++) {
    const { data: org, error: orgError } = await admin
      .from('organizations')
      .insert({
        name: baseName,
        slug,
        owner_id: params.userId,
      })
      .select('id')
      .single();

    if (!orgError && org?.id) {
      const { error: memberError } = await admin.from('organization_members').insert({
        organization_id: org.id,
        user_id: params.userId,
        role: 'owner',
      });

      if (memberError) {
        await admin.from('organizations').delete().eq('id', org.id);
        throw new Error(memberError.message);
      }

      return org.id;
    }

    if (orgError?.code === '23505' || (orgError?.message ?? '').includes('organizations_slug_unique')) {
      slug = `${buildOrganizationSlug(params.email, params.userId)}-${attempt + 2}`;
      continue;
    }

    throw new Error(orgError?.message ?? 'تعذّر إنشاء المنظمة.');
  }

  throw new Error('تعذّر إنشاء slug فريد للمنظمة.');
}

/** ينشئ منظمة للمستخدم الجديد أو يُرجع الموجودة (idempotent). */
export async function getOrCreateOrganizationForUser(params: {
  userId: string;
  email: string;
  shopName?: string;
}): Promise<EnsureOrganizationResult> {
  const admin = createSupabaseAdminClient();
  const userId = params.userId.trim();
  const email = params.email.trim().toLowerCase();

  if (!userId || !email) {
    return { ok: false, message: 'userId و email مطلوبان لإنشاء المنظمة.' };
  }

  try {
    const existing = await findExistingMembership(admin, userId);
    if (existing) {
      await ensureStarterSubscription(existing.organizationId).catch(() => undefined);
      return { ok: true, organizationId: existing.organizationId, created: false };
    }

    const organizationId = await insertOrganizationWithRetry(admin, {
      userId,
      email,
      shopName: params.shopName,
    });

    await ensureStarterSubscription(organizationId).catch(() => undefined);

    return { ok: true, organizationId, created: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'تعذّر إعداد المنظمة.';
    console.error('[organization-server] getOrCreateOrganizationForUser failed', {
      userId,
      email,
      message,
    });
    return { ok: false, message };
  }
}

/** يجلب سياق المنظمة النشطة للمستخدم (عميل — RLS). */
export async function fetchOrganizationContextForUser(
  supabase: SupabaseClient,
  userId: string
): Promise<OrganizationContext | null> {
  const { data, error } = await supabase
    .from('organization_members')
    .select(
      `
      organization_id,
      role,
      organizations (
        id,
        name,
        slug,
        owner_id,
        created_at,
        updated_at
      )
    `
    )
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    if (
      error.message.includes('organization_members') ||
      error.code === 'PGRST204' ||
      error.code === '42P01'
    ) {
      return null;
    }
    throw new Error(error.message);
  }

  if (!data?.organization_id) return null;

  const orgRaw = data.organizations as OrganizationRecord | OrganizationRecord[] | null;
  const organization = Array.isArray(orgRaw) ? orgRaw[0] : orgRaw;
  if (!organization?.id) return null;

  return {
    organizationId: data.organization_id,
    role: (data.role as OrganizationContext['role']) ?? 'owner',
    organization,
  };
}

/** يُحدّث organization_id على tailor_profiles إن وُجد العمود. */
export async function backfillTailorProfileOrganizationId(
  admin: SupabaseClient,
  userId: string,
  organizationId: string
): Promise<void> {
  const { error } = await admin
    .from('tailor_profiles')
    .update({ organization_id: organizationId })
    .eq('user_id', userId)
    .is('organization_id', null);

  if (error && !error.message.toLowerCase().includes('organization_id')) {
    console.warn('[organization-server] backfill tailor_profiles failed', error.message);
  }
}
