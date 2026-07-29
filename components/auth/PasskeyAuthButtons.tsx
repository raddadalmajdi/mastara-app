'use client';

import { useState } from 'react';
import {
  assertWebAuthnPlatformReady,
  completePasskeySession,
  isPublicKeyCredentialAvailable,
  registerPasskeyForCurrentUser,
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

  if (!isPublicKeyCredentialAvailable()) return null;

  const handleClick = async () => {
    setLoading(true);
    try {
      await assertWebAuthnPlatformReady();
      const trimmed = email.trim();
      const { email: resolvedEmail, tokenHash } = await signInWithPasskey(
        trimmed || undefined
      );
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
      {loading ? 'جاري التحقق بالبصمة...' : '🔐 Face ID / Touch ID (Passkey)'}
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

  if (!isPublicKeyCredentialAvailable()) return null;

  const handleClick = async () => {
    setLoading(true);
    try {
      await assertWebAuthnPlatformReady();
      const token = await getAccessToken();
      if (!token) {
        onFeedback('error', 'يجب تسجيل الدخول لتفعيل Passkey.');
        return;
      }
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
