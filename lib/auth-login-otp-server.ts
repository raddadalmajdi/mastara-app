import { findAuthUserByEmail } from '@/lib/check-email-registered-server';
import { storeOtpSession } from '@/lib/firebase-otp-server';
import { assertValidEmailRedirectTo } from '@/lib/app-env';
import { isResendConfigured, sendLoginOtpEmail } from '@/lib/resend';
import { AsyncTimeoutError, logAuthFlowStep, withTimeout } from '@/lib/async-timeout';
import { logServerException } from '@/lib/server-error-log';

export type SendLoginOtpResult =
  | { ok: true; email: string; userId: string; emailSent: true; otpBridgeCookie: string }
  | { ok: false; code: string; message: string; status: number };

const RESEND_STEP_MS = 25_000;
const TOTAL_LOGIN_OTP_MS = 55_000;

function timeoutFailure(label: string, error: unknown): SendLoginOtpResult {
  logServerException(`auth-login-otp/${label}`, error);
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

async function sendLoginOtpViaResendInner(params: {
  email: string;
  emailRedirectTo: string;
}): Promise<SendLoginOtpResult> {
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
  if (!email) {
    return {
      ok: false,
      code: 'validation',
      message: 'البريد الإلكتروني مطلوب.',
      status: 400,
    };
  }

  const existingUser = await findAuthUserByEmail(email);
  if (!existingUser) {
    return {
      ok: false,
      code: 'user_not_found',
      message: 'هذا البريد غير مسجل، يرجى إنشاء حساب جديد.',
      status: 404,
    };
  }

  let otpSession;
  try {
    otpSession = await storeOtpSession({
      email,
      userId: existingUser.id,
      purpose: 'login',
    });
  } catch (otpError) {
    logServerException('auth-login-otp/storeOtpSession', otpError, { email });
    return {
      ok: false,
      code: 'otp_unavailable',
      message: 'تعذّر توليد رمز الدخول.',
      status: 500,
    };
  }

  logAuthFlowStep('server', 'resend:login-otp:start', { email });

  try {
    const sendResult = await withTimeout(
      sendLoginOtpEmail({ to: email, otp: otpSession.deliveryOtp }),
      RESEND_STEP_MS,
      'Resend API (login OTP)'
    );
    logAuthFlowStep('server', 'resend:login-otp:done', {
      email,
      usedFallbackFrom: sendResult.usedFallbackFrom,
    });
  } catch (sendError) {
    logServerException('auth-login-otp/resend:login-otp', sendError, { email });
    if (sendError instanceof AsyncTimeoutError) {
      return {
        ok: false,
        code: 'request_timeout',
        message: sendError.message,
        status: 504,
      };
    }
    const message =
      sendError instanceof Error ? sendError.message : 'فشل إرسال رمز الدخول عبر Resend.';
    return { ok: false, code: 'resend_send_failed', message, status: 502 };
  }

  return {
    ok: true,
    email,
    userId: existingUser.id,
    emailSent: true,
    otpBridgeCookie: otpSession.otpBridgeCookie,
  };
}

/** إرسال رمز تسجيل الدخول عبر Resend + Firebase OTP. */
export async function sendLoginOtpViaResend(params: {
  email: string;
  emailRedirectTo: string;
}): Promise<SendLoginOtpResult> {
  try {
    return await withTimeout(
      sendLoginOtpViaResendInner(params),
      TOTAL_LOGIN_OTP_MS,
      'إرسال رمز الدخول (كامل)'
    );
  } catch (error) {
    return timeoutFailure('sendLoginOtpViaResend', error);
  }
}
