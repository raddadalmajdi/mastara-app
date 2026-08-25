import { OTP_CODE_LENGTH } from '@/lib/otp-config';
import {
  clearOtpVerificationBridge,
  resolveOtpVerificationBridge,
} from '@/lib/otp-delivery-bridge';
import type { OtpBridgeType } from '@/lib/otp-delivery-bridge';
import type { AuthErrorLike } from '@/lib/auth-errors';
import { getOrCreateOrganizationForUser } from '@/lib/organization-server';
import {
  createFirebaseSessionBundle,
  markFirebaseEmailVerified,
  verifyOtpSession,
} from '@/lib/firebase-otp-server';

export type VerifyEmailOtpServerResult =
  | {
      ok: true;
      session: { customToken: string };
      userId: string;
      organizationId: string | null;
    }
  | { ok: false; code: string; message: string; status: number; error: AuthErrorLike | null };

export async function verifyEmailOtpOnServer(params: {
  email: string;
  token: string;
  preferredType: OtpBridgeType;
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

  let userId: string | null = null;

  if (bridge) {
    const verified = await verifyOtpSession({ email: normalizedEmail, code: userToken });
    if (!verified.ok) {
      return {
        ok: false,
        code: 'otp_invalid',
        message: verified.message,
        status: 400,
        error: { message: verified.message, code: 'otp_invalid' },
      };
    }
    userId = verified.userId;
  } else {
    const verified = await verifyOtpSession({ email: normalizedEmail, code: userToken });
    if (!verified.ok) {
      return {
        ok: false,
        code: 'otp_invalid',
        message: verified.message,
        status: 400,
        error: { message: verified.message, code: 'otp_invalid' },
      };
    }
    userId = verified.userId;
  }

  if (!userId) {
    return {
      ok: false,
      code: 'otp_invalid',
      message: 'رمز التحقق غير صحيح أو منتهي.',
      status: 400,
      error: null,
    };
  }

  if (params.preferredType === 'signup' || bridge?.otpType === 'signup') {
    await markFirebaseEmailVerified(userId).catch(() => undefined);
  }

  clearOtpVerificationBridge(normalizedEmail);

  const sessionBundle = await createFirebaseSessionBundle(userId);
  const org = await getOrCreateOrganizationForUser({
    userId,
    email: normalizedEmail,
  });

  return {
    ok: true,
    session: { customToken: sessionBundle.customToken },
    userId,
    organizationId: org.ok ? org.organizationId : null,
  };
}
