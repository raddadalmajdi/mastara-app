import { findAuthUserByEmail } from '@/lib/check-email-registered-server';
import { DUPLICATE_EMAIL_MESSAGE } from '@/lib/check-email-registered';
import { getFirebaseAdminAuth } from '@/lib/firebase-admin';
import { storeOtpSession } from '@/lib/firebase-otp-server';
import { assertValidEmailRedirectTo } from '@/lib/app-env';
import { isResendConfigured, sendSignupVerificationEmail } from '@/lib/resend';
import { AsyncTimeoutError, logAuthFlowStep, withTimeout } from '@/lib/async-timeout';
import { getOrCreateOrganizationForUser } from '@/lib/organization-server';
import { logServerException } from '@/lib/server-error-log';

export type ServerSignUpResult =
  | { ok: true; email: string; userId: string; emailSent: true; otpBridgeCookie: string }
  | { ok: false; code: string; message: string; status: number };

const ADMIN_STEP_MS = 22_000;
const RESEND_STEP_MS = 25_000;
const TOTAL_SIGNUP_MS = 55_000;

function timeoutFailure(label: string, error: unknown): ServerSignUpResult {
  logServerException(`auth-sign-up/${label}`, error);
  if (error instanceof AsyncTimeoutError) {
    return {
      ok: false,
      code: 'request_timeout',
      message: error.message,
      status: 504,
    };
  }
  const message = error instanceof Error ? error.message : `فشل ${label}.`;
  return { ok: false, code: 'internal_error', message, status: 500 };
}

function isExistingUserError(error: unknown): boolean {
  const code = (error as { code?: string }).code;
  if (code === 'auth/email-already-exists') return true;
  const msg = (error instanceof Error ? error.message : '').toLowerCase();
  return msg.includes('already exists') || msg.includes('email-already');
}

async function registerUserWithResendVerificationInner(params: {
  email: string;
  password: string;
  emailRedirectTo: string;
}): Promise<ServerSignUpResult> {
  if (!isResendConfigured()) {
    return {
      ok: false,
      code: 'resend_not_configured',
      message: 'RESEND_API_KEY غير مضبوط على الخادم.',
      status: 501,
    };
  }

  try {
    assertValidEmailRedirectTo(params.emailRedirectTo);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'emailRedirectTo غير صالح.';
    return { ok: false, code: 'invalid_redirect', message, status: 400 };
  }

  const email = params.email.trim().toLowerCase();
  if (!email || !params.password) {
    return {
      ok: false,
      code: 'validation',
      message: 'البريد وكلمة المرور مطلوبان.',
      status: 400,
    };
  }

  const existing = await findAuthUserByEmail(email);
  if (existing) {
    return {
      ok: false,
      code: 'user_exists',
      message: DUPLICATE_EMAIL_MESSAGE,
      status: 409,
    };
  }

  const auth = getFirebaseAdminAuth();
  logAuthFlowStep('server', 'createUser:start', { email });

  let userId: string;
  try {
    const created = await withTimeout(
      auth.createUser({
        email,
        password: params.password,
        emailVerified: false,
      }),
      ADMIN_STEP_MS,
      'Firebase Admin createUser'
    );
    userId = created.uid;
  } catch (error) {
    if (isExistingUserError(error)) {
      return {
        ok: false,
        code: 'user_exists',
        message: DUPLICATE_EMAIL_MESSAGE,
        status: 409,
      };
    }
    logServerException('auth-sign-up/createUser', error, { email });
    const message = error instanceof Error ? error.message : 'تعذّر إنشاء المستخدم.';
    return { ok: false, code: 'create_user_failed', message, status: 400 };
  }

  logAuthFlowStep('server', 'createUser:done', { userId });

  const orgResult = await getOrCreateOrganizationForUser({ userId, email });
  if (!orgResult.ok) {
    await auth.deleteUser(userId).catch(() => undefined);
    return {
      ok: false,
      code: 'organization_failed',
      message: orgResult.message,
      status: 500,
    };
  }

  let otpSession;
  try {
    otpSession = await storeOtpSession({ email, userId, purpose: 'signup' });
  } catch (otpError) {
    await auth.deleteUser(userId).catch(() => undefined);
    logServerException('auth-sign-up/storeOtpSession', otpError, { email, userId });
    return {
      ok: false,
      code: 'otp_unavailable',
      message: 'تعذّر توليد رمز التحقق.',
      status: 500,
    };
  }

  logAuthFlowStep('server', 'resend:send:start', { email });

  try {
    const sendResult = await withTimeout(
      sendSignupVerificationEmail({
        to: email,
        otp: otpSession.deliveryOtp,
      }),
      RESEND_STEP_MS,
      'Resend API'
    );
    logAuthFlowStep('server', 'resend:send:done', {
      email,
      usedFallbackFrom: sendResult.usedFallbackFrom,
    });
  } catch (sendError) {
    logServerException('auth-sign-up/resend:send', sendError, {
      email,
      otpLength: otpSession.deliveryOtp.length,
      userId,
    });
    await auth.deleteUser(userId).catch(() => undefined);
    if (sendError instanceof AsyncTimeoutError) {
      return {
        ok: false,
        code: 'request_timeout',
        message: sendError.message,
        status: 504,
      };
    }
    const message =
      sendError instanceof Error ? sendError.message : 'فشل إرسال البريد عبر Resend.';
    return { ok: false, code: 'resend_send_failed', message, status: 502 };
  }

  return {
    ok: true,
    email,
    userId,
    emailSent: true,
    otpBridgeCookie: otpSession.otpBridgeCookie,
  };
}

export async function registerUserWithResendVerification(params: {
  email: string;
  password: string;
  emailRedirectTo: string;
}): Promise<ServerSignUpResult> {
  try {
    return await withTimeout(
      registerUserWithResendVerificationInner(params),
      TOTAL_SIGNUP_MS,
      'إنشاء الحساب (كامل)'
    );
  } catch (error) {
    return timeoutFailure('registerUserWithResendVerification', error);
  }
}

export async function resendSignupVerificationEmail(params: {
  email: string;
  password: string;
  emailRedirectTo: string;
}): Promise<ServerSignUpResult> {
  try {
    return await withTimeout(
      resendSignupVerificationEmailInner(params),
      TOTAL_SIGNUP_MS,
      'إعادة إرسال التفعيل'
    );
  } catch (error) {
    return timeoutFailure('resendSignupVerificationEmail', error);
  }
}

async function resendSignupVerificationEmailInner(params: {
  email: string;
  password: string;
  emailRedirectTo: string;
}): Promise<ServerSignUpResult> {
  if (!isResendConfigured()) {
    return {
      ok: false,
      code: 'resend_not_configured',
      message: 'RESEND_API_KEY غير مضبوط على الخادم.',
      status: 501,
    };
  }

  try {
    assertValidEmailRedirectTo(params.emailRedirectTo);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'emailRedirectTo غير صالح.';
    return { ok: false, code: 'invalid_redirect', message, status: 400 };
  }

  const email = params.email.trim().toLowerCase();
  if (!email || !params.password) {
    return {
      ok: false,
      code: 'validation',
      message: 'البريد وكلمة المرور مطلوبان لإعادة إرسال التفعيل.',
      status: 400,
    };
  }

  const matched = await findAuthUserByEmail(email);
  if (!matched) {
    return {
      ok: false,
      code: 'user_not_found',
      message: 'هذا البريد غير مسجل، يرجى إنشاء حساب جديد.',
      status: 404,
    };
  }

  const auth = getFirebaseAdminAuth();
  await auth.updateUser(matched.id, { password: params.password }).catch(() => undefined);

  let otpSession;
  try {
    otpSession = await storeOtpSession({ email, userId: matched.id, purpose: 'signup' });
  } catch (otpError) {
    logServerException('auth-sign-up/resend:storeOtpSession', otpError, { email });
    return {
      ok: false,
      code: 'otp_unavailable',
      message: 'تعذّر توليد رمز التحقق.',
      status: 500,
    };
  }

  try {
    const sendResult = await withTimeout(
      sendSignupVerificationEmail({
        to: email,
        otp: otpSession.deliveryOtp,
      }),
      RESEND_STEP_MS,
      'Resend API'
    );
    logAuthFlowStep('server', 'resend:resend-verification:done', {
      email,
      usedFallbackFrom: sendResult.usedFallbackFrom,
    });
  } catch (sendError) {
    logServerException('auth-sign-up/resend:resend-verification', sendError, { email });
    if (sendError instanceof AsyncTimeoutError) {
      return {
        ok: false,
        code: 'request_timeout',
        message: sendError.message,
        status: 504,
      };
    }
    const message =
      sendError instanceof Error ? sendError.message : 'فشل إرسال البريد عبر Resend.';
    return { ok: false, code: 'resend_send_failed', message, status: 502 };
  }

  return {
    ok: true,
    email,
    userId: matched.id,
    emailSent: true,
    otpBridgeCookie: otpSession.otpBridgeCookie,
  };
}
