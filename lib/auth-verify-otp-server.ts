import type { EmailOtpType } from '@supabase/supabase-js';
import { createSupabaseAdminClient } from '@/lib/delete-auth-user-admin';
import { OTP_CODE_LENGTH } from '@/lib/otp-config';
import {
  clearOtpDeliveryBridge,
  resolveVerifyTokenForDelivery,
} from '@/lib/otp-delivery-bridge';
import type { AuthErrorLike } from '@/lib/auth-errors';

const FALLBACK_TYPES: EmailOtpType[] = ['signup', 'email', 'magiclink'];

export type VerifyEmailOtpServerResult =
  | {
      ok: true;
      session: { access_token: string; refresh_token: string };
      userId: string;
    }
  | { ok: false; code: string; message: string; status: number; error: AuthErrorLike | null };

export async function verifyEmailOtpOnServer(params: {
  email: string;
  token: string;
  preferredType: EmailOtpType;
}): Promise<VerifyEmailOtpServerResult> {
  const normalizedEmail = params.email.trim().toLowerCase();
  const userToken = params.token.replace(/\D/g, '');

  if (!normalizedEmail) {
    return {
      ok: false,
      code: 'validation',
      message: 'البريد الإلكتروني مطلوب.',
      status: 400,
      error: null,
    };
  }

  if (userToken.length !== OTP_CODE_LENGTH) {
    return {
      ok: false,
      code: 'invalid_token',
      message: `رمز التحقق يجب أن يكون ${OTP_CODE_LENGTH} أرقام.`,
      status: 400,
      error: null,
    };
  }

  const bridgedToken = resolveVerifyTokenForDelivery(normalizedEmail, userToken);
  const verifyToken = bridgedToken ?? userToken;

  const admin = createSupabaseAdminClient();
  const order = [
    params.preferredType,
    ...FALLBACK_TYPES.filter((t) => t !== params.preferredType),
  ];

  let lastError: AuthErrorLike | null = null;

  for (const type of order) {
    const { data, error } = await admin.auth.verifyOtp({
      email: normalizedEmail,
      token: verifyToken,
      type,
    });

    if (!error && data.session?.access_token && data.session.refresh_token && data.user) {
      clearOtpDeliveryBridge(normalizedEmail);
      return {
        ok: true,
        session: {
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
        },
        userId: data.user.id,
      };
    }

    if (error) {
      lastError = error;
    }
  }

  return {
    ok: false,
    code: lastError?.code ?? 'otp_invalid',
    message: lastError?.message ?? 'رمز التحقق غير صحيح أو منتهي.',
    status: 400,
    error: lastError,
  };
}
