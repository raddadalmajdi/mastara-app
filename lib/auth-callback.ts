import type { EmailOtpType, SupabaseClient } from '@supabase/supabase-js';
import { mapAuthErrorToArabic, type AuthErrorLike } from '@/lib/auth-errors';
import { OTP_LENGTH_AR } from '@/lib/otp-config';

export type AuthCallbackResult =
  | { ok: true }
  | { ok: false; message: string; error?: AuthErrorLike };

const CALLBACK_NO_SESSION_MESSAGE =
  `لم نتمكن من تأكيد حسابك تلقائياً. ارجع لصفحة تسجيل الدخول وأدخل رمز التحقق (${OTP_LENGTH_AR}) المرسل إلى بريدك.`;

function normalizeOtpType(raw: string | null): EmailOtpType {
  const allowed: EmailOtpType[] = ['signup', 'email', 'recovery', 'invite', 'magiclink', 'email_change'];
  if (raw && allowed.includes(raw as EmailOtpType)) {
    return raw as EmailOtpType;
  }
  return 'email';
}

export async function completeAuthFromCallbackParams(
  supabase: SupabaseClient,
  params: {
    code: string | null;
    tokenHash: string | null;
    type: string | null;
    error: string | null;
    errorDescription: string | null;
  }
): Promise<AuthCallbackResult> {
  if (params.error) {
    const desc = params.errorDescription?.replace(/\+/g, ' ') ?? params.error;
    return {
      ok: false,
      message: mapAuthErrorToArabic({ message: desc, code: params.error }),
      error: { message: desc, code: params.error },
    };
  }

  if (params.tokenHash) {
    const primaryType = normalizeOtpType(params.type);
    const types: EmailOtpType[] = [
      primaryType,
      ...(['signup', 'email', 'magiclink'] as EmailOtpType[]).filter((t) => t !== primaryType),
    ];

    let lastError: AuthErrorLike | null = null;
    for (const type of types) {
      const { error } = await supabase.auth.verifyOtp({
        token_hash: params.tokenHash,
        type,
      });
      if (!error) {
        lastError = null;
        break;
      }
      lastError = error;
    }

    if (lastError) {
      return { ok: false, message: mapAuthErrorToArabic(lastError), error: lastError };
    }
  } else if (params.code) {
    const { error } = await supabase.auth.exchangeCodeForSession(params.code);
    if (error) {
      return { ok: false, message: mapAuthErrorToArabic(error), error };
    }
  }

  await new Promise((resolve) => window.setTimeout(resolve, 250));

  for (let attempt = 0; attempt < 3; attempt++) {
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError) {
      return { ok: false, message: mapAuthErrorToArabic(sessionError), error: sessionError };
    }

    if (session?.user) {
      return { ok: true };
    }

    if (attempt < 2) {
      await new Promise((resolve) => window.setTimeout(resolve, 400));
    }
  }

  return {
    ok: false,
    message: CALLBACK_NO_SESSION_MESSAGE,
  };
}
