import { getFirebaseIdToken, isFirebaseConfigured } from '@/lib/firebase-auth-client';
import { getFirebaseAuthClient } from '@/lib/firebase';

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
 * يحلّ جلسة Firebase Auth في المتصفح بأمان — بدون رمي أخطاء.
 */
export async function resolveClientSession(): Promise<ClientSessionResult> {
  if (!isFirebaseConfigured()) {
    return {
      ok: false,
      reason: 'not_configured',
      message: 'إعداد Firebase غير مكتمل.',
    };
  }

  if (typeof window === 'undefined') {
    return {
      ok: false,
      reason: 'no_client',
      message: 'تعذّر تهيئة عميل Firebase في المتصفح.',
    };
  }

  try {
    const user = getFirebaseAuthClient().currentUser;
    if (!user) {
      return {
        ok: false,
        reason: 'no_session',
        message: 'لا توجد جلسة نشطة — سجّل الدخول للمتابعة.',
      };
    }

    const accessToken = await getFirebaseIdToken();
    if (!accessToken) {
      return {
        ok: false,
        reason: 'no_session',
        message: 'لا توجد جلسة نشطة — سجّل الدخول للمتابعة.',
      };
    }

    return {
      ok: true,
      accessToken,
      userId: user.uid,
      email: user.email ?? undefined,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'خطأ غير متوقع أثناء قراءة الجلسة.';
    console.warn('[auth-session] unexpected error:', message);
    return { ok: false, reason: 'session_error', message };
  }
}
