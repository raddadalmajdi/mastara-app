'use client';

import { useEffect, useMemo, useState } from 'react';
import { startAuthentication, startRegistration } from '@simplewebauthn/browser';
import {
  checkPasskeyAvailable,
  fetchPasskeyLoginOptions,
  fetchPasskeyRegisterOptions,
  submitPasskeyLogin,
  submitPasskeyRegistration,
} from '@/lib/webauthn-api-client';
import { detectBiometricHint, isWebAuthnSupported } from '@/lib/webauthn-device-hint';
import { getSupabaseBrowserClient } from '@/lib/supabase-browser';

type PasskeyAuthPanelProps = {
  email: string;
  password: string;
  isSignUp: boolean;
  onLoginSuccess: () => void;
  onFeedback: (feedback: { type: 'success' | 'error'; message: string }) => void;
};

function BiometricIcon({ kind }: { kind: ReturnType<typeof detectBiometricHint>['icon'] }) {
  if (kind === 'face') {
    return (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <rect x="4" y="4" width="16" height="16" rx="4" />
        <circle cx="9" cy="10" r="1" fill="currentColor" stroke="none" />
        <circle cx="15" cy="10" r="1" fill="currentColor" stroke="none" />
        <path d="M9 15c.6.8 1.5 1.2 3 1.2s2.4-.4 3-1.2" strokeLinecap="round" />
      </svg>
    );
  }
  if (kind === 'fingerprint') {
    return (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path d="M12 3c-2 2-4 5-4 9a4 4 0 0 0 8 0c0-4-2-7-4-9Z" />
        <path d="M12 12v3" strokeLinecap="round" />
        <path d="M8 14c0 3 1.5 5 4 5" strokeLinecap="round" />
        <path d="M16 14c0 3-1.5 5-4 5" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M12 2l2 4h4l-3 3 1 5-4-2-4 2 1-5-3-3h4z" />
    </svg>
  );
}

export function PasskeyAuthPanel({
  email,
  password,
  isSignUp,
  onLoginSuccess,
  onFeedback,
}: PasskeyAuthPanelProps) {
  const hint = useMemo(() => detectBiometricHint(), []);
  const supported = useMemo(() => isWebAuthnSupported(), []);
  const [busy, setBusy] = useState<'login' | 'register' | null>(null);
  const [hasPasskeys, setHasPasskeys] = useState(false);

  useEffect(() => {
    if (!supported || isSignUp) return;
    const trimmed = email.trim();
    if (!trimmed.includes('@')) {
      setHasPasskeys(false);
      return;
    }
    const timer = window.setTimeout(() => {
      void checkPasskeyAvailable(trimmed).then(setHasPasskeys).catch(() => setHasPasskeys(false));
    }, 400);
    return () => window.clearTimeout(timer);
  }, [email, isSignUp, supported]);

  if (!supported) {
    return (
      <p className="text-[11px] text-center text-mistara-brown/60">
        متصفحك لا يدعم Passkey / {hint.shortLabel} على هذا الجهاز.
      </p>
    );
  }

  if (isSignUp) {
    return (
      <p className="text-[11px] text-center text-mistara-brown/65 leading-relaxed">
        بعد إنشاء حسابك يمكنك تسجيل {hint.shortLabel} من شاشة الدخول أو من قائمة الحساب.
      </p>
    );
  }

  const trimmedEmail = email.trim().toLowerCase();
  const canRegister = Boolean(trimmedEmail && password.length >= 6);

  const handleLogin = async () => {
    if (!trimmedEmail) {
      onFeedback({ type: 'error', message: 'أدخل بريدك الإلكتروني أولاً.' });
      return;
    }
    setBusy('login');
    try {
      const options = await fetchPasskeyLoginOptions(trimmedEmail);
      const authResponse = await startAuthentication({ optionsJSON: options });
      const result = await submitPasskeyLogin({ email: trimmedEmail, response: authResponse });

      const supabase = getSupabaseBrowserClient();
      if (!supabase) throw new Error('Supabase غير متاح.');

      const { error } = await supabase.auth.setSession({
        access_token: result.session.access_token,
        refresh_token: result.session.refresh_token,
      });
      if (error) throw new Error(error.message);

      onFeedback({ type: 'success', message: `تم الدخول بنجاح عبر ${hint.shortLabel}.` });
      onLoginSuccess();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : `تعذّر الدخول عبر ${hint.shortLabel}.`;
      onFeedback({ type: 'error', message });
    } finally {
      setBusy(null);
    }
  };

  const handleRegister = async () => {
    if (!canRegister) {
      onFeedback({
        type: 'error',
        message: 'لتسجيل Passkey أدخل بريدك وكلمة المرور الصحيحة.',
      });
      return;
    }
    setBusy('register');
    try {
      const options = await fetchPasskeyRegisterOptions({
        email: trimmedEmail,
        password,
      });
      const regResponse = await startRegistration({ optionsJSON: options });
      await submitPasskeyRegistration({ email: trimmedEmail, response: regResponse });
      setHasPasskeys(true);
      onFeedback({
        type: 'success',
        message: `تم تسجيل ${hint.shortLabel} بنجاح — يمكنك الدخول به لاحقاً.`,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : `تعذّر تسجيل ${hint.shortLabel}.`;
      onFeedback({ type: 'error', message });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-3 rounded-2xl border border-primary/15 bg-primary/5 p-4">
      <div className="flex items-center justify-center gap-2 text-primary-dark">
        <BiometricIcon kind={hint.icon} />
        <p className="text-sm font-black">الدخول البيومتري ({hint.shortLabel})</p>
      </div>
      <p className="text-[11px] text-center text-mistara-brown/70 leading-relaxed">
        {hint.shortLabel === 'Face ID' || hint.shortLabel === 'Touch ID'
          ? `استخدم ${hint.shortLabel} على جهاز Apple للدخول السريع.`
          : hint.shortLabel === 'بصمة الجهاز'
            ? 'استخدم بصمة أو وجه جهاز Android للدخول السريع.'
            : `استخدم ${hint.shortLabel} للدخول السريع دون OTP.`}
      </p>

      <div className="grid gap-2 sm:grid-cols-2">
        <button
          type="button"
          disabled={busy !== null || !trimmedEmail}
          onClick={() => void handleLogin()}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-black text-white shadow-md disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy === 'login' ? 'جاري التحقق...' : hint.loginLabel}
        </button>
        <button
          type="button"
          disabled={busy !== null || !canRegister}
          onClick={() => void handleRegister()}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-primary/30 bg-white/80 py-3 text-sm font-black text-primary-dark disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy === 'register' ? 'جاري التسجيل...' : hint.registerLabel}
        </button>
      </div>

      {hasPasskeys && (
        <p className="text-[10px] text-center font-bold text-emerald-700">
          ✓ يوجد Passkey مسجّل لهذا البريد
        </p>
      )}
    </div>
  );
}

/** تسجيل Passkey للمستخدم المسجّل دخولاً (من قائمة الحساب). */
export function PasskeyRegisterLoggedInButton({
  email,
  accessToken,
  onFeedback,
}: {
  email: string;
  accessToken: string;
  onFeedback: (feedback: { type: 'success' | 'error'; message: string }) => void;
}) {
  const hint = useMemo(() => detectBiometricHint(), []);
  const supported = useMemo(() => isWebAuthnSupported(), []);
  const [busy, setBusy] = useState(false);

  if (!supported) return null;

  const handleRegister = async () => {
    setBusy(true);
    try {
      const options = await fetchPasskeyRegisterOptions({
        email,
        accessToken,
      });
      const regResponse = await startRegistration({ optionsJSON: options });
      await submitPasskeyRegistration({ email, response: regResponse, accessToken });
      onFeedback({
        type: 'success',
        message: `تم تسجيل ${hint.shortLabel} على هذا الجهاز.`,
      });
    } catch (error) {
      onFeedback({
        type: 'error',
        message: error instanceof Error ? error.message : 'تعذّر تسجيل Passkey.',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => void handleRegister()}
      className="w-full rounded-xl border border-mistara-gold/30 bg-mistara-gold/10 py-2.5 text-sm font-bold text-mistara-warm disabled:opacity-60"
    >
      {busy ? 'جاري التسجيل...' : `إضافة ${hint.shortLabel}`}
    </button>
  );
}
