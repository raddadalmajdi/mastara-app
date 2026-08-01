import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { findAuthUserByEmail } from '@/lib/check-email-registered';
import { looksLikeJwt, normalizeSupabaseProjectUrl } from '@/lib/supabase/env';

export type DeleteAuthUserResult =
  | {
      ok: true;
      email: string;
      userId: string;
      message: string;
    }
  | {
      ok: false;
      email: string;
      message: string;
    };

export function createSupabaseAdminClient(): SupabaseClient {
  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!rawUrl) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL');
  }
  if (!serviceRoleKey) {
    throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY (server-only, never expose to client)');
  }

  // يُطبَّع الـ URL إلى origin المشروع فقط (بدون /rest/v1 أو /auth/v1 أو أي مسار آخر).
  // وجود مسار زائد هنا يتسبب في أخطاء غامضة من Supabase مثل:
  // "Invalid path specified in request URL" على كل نداءات Admin API (createUser, generateLink, ...).
  const url = normalizeSupabaseProjectUrl(rawUrl);
  if (!url) {
    throw new Error(
      `NEXT_PUBLIC_SUPABASE_URL غير صالح: "${rawUrl}". المتوقع: https://<project-ref>.supabase.co بدون أي مسار إضافي.`
    );
  }

  if (!looksLikeJwt(serviceRoleKey)) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY لا يبدو JWT صالحاً (تحقق من عدم دمجه بنص آخر في .env.local عن طريق الخطأ). ' +
        `الطول الحالي: ${serviceRoleKey.length}.`
    );
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export async function deleteAuthUserByEmail(email: string): Promise<DeleteAuthUserResult> {
  const normalized = email.trim().toLowerCase();

  if (!normalized) {
    return { ok: false, email: normalized, message: 'البريد الإلكتروني فارغ.' };
  }

  const matchedUser = await findAuthUserByEmail(normalized);

  if (!matchedUser) {
    return {
      ok: false,
      email: normalized,
      message: `لا يوجد مستخدم Auth بالبريد ${normalized} — يمكنك إنشاء حساب جديد من واجهة التسجيل.`,
    };
  }

  const admin = createSupabaseAdminClient();
  const { error: deleteError } = await admin.auth.admin.deleteUser(matchedUser.id);
  if (deleteError) {
    throw deleteError;
  }

  return {
    ok: true,
    email: matchedUser.email ?? normalized,
    userId: matchedUser.id,
    message: `تم حذف المستخدم نهائياً من Auth (${matchedUser.email ?? normalized}).`,
  };
}
