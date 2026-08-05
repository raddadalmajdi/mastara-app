import { createSupabaseAdminClient } from '@/lib/delete-auth-user-admin';
import { assertValidEmailRedirectTo } from '@/lib/supabase-browser';
import { isResendConfigured, sendSignupVerificationEmail } from '@/lib/resend';
import { AsyncTimeoutError, logAuthFlowStep, withTimeout } from '@/lib/async-timeout';
import { DUPLICATE_EMAIL_MESSAGE } from '@/lib/check-email-registered';
import { parseSupabaseEmailOtp } from '@/lib/supabase-email-otp';
import { issueOtpVerificationBridge, type OtpBridgeIssue } from '@/lib/otp-delivery-bridge';

export type ServerSignUpResult =
  | { ok: true; email: string; userId: string; emailSent: true; otpBridgeCookie: string }
  | { ok: false; code: string; message: string; status: number };

const ADMIN_STEP_MS = 22_000;
const RESEND_STEP_MS = 25_000;
const TOTAL_SIGNUP_MS = 55_000;

function isExistingUserError(message: string, code?: string): boolean {
  const m = message.toLowerCase();
  return (
    code === 'email_exists' ||
    m.includes('already registered') ||
    m.includes('already been registered') ||
    m.includes('user already exists')
  );
}

/** يُعاد عندما ينجح إنشاء/جلب المستخدم لكن Supabase لم يُرجع رمز OTP (لا نملك بديلاً عبر رابط بعد الآن). */
function missingOtpFailure(): ServerSignUpResult {
  return {
    ok: false,
    code: 'otp_unavailable',
    message: 'تعذّر توليد رمز التحقق من Supabase. حاول مجدداً بعد لحظات أو تواصل مع الدعم.',
    status: 500,
  };
}

function timeoutFailure(label: string, error: unknown): ServerSignUpResult {
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

type LinkBuildResult =
  | { ok: true; actionLink: string; deliveryOtp: string; verifyToken: string; userId: string }
  | { ok: false; code: string; message: string; status: number };

function buildSignupOtpBridge(email: string, deliveryOtp: string, verifyToken: string): string {
  const issue: OtpBridgeIssue = {
    email,
    deliveryOtp,
    verifyToken,
    otpType: 'signup',
  };
  return issueOtpVerificationBridge(issue);
}

function linkTimeoutFailure(label: string, error: unknown): LinkBuildResult {
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

async function buildSignupLink(
  email: string,
  password: string,
  emailRedirectTo: string
): Promise<LinkBuildResult> {
  const admin = createSupabaseAdminClient();

  logAuthFlowStep('server', 'generateLink:start', { email });

  let data;
  let error;
  try {
    ({ data, error } = await withTimeout(
      admin.auth.admin.generateLink({
        type: 'signup',
        email,
        password,
        options: { redirectTo: emailRedirectTo },
      }),
      ADMIN_STEP_MS,
      'Supabase Admin generateLink'
    ));
  } catch (e) {
    return linkTimeoutFailure('generateLink', e);
  }

  logAuthFlowStep('server', 'generateLink:done', { hasError: Boolean(error) });

  if (error) {
    const msg = error.message ?? 'تعذّر توليد رمز التفعيل.';
    if (isExistingUserError(msg, error.code)) {
      return {
        ok: false,
        code: 'user_exists',
        message: DUPLICATE_EMAIL_MESSAGE,
        status: 409,
      };
    }
    return { ok: false, code: error.code ?? 'generate_link_failed', message: msg, status: 400 };
  }

  const actionLink = data.properties?.action_link;
  const userId = data.user?.id;

  if (!actionLink || !userId) {
    return {
      ok: false,
      code: 'missing_link',
      message: 'لم يُرجع Supabase بيانات تفعيل صالحة.',
      status: 500,
    };
  }

  const parsed = parseSupabaseEmailOtp(data.properties?.email_otp);
  if (!parsed) {
    return {
      ok: false,
      code: 'otp_unavailable',
      message: 'تعذّر توليد رمز التحقق من Supabase.',
      status: 500,
    };
  }

  return {
    ok: true,
    actionLink,
    deliveryOtp: parsed.deliveryOtp,
    verifyToken: parsed.verifyToken,
    userId,
  };
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

  let emailRedirectTo: string;
  try {
    emailRedirectTo = assertValidEmailRedirectTo(params.emailRedirectTo);
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

  const admin = createSupabaseAdminClient();

  logAuthFlowStep('server', 'createUser:start', { email });

  let created;
  let createError;
  try {
    ({ data: created, error: createError } = await withTimeout(
      admin.auth.admin.createUser({
        email,
        password: params.password,
        email_confirm: false,
      }),
      ADMIN_STEP_MS,
      'Supabase Admin createUser'
    ));
  } catch (e) {
    return timeoutFailure('createUser', e);
  }

  logAuthFlowStep('server', 'createUser:done', {
    hasUser: Boolean(created?.user?.id),
    createError: createError?.message,
  });

  if (createError && !isExistingUserError(createError.message, createError.code)) {
    return {
      ok: false,
      code: createError.code ?? 'create_user_failed',
      message: createError.message,
      status: 400,
    };
  }

  if (createError && isExistingUserError(createError.message, createError.code)) {
    return {
      ok: false,
      code: 'user_exists',
      message:
        'هذا البريد مسجّل مسبقاً. انتقل إلى «تسجيل الدخول» أو استخدم «إعادة إرسال» التفعيل.',
      status: 409,
    };
  }

  const userId = created?.user?.id;
  if (!userId) {
    return {
      ok: false,
      code: 'create_user_failed',
      message: 'تعذّر إنشاء المستخدم.',
      status: 500,
    };
  }

  const link = await buildSignupLink(email, params.password, emailRedirectTo);
  if (!link.ok) {
    await admin.auth.admin.deleteUser(userId).catch(() => undefined);
    return link;
  }

  const otpBridgeCookie = buildSignupOtpBridge(
    email,
    link.deliveryOtp,
    link.verifyToken
  );

  logAuthFlowStep('server', 'resend:send:start', { email });

  try {
    const sendResult = await withTimeout(
      sendSignupVerificationEmail({
        to: email,
        otp: link.deliveryOtp,
      }),
      RESEND_STEP_MS,
      'Resend API'
    );
    logAuthFlowStep('server', 'resend:send:done', {
      email,
      usedFallbackFrom: sendResult.usedFallbackFrom,
    });
  } catch (sendError) {
    // فشل الإرسال فعلياً (حتى بعد محاولة النطاق الاحتياطي) — نتراجع عن إنشاء
    // المستخدم كي لا يبقى حساب بلا أي وسيلة تفعيل ممكنة.
    await admin.auth.admin.deleteUser(userId).catch(() => undefined);
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
    console.error('[auth-sign-up-server] resend_send_failed', {
      email,
      message,
      otpLength: link.deliveryOtp.length,
    });
    return { ok: false, code: 'resend_send_failed', message, status: 502 };
  }

  return { ok: true, email, userId, emailSent: true, otpBridgeCookie };
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

/** إعادة إرسال بريد التفعيل (حساب موجود وغير مؤكد) عبر Resend. */
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

  let emailRedirectTo: string;
  try {
    emailRedirectTo = assertValidEmailRedirectTo(params.emailRedirectTo);
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

  const link = await buildSignupLink(email, params.password, emailRedirectTo);
  if (!link.ok) {
    return link;
  }

  const otpBridgeCookie = buildSignupOtpBridge(
    email,
    link.deliveryOtp,
    link.verifyToken
  );

  try {
    const sendResult = await withTimeout(
      sendSignupVerificationEmail({
        to: email,
        otp: link.deliveryOtp,
      }),
      RESEND_STEP_MS,
      'Resend API'
    );
    logAuthFlowStep('server', 'resend:resend-verification:done', {
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
      sendError instanceof Error ? sendError.message : 'فشل إرسال البريد عبر Resend.';
    console.error('[auth-sign-up-server] resend_send_failed (resend-verification)', {
      email,
      message,
      otpLength: link.deliveryOtp.length,
    });
    return { ok: false, code: 'resend_send_failed', message, status: 502 };
  }

  return { ok: true, email, userId: link.userId, emailSent: true, otpBridgeCookie };
}
