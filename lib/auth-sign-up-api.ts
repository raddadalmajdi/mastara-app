import type { SignUpExecutionResult, SignUpSessionStub } from '@/lib/auth-sign-up';
import type { AuthErrorLike } from '@/lib/auth-errors';
import { fetchWithTimeout, isAsyncTimeoutError, logAuthFlowStep } from '@/lib/async-timeout';

type SignUpApiSuccess = {
  ok: true;
  needsVerification?: boolean;
  emailSentViaResend?: boolean;
  user?: { id: string; email?: string };
};

type SignUpApiFailure = {
  ok: false;
  code?: string;
  message?: string;
};

const SIGNUP_FETCH_MS = 50_000;

async function parseSignUpApiResponse(
  res: Response
): Promise<SignUpApiSuccess | SignUpApiFailure | { unavailable: true }> {
  if (res.status === 501) {
    return { unavailable: true };
  }

  let json: SignUpApiSuccess | SignUpApiFailure;
  try {
    json = (await res.json()) as SignUpApiSuccess | SignUpApiFailure;
  } catch {
    return {
      ok: false,
      code: 'invalid_response',
      message: 'استجابة غير متوقعة من خادم التسجيل.',
    };
  }

  return json;
}

function authErrorFromUnknown(error: unknown, fallbackCode: string): AuthErrorLike {
  if (isAsyncTimeoutError(error)) {
    return { message: error.message, code: 'request_timeout' };
  }
  if (error instanceof Error) {
    return { message: error.message, code: fallbackCode };
  }
  return { message: 'تعذّر إكمال الطلب.', code: fallbackCode };
}

/** تسجيل عبر `/api/auth/sign-up` + Resend؛ يُرجع null إذا لم يُضبط RESEND_API_KEY. */
export async function trySignUpViaResendApi(params: {
  email: string;
  password: string;
  emailRedirectTo: string;
}): Promise<SignUpExecutionResult | null> {
  const emailRedirectTo = params.emailRedirectTo;

  logAuthFlowStep('client', 'fetch:/api/auth/sign-up:start');

  let res: Response;
  try {
    res = await fetchWithTimeout('/api/auth/sign-up', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(params),
      timeoutMs: SIGNUP_FETCH_MS,
    });
  } catch (error) {
    logAuthFlowStep('client', 'fetch:/api/auth/sign-up:failed');
    return {
      data: null,
      error: authErrorFromUnknown(error, 'network_error'),
      emailRedirectTo,
    };
  }

  logAuthFlowStep('client', 'fetch:/api/auth/sign-up:done', { status: res.status });

  const parsed = await parseSignUpApiResponse(res);

  if ('unavailable' in parsed) {
    logAuthFlowStep('client', 'resend-api-unavailable (501)');
    return null;
  }

  if (!parsed.ok) {
    return {
      data: null,
      error: {
        message: parsed.message ?? 'فشل التسجيل.',
        code: parsed.code,
      } satisfies AuthErrorLike,
      emailRedirectTo,
    };
  }

  const user = parsed.user
    ? {
        id: parsed.user.id,
        email: parsed.user.email ?? params.email,
        emailVerified: false,
        identities: [{ id: 'resend-signup' }],
      }
    : null;

  const data: SignUpSessionStub = {
    user,
    session: null,
  };

  logAuthFlowStep('client', 'needsVerification', { userId: parsed.user?.id });

  return {
    data,
    error: null,
    emailRedirectTo,
    emailSentViaResend: true,
  };
}

export async function resendVerificationViaResendApi(params: {
  email: string;
  password: string;
  emailRedirectTo: string;
}): Promise<{ ok: true } | { ok: false; message: string } | { unavailable: true }> {
  try {
    const res = await fetchWithTimeout('/api/auth/resend-verification', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(params),
      timeoutMs: SIGNUP_FETCH_MS,
    });

    if (res.status === 501) {
      return { unavailable: true };
    }

    const json = (await res.json()) as SignUpApiSuccess | SignUpApiFailure;
    if (!json.ok) {
      return { ok: false, message: json.message ?? 'تعذّر إعادة الإرسال.' };
    }
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      message: authErrorFromUnknown(error, 'network_error').message ?? 'تعذّر إعادة الإرسال.',
    };
  }
}
