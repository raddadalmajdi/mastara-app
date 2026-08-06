import type { EmailOtpType } from '@supabase/supabase-js';
import { createSupabaseAdminClient } from '@/lib/delete-auth-user-admin';
import { OTP_CODE_LENGTH } from '@/lib/otp-config';
import {
  clearOtpVerificationBridge,
  resolveOtpVerificationBridge,
} from '@/lib/otp-delivery-bridge';
import type { AuthErrorLike } from '@/lib/auth-errors';
import { getOrCreateOrganizationForUser } from '@/lib/organization-server';

/** أنواع احتياطية واحدة فقط — تجنّب حلقات متعددة تُبطل الرمز في Supabase. */
const SINGLE_FALLBACK: Partial<Record<EmailOtpType, EmailOtpType>> = {
  magiclink: 'email',
  signup: 'email',
  email: 'magiclink',
};

function isWrongTypeError(error: AuthErrorLike): boolean {
  const code = (error.code ?? '').toLowerCase();
  const msg = (error.message ?? '').toLowerCase();
  return (
    code === 'validation_failed' ||
    msg.includes('invalid otp') ||
    msg.includes('invalid token') ||
    msg.includes('token is invalid') ||
    msg.includes('otp type')
  );
}

function isExpiredError(error: AuthErrorLike): boolean {
  const code = (error.code ?? '').toLowerCase();
  const msg = (error.message ?? '').toLowerCase();
  return code === 'otp_expired' || msg.includes('expired') || msg.includes('token has expired');
}

export type VerifyEmailOtpServerResult =
  | {
      ok: true;
      session: { access_token: string; refresh_token: string };
      userId: string;
      organizationId: string | null;
    }
  | { ok: false; code: string; message: string; status: number; error: AuthErrorLike | null };

async function attemptVerifyOtp(params: {
  email: string;
  token: string;
  type: EmailOtpType;
}): Promise<
  | {
      ok: true;
      session: { access_token: string; refresh_token: string };
      userId: string;
    }
  | { ok: false; error: AuthErrorLike }
> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.auth.verifyOtp({
    email: params.email,
    token: params.token,
    type: params.type,
  });

  if (!error && data.session?.access_token && data.session.refresh_token && data.user) {
    return {
      ok: true,
      session: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      },
      userId: data.user.id,
    };
  }

  return { ok: false, error: error ?? { message: 'verifyOtp failed', code: 'otp_invalid' } };
}

export async function verifyEmailOtpOnServer(params: {
  email: string;
  token: string;
  preferredType: EmailOtpType;
  cookieHeader?: string | null;
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

  const bridge = resolveOtpVerificationBridge(
    params.cookieHeader,
    normalizedEmail,
    userToken
  );

  const verifyToken = bridge?.verifyToken ?? userToken;
  const primaryType = bridge?.otpType ?? params.preferredType;

  console.info('[auth-verify-otp-server] verify attempt', {
    email: normalizedEmail,
    hasBridge: Boolean(bridge),
    primaryType,
    tokenLength: verifyToken.length,
  });

  const primary = await attemptVerifyOtp({
    email: normalizedEmail,
    token: verifyToken,
    type: primaryType,
  });

  if (primary.ok) {
    clearOtpVerificationBridge(normalizedEmail);
    const org = await getOrCreateOrganizationForUser({
      userId: primary.userId,
      email: normalizedEmail,
    });
    return {
      ...primary,
      organizationId: org.ok ? org.organizationId : null,
    };
  }

  const primaryError = primary.error;

  // عند وجود جسر موقّع: لا نجرّب أنواعاً أخرى — الرمز صادر عن generateLink بنوع محدد.
  if (bridge) {
    return {
      ok: false,
      code: primaryError.code ?? 'otp_invalid',
      message: primaryError.message ?? 'رمز التحقق غير صحيح أو منتهي.',
      status: 400,
      error: primaryError,
    };
  }

  const fallbackType = SINGLE_FALLBACK[primaryType];
  if (
    fallbackType &&
    fallbackType !== primaryType &&
    isWrongTypeError(primaryError) &&
    !isExpiredError(primaryError)
  ) {
    const fallback = await attemptVerifyOtp({
      email: normalizedEmail,
      token: verifyToken,
      type: fallbackType,
    });

    if (fallback.ok) {
      clearOtpVerificationBridge(normalizedEmail);
      const org = await getOrCreateOrganizationForUser({
        userId: fallback.userId,
        email: normalizedEmail,
      });
      return {
        ...fallback,
        organizationId: org.ok ? org.organizationId : null,
      };
    }

    return {
      ok: false,
      code: fallback.error.code ?? 'otp_invalid',
      message: fallback.error.message ?? 'رمز التحقق غير صحيح أو منتهي.',
      status: 400,
      error: fallback.error,
    };
  }

  return {
    ok: false,
    code: primaryError.code ?? 'otp_invalid',
      message: primaryError.message ?? 'رمز التحقق غير صحيح أو منتهي.',
    status: 400,
    error: primaryError,
  };
}
