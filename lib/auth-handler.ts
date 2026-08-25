import { mapAuthErrorToArabic, type AuthErrorLike } from '@/lib/auth-errors';
import { DUPLICATE_EMAIL_MESSAGE } from '@/lib/check-email-registered';
import type { SignUpSessionStub } from '@/lib/auth-sign-up';

export type SignUpFlowResult =
  | { kind: 'logged_in' }
  | { kind: 'needs_verification' }
  | { kind: 'error'; message: string };

/** يفسّر استجابة signUp بعد Resend (جلسة فورية أو انتظار تفعيل أو خطأ). */
export function resolveSignUpFlow(
  data: SignUpSessionStub | null,
  error: AuthErrorLike | null | undefined,
  meta?: { emailRedirectTo?: string; recoveredAfterServerError?: boolean }
): SignUpFlowResult {
  void meta;

  if (error) {
    return { kind: 'error', message: mapAuthErrorToArabic(error, 'signup') };
  }

  if (!data) {
    return {
      kind: 'error',
      message: 'حدث خطأ غير متوقع، يرجى المحاولة مرة أخرى.',
    };
  }

  if (data.user?.emailVerified) {
    return { kind: 'logged_in' };
  }

  const identities = data.user?.identities;
  if (identities && identities.length === 0) {
    return {
      kind: 'error',
      message: DUPLICATE_EMAIL_MESSAGE,
    };
  }

  return { kind: 'needs_verification' };
}
