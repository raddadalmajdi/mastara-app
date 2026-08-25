import { assertValidEmailRedirectTo } from '@/lib/app-env';
import type { AuthErrorLike } from '@/lib/auth-errors';
import { trySignUpViaResendApi } from '@/lib/auth-sign-up-api';
import { isAsyncTimeoutError, logAuthFlowStep, withTimeout } from '@/lib/async-timeout';

const CLIENT_SIGNUP_TOTAL_MS = 65_000;

export type SignUpUserStub = {
  id: string;
  email?: string;
  emailVerified?: boolean;
  identities?: { id: string }[];
};

export type SignUpSessionStub = {
  user: SignUpUserStub | null;
  session: null;
};

export type SignUpExecutionResult = {
  data: SignUpSessionStub | null;
  error: AuthErrorLike | null;
  emailRedirectTo: string;
  recoveredAfterServerError?: boolean;
  emailSentViaResend?: boolean;
};

export async function executeSignUp(params: {
  email: string;
  password: string;
  emailRedirectTo: string;
}): Promise<SignUpExecutionResult> {
  try {
    return await withTimeout(
      executeSignUpInner(params),
      CLIENT_SIGNUP_TOTAL_MS,
      'عملية التسجيل'
    );
  } catch (error) {
    if (isAsyncTimeoutError(error)) {
      return {
        data: null,
        error: { message: error.message, code: 'request_timeout' },
        emailRedirectTo: params.emailRedirectTo,
      };
    }
    throw error;
  }
}

async function executeSignUpInner(params: {
  email: string;
  password: string;
  emailRedirectTo: string;
}): Promise<SignUpExecutionResult> {
  const emailRedirectTo = assertValidEmailRedirectTo(params.emailRedirectTo);

  logAuthFlowStep('client', 'executeSignUp:start');

  const viaResend = await trySignUpViaResendApi({
    email: params.email,
    password: params.password,
    emailRedirectTo,
  });

  if (viaResend !== null) {
    logAuthFlowStep('client', 'executeSignUp:viaResend', {
      hasError: Boolean(viaResend.error),
      emailSentViaResend: viaResend.emailSentViaResend,
    });
    return viaResend;
  }

  return {
    data: null,
    error: {
      message: 'RESEND_API_KEY غير مضبوط — لا يمكن إنشاء حساب بدون إرسال رمز التحقق.',
      code: 'resend_not_configured',
    },
    emailRedirectTo,
  };
}
