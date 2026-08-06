import type { SupabaseClient } from '@supabase/supabase-js';
import {
  diagnoseSupabasePublicConfig,
  formatSupabaseConfigIssues,
} from '@/lib/supabase/env';

export type ClientSessionFailureReason =
  | 'not_configured'
  | 'no_client'
  | 'no_session'
  | 'session_error';

export type ClientSessionResult =
  | {
      ok: true;
      accessToken: string;
      userId: string;
      email: string | undefined;
    }
  | {
      ok: false;
      reason: ClientSessionFailureReason;
      message: string;
    };

/**
 * يحلّ جلسة Supabase في المتصفح بأمان — بدون رمي أخطاء.
 * يُستخدم في صفحات محمية (مثل /billing) لعرض fallback بدل الانهيار.
 */
export async function resolveClientSession(
  supabase: SupabaseClient | null
): Promise<ClientSessionResult> {
  const diagnostic = diagnoseSupabasePublicConfig();
  if (!diagnostic.ok) {
    const message = formatSupabaseConfigIssues(diagnostic.issues);
    if (process.env.NODE_ENV === 'development') {
      console.error('[auth-session] Supabase not configured:', message);
    }
    return { ok: false, reason: 'not_configured', message };
  }

  if (!supabase) {
    return {
      ok: false,
      reason: 'no_client',
      message: 'تعذّر تهيئة عميل Supabase في المتصفح.',
    };
  }

  try {
    const { data, error } = await supabase.auth.getSession();

    if (error) {
      console.warn('[auth-session] getSession failed:', error.message);
      return {
        ok: false,
        reason: 'session_error',
        message: error.message || 'تعذّر قراءة الجلسة.',
      };
    }

    const session = data.session;
    if (!session?.access_token || !session.user?.id) {
      return {
        ok: false,
        reason: 'no_session',
        message: 'لا توجد جلسة نشطة — سجّل الدخول للمتابعة.',
      };
    }

    return {
      ok: true,
      accessToken: session.access_token,
      userId: session.user.id,
      email: session.user.email,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'خطأ غير متوقع أثناء قراءة الجلسة.';
    console.warn('[auth-session] unexpected error:', message);
    return { ok: false, reason: 'session_error', message };
  }
}
