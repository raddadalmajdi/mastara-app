import type { AuthErrorLike } from '@/lib/auth-errors';
import { fetchWithTimeout, isAsyncTimeoutError, logAuthFlowStep } from '@/lib/async-timeout';

type LoginOtpApiSuccess = {
  ok: true;
  emailSentViaResend?: boolean;
  user?: { id: string; email?: string };
};

type LoginOtpApiFailure = {
  ok: false;
  code?: string;
  message?: string;
};

const LOGIN_OTP_FETCH_MS = 50_000;

function authErrorFromUnknown(error: unknown, fallbackCode: string): AuthErrorLike {
  if (isAsyncTimeoutError(error)) {
    return { message: error.message, code: 'request_timeout' };
  }
  if (error instanceof Error) {
    return { message: error.message, code: fallbackCode };
  }
  return { message: 'تعذّر إكمال الطلب.', code: fallbackCode };
}

async function parseLoginOtpApiResponse(
  res: Response
): Promise<LoginOtpApiSuccess | LoginOtpApiFailure | { unavailable: true }> {
  if (res.status === 501) {
    return { unavailable: true };
  }

  let json: LoginOtpApiSuccess | LoginOtpApiFailure;
  try {
    json = (await res.json()) as LoginOtpApiSuccess | LoginOtpApiFailure;
  } catch {
    return {
      ok: false,
      code: 'invalid_response',
      message: 'استجابة غير متوقعة من خادم إرسال رمز الدخول.',
    };
  }

  return json;
}

export type SendLoginOtpApiResult =
  | { ok: true; emailSentViaResend: true }
  | { ok: false; error: AuthErrorLike }
  | { unavailable: true };

/** إرسال رمز الدخول عبر `/api/auth/send-login-otp` + Resend؛ يُرجع unavailable إذا لم يُضبط RESEND_API_KEY. */
export async function trySendLoginOtpViaResendApi(params: {
  email: string;
  emailRedirectTo: string;
}): Promise<SendLoginOtpApiResult> {
  logAuthFlowStep('client', 'fetch:/api/auth/send-login-otp:start');

  let res: Response;
  try {
    res = await fetchWithTimeout('/api/auth/send-login-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(params),
      timeoutMs: LOGIN_OTP_FETCH_MS,
    });
  } catch (error) {
    logAuthFlowStep('client', 'fetch:/api/auth/send-login-otp:failed');
    return {
      ok: false,
      error: authErrorFromUnknown(error, 'network_error'),
    };
  }

  logAuthFlowStep('client', 'fetch:/api/auth/send-login-otp:done', { status: res.status });

  const parsed = await parseLoginOtpApiResponse(res);

  if ('unavailable' in parsed) {
    logAuthFlowStep('client', 'login-otp-resend-api-unavailable (501)');
    return { unavailable: true };
  }

  if (!parsed.ok) {
    return {
      ok: false,
      error: {
        message: parsed.message ?? 'تعذّر إرسال رمز الدخول.',
        code: parsed.code,
      },
    };
  }

  return { ok: true, emailSentViaResend: true };
}
