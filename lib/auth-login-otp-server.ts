import { findAuthUserByEmail } from '@/lib/check-email-registered';
import { parseSupabaseEmailOtp } from '@/lib/supabase-email-otp';
import { issueOtpVerificationBridge, type OtpBridgeIssue } from '@/lib/otp-delivery-bridge';
import { createSupabaseAdminClient } from '@/lib/delete-auth-user-admin';
import { assertValidEmailRedirectTo } from '@/lib/supabase-browser';
import { isResendConfigured, sendLoginOtpEmail } from '@/lib/resend';
import { AsyncTimeoutError, logAuthFlowStep, withTimeout } from '@/lib/async-timeout';

export type SendLoginOtpResult =
  | { ok: true; email: string; userId: string; emailSent: true; otpBridgeCookie: string }
  | { ok: false; code: string; message: string; status: number };

const ADMIN_STEP_MS = 22_000;
const RESEND_STEP_MS = 25_000;
const TOTAL_LOGIN_OTP_MS = 55_000;

function timeoutFailure(label: string, error: unknown): SendLoginOtpResult {
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

function missingOtpFailure(): {
  ok: false;
  code: string;
  message: string;
  status: number;
} {
  return {
    ok: false,
    code: 'otp_unavailable',
    message: 'تعذّر توليد رمز الدخول. حاول مجدداً بعد لحظات أو استخدم كلمة المرور.',
    status: 500,
  };
}

function linkTimeoutFailure(label: string, error: unknown): {
  ok: false;
  code: string;
  message: string;
  status: number;
} {
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

function buildLoginOtpBridge(email: string, parsed: { deliveryOtp: string; verifyToken: string }): string {
  const issue: OtpBridgeIssue = {
    email,
    deliveryOtp: parsed.deliveryOtp,
    verifyToken: parsed.verifyToken,
    otpType: 'magiclink',
  };
  return issueOtpVerificationBridge(issue);
}

async function buildLoginMagicLinkOtp(
  email: string,
  emailRedirectTo: string
): Promise<
  | { ok: true; deliveryOtp: string; verifyToken: string; userId: string }
  | { ok: false; code: string; message: string; status: number }
> {
  const admin = createSupabaseAdminClient();

  logAuthFlowStep('server', 'generateLink:magiclink:start', { email });

  let data;
  let error;
  try {
    ({ data, error } = await withTimeout(
      admin.auth.admin.generateLink({
        type: 'magiclink',
        email,
        options: { redirectTo: emailRedirectTo },
      }),
      ADMIN_STEP_MS,
      'Supabase Admin generateLink (magiclink)'
    ));
  } catch (e) {
    return linkTimeoutFailure('generateLink (magiclink)', e);
  }

  logAuthFlowStep('server', 'generateLink:magiclink:done', { hasError: Boolean(error) });

  if (error) {
    const msg = (error.message ?? '').toLowerCase();
    if (
      msg.includes('user not found') ||
      msg.includes('no user') ||
      error.code === 'user_not_found'
    ) {
      return {
        ok: false,
        code: 'user_not_found',
        message: 'هذا البريد غير مسجل، يرجى إنشاء حساب جديد.',
        status: 404,
      };
    }
    return {
      ok: false,
      code: error.code ?? 'generate_link_failed',
      message: error.message ?? 'تعذّر توليد رمز الدخول.',
      status: 400,
    };
  }

  const userId = data.user?.id;
  const parsed = parseSupabaseEmailOtp(data.properties?.email_otp);

  if (!userId || !parsed) {
    console.error('[auth-login-otp-server] generateLink missing OTP', {
      email,
      hasUserId: Boolean(userId),
      rawOtp: data.properties?.email_otp,
      rawOtpLength: String(data.properties?.email_otp ?? '').replace(/\D/g, '').length,
    });
    logAuthFlowStep('server', 'generateLink:magiclink:missing-otp', {
      hasUserId: Boolean(userId),
      rawOtp: typeof data.properties?.email_otp,
    });
    return missingOtpFailure();
  }

  return { ok: true, deliveryOtp: parsed.deliveryOtp, verifyToken: parsed.verifyToken, userId };
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

  let emailRedirectTo: string;
  try {
    emailRedirectTo = assertValidEmailRedirectTo(params.emailRedirectTo);
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

  const link = await buildLoginMagicLinkOtp(email, emailRedirectTo);
  if (!link.ok) {
    return link;
  }

  const otpBridgeCookie = buildLoginOtpBridge(email, {
    deliveryOtp: link.deliveryOtp,
    verifyToken: link.verifyToken,
  });

  logAuthFlowStep('server', 'resend:login-otp:start', { email });

  try {
    const sendResult = await withTimeout(
      sendLoginOtpEmail({ to: email, otp: link.deliveryOtp }),
      RESEND_STEP_MS,
      'Resend API (login OTP)'
    );
    logAuthFlowStep('server', 'resend:login-otp:done', {
      email,
      usedFallbackFrom: sendResult.usedFallbackFrom,
    });
  } catch (sendError) {
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
    console.error('[auth-login-otp-server] resend_send_failed', {
      email,
      message,
      otpLength: link.deliveryOtp.length,
    });
    if (message === 'INTERNAL_INVALID_SUPABASE_OTP') {
      return missingOtpFailure();
    }
    return { ok: false, code: 'resend_send_failed', message, status: 502 };
  }

  return { ok: true, email, userId: link.userId, emailSent: true, otpBridgeCookie };
}

/** إرسال رمز تسجيل الدخول عبر Resend (بديل لـ Supabase SMTP). */
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
