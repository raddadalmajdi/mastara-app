'use client';

import { useEffect, useState } from 'react';
import { mapAuthErrorToArabic } from '@/lib/auth-errors';
import { trySendLoginOtpViaResendApi } from '@/lib/auth-login-otp-api';
import { resolveSignUpFlow } from '@/lib/auth-handler';
import { logAuthRedirectDiagnostics } from '@/lib/auth-debug';
import { executeSignUp } from '@/lib/auth-sign-up';
import { resendVerificationViaResendApi } from '@/lib/auth-sign-up-api';
import { checkEmailRegistered } from '@/lib/check-email-api';
import { DUPLICATE_EMAIL_MESSAGE, isDuplicateEmailMessage } from '@/lib/check-email-registered';
import {
  firebaseSignInWithCustomToken,
  firebaseSignInWithPassword,
  firebaseSignOut,
  getAuthCallbackUrl,
  isFirebaseConfigured,
} from '@/lib/firebase-auth-client';
import type { OtpBridgeType } from '@/lib/otp-delivery-bridge';
import { OTP_CODE_LENGTH, OTP_LENGTH_AR } from '@/lib/otp-config';
import { isEmailVerifiedUser } from '@/lib/auth-confirmation-guard';
import {
  AUTH_CONFIRMATION_RESENT,
  AUTH_CONFIRMATION_SENT,
  AUTH_OTP_INCOMPLETE,
  AUTH_UNCONFIRMED_LOGIN,
} from '@/lib/auth-confirmation-copy';
import type { AuthFeedback } from '@/lib/home/types';

type UseAuthFlowOptions = {
  refreshOrganization: () => Promise<void>;
  onVerified: () => void;
};

export function useAuthFlow({ refreshOrganization, onVerified }: UseAuthFlowOptions) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [loginMethod, setLoginMethod] = useState<'password' | 'otp'>('password');
  const [authPhase, setAuthPhase] = useState<'form' | 'confirm'>('form');
  const [otpCode, setOtpCode] = useState('');
  const [otpVerifyType, setOtpVerifyType] = useState<OtpBridgeType>('email');
  const [otpResendCooldown, setOtpResendCooldown] = useState(0);
  const [authFeedback, setAuthFeedback] = useState<AuthFeedback>(null);
  const [emailDuplicateError, setEmailDuplicateError] = useState<string | null>(null);
  const [emailCheckPending, setEmailCheckPending] = useState(false);
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [devDeleteStatus, setDevDeleteStatus] = useState<string | null>(null);
  const [devDeleteLoading, setDevDeleteLoading] = useState(false);

  useEffect(() => {
    if (otpResendCooldown <= 0) return;
    const timer = window.setInterval(() => {
      setOtpResendCooldown((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [otpResendCooldown]);

  const switchAuthMode = (signUp: boolean) => {
    setIsSignUp(signUp);
    setLoginMethod('password');
    setAuthPhase('form');
    setAuthFeedback(null);
    setEmailDuplicateError(null);
    setPassword('');
    setOtpCode('');
    setAuthSubmitting(false);
  };

  const beginConfirmationPhase = (verifyType: OtpBridgeType, successMessage?: string) => {
    setOtpVerifyType(verifyType);
    setAuthPhase('confirm');
    setOtpCode('');
    setAuthFeedback({
      type: 'success',
      message: successMessage ?? AUTH_CONFIRMATION_SENT,
    });
    setOtpResendCooldown(60);
  };

  const handleSendLoginOtp = async () => {
    if (!isFirebaseConfigured()) return;
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail) {
      setAuthFeedback({ type: 'error', message: 'أدخل بريدك الإلكتروني أولاً.' });
      return;
    }

    const redirectTo = getAuthCallbackUrl();
    setAuthSubmitting(true);
    setAuthFeedback(null);
    setOtpCode('');
    try {
      const viaResend = await trySendLoginOtpViaResendApi({
        email: trimmedEmail,
        emailRedirectTo: redirectTo,
      });

      if (!('unavailable' in viaResend)) {
        if (viaResend.ok) {
          beginConfirmationPhase(
            'magiclink',
            `أرسلنا رمز الدخول (${OTP_LENGTH_AR}) إلى بريدك — أدخله أدناه.`
          );
          return;
        }
        setAuthFeedback({
          type: 'error',
          message: mapAuthErrorToArabic(viaResend.error, 'otp'),
        });
        return;
      }

      setAuthFeedback({
        type: 'error',
        message: 'خدمة إرسال رمز الدخول غير متاحة حالياً. تواصل مع الدعم على eysalk.com.',
      });
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleResendOtp = async () => {
    if (!isFirebaseConfigured() || otpResendCooldown > 0) return;
    setAuthSubmitting(true);
    setAuthFeedback(null);
    try {
      const trimmedEmail = email.trim();
      if (otpVerifyType === 'signup') {
        const redirectTo = getAuthCallbackUrl();
        const normalized = trimmedEmail.toLowerCase();

        if (password) {
          const resendApi = await resendVerificationViaResendApi({
            email: normalized,
            password,
            emailRedirectTo: redirectTo,
          });

          if (!('unavailable' in resendApi)) {
            if (!resendApi.ok) {
              setAuthFeedback({ type: 'error', message: resendApi.message });
              return;
            }
            setAuthFeedback({
              type: 'success',
              message: `${AUTH_CONFIRMATION_RESENT} (Resend)`,
            });
            setOtpResendCooldown(60);
            return;
          }
        }

        setAuthFeedback({
          type: 'error',
          message: 'تعذّر إعادة إرسال رمز التفعيل. تواصل مع الدعم على eysalk.com.',
        });
        return;
      }

      const redirectTo = getAuthCallbackUrl();
      const normalized = trimmedEmail.toLowerCase();
      const viaResend = await trySendLoginOtpViaResendApi({
        email: normalized,
        emailRedirectTo: redirectTo,
      });

      if (!('unavailable' in viaResend)) {
        if (!viaResend.ok) {
          setAuthFeedback({
            type: 'error',
            message: mapAuthErrorToArabic(viaResend.error, 'otp'),
          });
          return;
        }
        setAuthFeedback({
          type: 'success',
          message: `${AUTH_CONFIRMATION_RESENT} (Resend)`,
        });
        setOtpResendCooldown(60);
        return;
      }

      setAuthFeedback({
        type: 'error',
        message: 'خدمة إرسال رمز الدخول غير متاحة حالياً. تواصل مع الدعم على eysalk.com.',
      });
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFirebaseConfigured()) return;

    const token = otpCode.replace(/\D/g, '');
    if (token.length !== OTP_CODE_LENGTH) {
      setAuthFeedback({ type: 'error', message: AUTH_OTP_INCOMPLETE });
      return;
    }

    setAuthSubmitting(true);
    setAuthFeedback(null);
    try {
      const response = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          email: email.trim(),
          token,
          preferredType: otpVerifyType,
        }),
      });

      const payload = (await response.json()) as {
        ok?: boolean;
        session?: { customToken: string };
        error?: { message?: string; code?: string } | null;
      };

      if (!response.ok || !payload.ok || !payload.session?.customToken) {
        setAuthFeedback({
          type: 'error',
          message: mapAuthErrorToArabic(payload.error ?? null, 'otp'),
        });
        return;
      }

      try {
        await firebaseSignInWithCustomToken(payload.session.customToken);
      } catch (signInError) {
        setAuthFeedback({
          type: 'error',
          message: mapAuthErrorToArabic(
            signInError instanceof Error
              ? { message: signInError.message, code: (signInError as { code?: string }).code }
              : null,
            'otp'
          ),
        });
        return;
      }

      setAuthFeedback({ type: 'success', message: 'تم التحقق من الرمز وتسجيل الدخول بنجاح.' });
      await refreshOrganization();
      onVerified();
      setOtpCode('');
      setAuthPhase('form');
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isFirebaseConfigured()) {
      setAuthFeedback({
        type: 'error',
        message:
          'إعداد Firebase غير مكتمل. أضف متغيرات NEXT_PUBLIC_FIREBASE_* في .env.local ثم أعد تشغيل الخادم.',
      });
      return;
    }

    if (!isSignUp && loginMethod === 'otp') {
      await handleSendLoginOtp();
      return;
    }

    const trimmedEmail = email.trim();

    if (isSignUp && (!trimmedEmail || !password)) {
      setAuthFeedback({ type: 'error', message: 'يرجى إدخال البريد الإلكتروني وكلمة المرور.' });
      return;
    }

    if (!isSignUp && loginMethod === 'password' && (!trimmedEmail || !password)) {
      setAuthFeedback({ type: 'error', message: 'يرجى إدخال البريد الإلكتروني وكلمة المرور.' });
      return;
    }

    setAuthSubmitting(true);
    setAuthFeedback(null);

    try {
      let redirectTo: string;
      try {
        redirectTo = getAuthCallbackUrl();
      } catch (redirectError) {
        setAuthFeedback({
          type: 'error',
          message:
            redirectError instanceof Error
              ? redirectError.message
              : 'تعذّر تجهيز إعداد التسجيل الداخلي. تواصل مع الدعم على eysalk.com.',
        });
        return;
      }

      if (isSignUp) {
        const normalizedEmail = trimmedEmail.toLowerCase();
        setEmailCheckPending(true);
        const emailCheck = await checkEmailRegistered(normalizedEmail);
        setEmailCheckPending(false);

        if (!emailCheck.ok) {
          setAuthFeedback({ type: 'error', message: emailCheck.message });
          return;
        }

        if (emailCheck.exists) {
          setEmailDuplicateError(DUPLICATE_EMAIL_MESSAGE);
          return;
        }

        setEmailDuplicateError(null);
        logAuthRedirectDiagnostics(redirectTo);

        let signUpResult;
        try {
          signUpResult = await executeSignUp({
            email: normalizedEmail,
            password,
            emailRedirectTo: redirectTo,
          });
        } catch (signUpError) {
          console.error('[signUp]', signUpError);
          setAuthFeedback({
            type: 'error',
            message:
              signUpError instanceof Error
                ? signUpError.message
                : 'تعذّر إنشاء الحساب. حاول مجدداً.',
          });
          return;
        }

        const { data, error, recoveredAfterServerError, emailSentViaResend } = signUpResult;
        const flow = resolveSignUpFlow(data, error, {
          emailRedirectTo: redirectTo,
          recoveredAfterServerError,
        });

        if (flow.kind === 'error') {
          if (isDuplicateEmailMessage(flow.message)) {
            setEmailDuplicateError(DUPLICATE_EMAIL_MESSAGE);
            setAuthFeedback(null);
          } else {
            setAuthFeedback({ type: 'error', message: flow.message });
          }
          setPassword('');
          return;
        }

        if (flow.kind === 'logged_in') {
          if (!isEmailVerifiedUser(data?.user)) {
            await firebaseSignOut().catch(() => undefined);
            beginConfirmationPhase(
              'signup',
              `تم إنشاء حسابك. أدخل رمز التحقق (${OTP_LENGTH_AR}) المرسل إلى بريدك لإكمال تسجيل الدخول.`
            );
            setPassword('');
            return;
          }

          setAuthFeedback({
            type: 'success',
            message: recoveredAfterServerError
              ? 'تم إنشاء حسابك. تم تسجيل دخولك (بعد تعافٍ من خطأ خادم/SMTP).'
              : 'تم إنشاء حسابك وتسجيل دخولك بنجاح.',
          });
          onVerified();
          setPassword('');
          return;
        }

        const confirmMessage = emailSentViaResend
          ? `تم إنشاء حسابك. أرسلنا رمز التفعيل (${OTP_LENGTH_AR}) إلى بريدك عبر Resend — أدخله أدناه.`
          : recoveredAfterServerError
            ? 'تم إنشاء حسابك، لكن إرسال رمز التفعيل قد يكون فشل. استخدم «إعادة إرسال» أو راجع إعداد Resend.'
            : undefined;

        beginConfirmationPhase('signup', confirmMessage);
        return;
      }

      try {
        const credential = await firebaseSignInWithPassword(trimmedEmail, password);
        const signedInUser = credential.user;

        if (!isEmailVerifiedUser(signedInUser)) {
          await firebaseSignOut().catch(() => undefined);
          beginConfirmationPhase('signup');
          setAuthFeedback({ type: 'success', message: AUTH_UNCONFIRMED_LOGIN });
          return;
        }

        setAuthFeedback({ type: 'success', message: 'تم التحقق من بياناتك وتسجيل الدخول بنجاح.' });
        onVerified();
        setPassword('');
      } catch (loginError: unknown) {
        const err = loginError as { message?: string; code?: string } | null;
        const authError = err
          ? { message: err.message ?? 'فشل تسجيل الدخول.', code: err.code ?? '' }
          : null;

        if (authError?.code === 'auth/user-not-verified' || authError?.code === 'email_not_confirmed') {
          beginConfirmationPhase('signup');
          setAuthFeedback({ type: 'success', message: AUTH_UNCONFIRMED_LOGIN });
          return;
        }

        setAuthFeedback({
          type: 'error',
          message: mapAuthErrorToArabic(authError, isSignUp ? 'signup' : 'login'),
        });
      }
    } catch (unexpected) {
      console.error('[handleAuth]', unexpected);
      setAuthFeedback({
        type: 'error',
        message: 'حدث خطأ غير متوقع أثناء المعالجة. حاول مجدداً.',
      });
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleDevDeleteAuthUser = async () => {
    const targetEmail = 'rraddad@hotmail.com';
    if (!window.confirm(`[DEV] حذف نهائي للمستخدم ${targetEmail} من Firebase Auth؟`)) {
      return;
    }

    setDevDeleteLoading(true);
    setDevDeleteStatus(null);
    try {
      const res = await fetch('/api/dev/delete-auth-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: targetEmail }),
      });
      const data = (await res.json()) as { ok?: boolean; message?: string; userId?: string };
      const line = data.ok
        ? `[DEV] ✅ ${data.message}${data.userId ? ` (id: ${data.userId})` : ''}`
        : `[DEV] ℹ️ ${data.message ?? 'فشل غير معروف'} — (ليست رسالة تسجيل دخول)`;
      setDevDeleteStatus(line);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Network error';
      setDevDeleteStatus(`❌ ${msg}`);
    } finally {
      setDevDeleteLoading(false);
    }
  };

  const resetAuthForm = () => {
    setAuthPhase('form');
    setOtpCode('');
    setAuthFeedback(null);
  };

  return {
    email,
    setEmail,
    password,
    setPassword,
    isSignUp,
    loginMethod,
    setLoginMethod,
    authPhase,
    otpCode,
    setOtpCode,
    authFeedback,
    setAuthFeedback,
    emailDuplicateError,
    setEmailDuplicateError,
    emailCheckPending,
    authSubmitting,
    otpResendCooldown,
    devDeleteStatus,
    devDeleteLoading,
    switchAuthMode,
    handleAuth,
    handleVerifyOtp,
    handleResendOtp,
    handleDevDeleteAuthUser,
    resetAuthForm,
  };
}
