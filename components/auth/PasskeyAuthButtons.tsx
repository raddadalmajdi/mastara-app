'use client';

import { useState } from 'react';
import {
  completePasskeySession,
  isWebAuthnSupported,
  signInWithPasskey,
} from '@/lib/webauthn/client-passkey';

type PasskeySignInButtonProps = {
  email: string;
  disabled?: boolean;
  onSuccess: () => void;
  onError: (message: string) => void;
};

export function PasskeySignInButton({
  email,
  disabled,
  onSuccess,
  onError,
}: PasskeySignInButtonProps) {
  const [loading, setLoading] = useState(false);

  if (!isWebAuthnSupported()) return null;

  const handleClick = async () => {
    setLoading(true);
    try {
      const trimmed = email.trim();
      if (!trimmed) {
        onError('أدخل البريد الإلكتروني أولاً لتسجيل الدخول بالبصمة.');
        return;
      }
      const { email: resolvedEmail, tokenHash } = await signInWithPasskey(trimmed);
      await completePasskeySession(resolvedEmail, tokenHash);
      onSuccess();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'فشل تسجيل الدخول بالبصمة.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      disabled={disabled || loading}
      onClick={() => void handleClick()}
      className="w-full rounded-2xl border border-cyan-500/40 bg-cyan-500/10 text-cyan-100 text-sm font-bold py-3.5 disabled:opacity-50"
    >
      {loading ? 'جاري التحقق بالبصمة...' : '🔐 دخول بالبصمة / Face ID (Passkey)'}
    </button>
  );
}

type RegisterPasskeyButtonProps = {
  getAccessToken: () => Promise<string | null>;
  disabled?: boolean;
  onFeedback: (type: 'success' | 'error', message: string) => void;
};

export function RegisterPasskeyButton({
  getAccessToken,
  disabled,
  onFeedback,
}: RegisterPasskeyButtonProps) {
  const [loading, setLoading] = useState(false);

  if (!isWebAuthnSupported()) return null;

  const handleClick = async () => {
    setLoading(true);
    try {
      const token = await getAccessToken();
      if (!token) {
        onFeedback('error', 'يجب تسجيل الدخول لتفعيل Passkey.');
        return;
      }
      const { registerPasskeyForCurrentUser } = await import('@/lib/webauthn/client-passkey');
      await registerPasskeyForCurrentUser(token);
      onFeedback('success', 'تم تفعيل الدخول بالبصمة / Face ID على هذا الجهاز.');
    } catch (err) {
      onFeedback('error', err instanceof Error ? err.message : 'تعذّر تفعيل Passkey.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      disabled={disabled || loading}
      onClick={() => void handleClick()}
      className="w-full rounded-xl border border-slate-700 bg-slate-950 text-cyan-300 text-sm font-bold py-3 disabled:opacity-50"
    >
      {loading ? 'جاري التسجيل...' : '🔐 تفعيل الدخول بالبصمة / Face ID'}
    </button>
  );
}
