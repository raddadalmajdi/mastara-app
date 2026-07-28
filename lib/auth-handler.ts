import type { AuthResponse } from '@supabase/supabase-js';
import { mapAuthErrorToArabic, logSupabaseAuthError, type AuthErrorLike } from '@/lib/auth-errors';
import { logSupabaseAuthErrorJson } from '@/lib/auth-debug';

export type SignUpFlowResult =
  | { kind: 'logged_in' }
  | { kind: 'needs_verification' }
  | { kind: 'error'; message: string };

/** يفسّر استجابة signUp بعد SMTP/Resend (جلسة فورية أو انتظار تفعيل أو خطأ). */
export function resolveSignUpFlow(
  data: AuthResponse['data'] | null,
  error: AuthErrorLike | null | undefined,
  meta?: { emailRedirectTo?: string; recoveredAfterServerError?: boolean }
): SignUpFlowResult {
  if (error) {
    logSupabaseAuthErrorJson(error, 'signUp');
    logSupabaseAuthError(error, 'signUp');
    return { kind: 'error', message: mapAuthErrorToArabic(error) };
  }

  if (!data) {
    return {
      kind: 'error',
      message: 'حدث خطأ غير متوقع، يرجى المحاولة مرة أخرى.',
    };
  }

  if (data.session?.user) {
    return { kind: 'logged_in' };
  }

  const identities = data.user?.identities;
  if (identities && identities.length === 0) {
    return {
      kind: 'error',
      message:
        'هذا البريد مسجّل مسبقاً. انتقل إلى «تسجيل الدخول» أو استخدم «رمز الدخول (OTP)» إن نسيت كلمة المرور.',
    };
  }

  return { kind: 'needs_verification' };
}

export { verifyEmailOtpFlexible } from '@/lib/auth-verify-otp';
