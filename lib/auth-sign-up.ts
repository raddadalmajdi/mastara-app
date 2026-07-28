import type { SupabaseClient, AuthResponse } from '@supabase/supabase-js';
import { logSupabaseAuthErrorJson } from '@/lib/auth-debug';
import { assertValidEmailRedirectTo } from '@/lib/supabase-browser';
import type { AuthErrorLike } from '@/lib/auth-errors';
import { trySignUpViaResendApi } from '@/lib/auth-sign-up-api';
import { isEmailVerifiedUser } from '@/lib/auth-confirmation-guard';
import { isAsyncTimeoutError, logAuthFlowStep, withTimeout } from '@/lib/async-timeout';

const CLIENT_SIGNUP_TOTAL_MS = 65_000;
const SUPABASE_SIGNUP_STEP_MS = 28_000;

export type SignUpExecutionResult = {
  data: AuthResponse['data'] | null;
  error: AuthErrorLike | null;
  emailRedirectTo: string;
  /** true إذا فشل signUp بـ 500 لكن الحساب وُجد عبر تسجيل الدخول */
  recoveredAfterServerError?: boolean;
  /** تم إرسال التفعيل عبر Resend API من الخادم */
  emailSentViaResend?: boolean;
};

function isAuthServerOrFetchFailure(error: AuthErrorLike): boolean {
  const name = (error as { name?: string }).name ?? '';
  const status = error.status ?? 0;
  const msg = (error.message ?? '').toLowerCase();

  return (
    status >= 500 ||
    name === 'AuthRetryableFetchError' ||
    msg.includes('retryablefetch') ||
    msg.includes('unexpected_failure')
  );
}

/**
 * signUp مع تحقق من redirect URL، وإعادة محاولة واحدة، واست recovery عند 500 (SMTP).
 */
export async function executeSignUp(
  supabase: SupabaseClient,
  params: { email: string; password: string; emailRedirectTo: string }
): Promise<SignUpExecutionResult> {
  try {
    return await withTimeout(
      executeSignUpInner(supabase, params),
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

async function executeSignUpInner(
  supabase: SupabaseClient,
  params: { email: string; password: string; emailRedirectTo: string }
): Promise<SignUpExecutionResult> {
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

  logAuthFlowStep('client', 'executeSignUp:fallback supabase.auth.signUp');

  const signUpOptions = {
    email: params.email,
    password: params.password,
    options: { emailRedirectTo },
  };

  let { data, error } = await withTimeout(
    supabase.auth.signUp(signUpOptions),
    SUPABASE_SIGNUP_STEP_MS,
    'Supabase signUp'
  );

  if (error && isAuthServerOrFetchFailure(error)) {
    logSupabaseAuthErrorJson(error, 'signUp/attempt-1');

    if (process.env.NODE_ENV === 'development') {
      console.warn('[Supabase] signUp returned 5xx — retry once after 800ms (SMTP/transient)');
    }

    await new Promise((r) => setTimeout(r, 800));
    const retry = await withTimeout(
      supabase.auth.signUp(signUpOptions),
      SUPABASE_SIGNUP_STEP_MS,
      'Supabase signUp (retry)'
    );
    data = retry.data;
    error = retry.error;

    if (error && isAuthServerOrFetchFailure(error)) {
      logSupabaseAuthErrorJson(error, 'signUp/attempt-2');

      const login = await withTimeout(
        supabase.auth.signInWithPassword({
          email: params.email,
          password: params.password,
        }),
        SUPABASE_SIGNUP_STEP_MS,
        'Supabase signInWithPassword (recovery)'
      );

      if (login.data.session?.user) {
        if (isEmailVerifiedUser(login.data.session.user)) {
          return {
            data: login.data,
            error: null,
            emailRedirectTo,
            recoveredAfterServerError: true,
          };
        }
        // جلسة نشطة لكن لم يُتحقق من البريد فعلياً برمز الـ OTP (قد يحدث فقط
        // إن كان إعداد "Confirm email" معطّلاً في Supabase). لا نثق بها —
        // نُسجّل الخروج فوراً ونمرّ لمرحلة إدخال الرمز بدلاً من دخول مباشر.
        await supabase.auth.signOut();
        return {
          data: { user: login.data.user ?? null, session: null },
          error: null,
          emailRedirectTo,
          recoveredAfterServerError: true,
        };
      }

      if (login.error?.code === 'email_not_confirmed') {
        return {
          data: { user: login.data.user ?? null, session: null },
          error: null,
          emailRedirectTo,
          recoveredAfterServerError: true,
        };
      }
    }
  }

  logAuthFlowStep('client', 'executeSignUp:done', { hasError: Boolean(error) });
  return { data, error, emailRedirectTo };
}
