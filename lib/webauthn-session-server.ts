import { createClient } from '@supabase/supabase-js';
import { createSupabaseAdminClient } from '@/lib/delete-auth-user-admin';
import { getOrCreateOrganizationForUser } from '@/lib/organization-server';
import { getSupabasePublicConfig } from '@/lib/supabase/env';

export type WebAuthnSessionBundle = {
  access_token: string;
  refresh_token: string;
  userId: string;
  organizationId: string | null;
};

/** يُنشئ جلسة Supabase للمستخدم بعد نجاح WebAuthn — دون المساس بمسارات OTP. */
export async function createSupabaseSessionForUserId(userId: string): Promise<WebAuthnSessionBundle> {
  const admin = createSupabaseAdminClient();
  const { data: userData, error: userError } = await admin.auth.admin.getUserById(userId);
  if (userError || !userData.user?.email) {
    throw new Error('تعذّر العثور على المستخدم.');
  }

  const email = userData.user.email.trim().toLowerCase();

  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
  });

  if (linkError || !linkData.properties?.hashed_token) {
    throw new Error(linkError?.message ?? 'تعذّر إنشاء جلسة الدخول.');
  }

  const { data: verifyData, error: verifyError } = await admin.auth.verifyOtp({
    type: 'magiclink',
    token_hash: linkData.properties.hashed_token,
  });

  if (verifyError || !verifyData.session?.access_token || !verifyData.session.refresh_token) {
    throw new Error(verifyError?.message ?? 'تعذّر تفعيل الجلسة.');
  }

  let organizationId: string | null = null;
  const orgResult = await getOrCreateOrganizationForUser({
    userId,
    email,
  }).catch(() => null);
  if (orgResult?.ok) {
    organizationId = orgResult.organizationId;
  }

  return {
    access_token: verifyData.session.access_token,
    refresh_token: verifyData.session.refresh_token,
    userId,
    organizationId,
  };
}

/** يتحقق من كلمة المرور دون إنشاء جلسة (لتسجيل Passkey من شاشة الدخول). */
export async function verifyUserPasswordCredentials(
  email: string,
  password: string
): Promise<{ userId: string; email: string } | null> {
  const config = getSupabasePublicConfig();
  if (!config) return null;

  const client = createClient(config.url, config.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const normalized = email.trim().toLowerCase();
  const { data, error } = await client.auth.signInWithPassword({
    email: normalized,
    password,
  });

  if (error || !data.user?.id) return null;
  await client.auth.signOut().catch(() => undefined);

  return { userId: data.user.id, email: data.user.email ?? normalized };
}
