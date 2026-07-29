import { createClient } from '@supabase/supabase-js';
import { getSupabasePublicConfig } from '@/lib/supabase/env';
import { startRegistration, startAuthentication } from '@simplewebauthn/browser';
import type { PublicKeyCredentialCreationOptionsJSON } from '@simplewebauthn/server';

async function authFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
}

export function isWebAuthnSupported(): boolean {
  return typeof window !== 'undefined' && Boolean(window.PublicKeyCredential);
}

export async function registerPasskeyForCurrentUser(accessToken: string): Promise<void> {
  const optionsRes = await authFetch('/api/auth/webauthn/register/options', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const optionsJson = (await optionsRes.json()) as {
    ok?: boolean;
    options?: PublicKeyCredentialCreationOptionsJSON;
    message?: string;
  };
  if (!optionsRes.ok || !optionsJson.options) {
    throw new Error(optionsJson.message ?? 'تعذّر بدء تسجيل Passkey.');
  }

  const attestation = await startRegistration({ optionsJSON: optionsJson.options });

  const verifyRes = await authFetch('/api/auth/webauthn/register/verify', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(attestation),
  });
  const verifyJson = (await verifyRes.json()) as { ok?: boolean; message?: string };
  if (!verifyRes.ok || !verifyJson.ok) {
    throw new Error(verifyJson.message ?? 'فشل التحقق من Passkey.');
  }
}

export async function signInWithPasskey(email?: string): Promise<{
  email: string;
  tokenHash: string;
}> {
  const optionsRes = await authFetch('/api/auth/webauthn/login/options', {
    method: 'POST',
    body: JSON.stringify({ email: email?.trim().toLowerCase() || undefined }),
  });
  const optionsJson = (await optionsRes.json()) as {
    ok?: boolean;
    options?: Parameters<typeof startAuthentication>[0]['optionsJSON'];
    message?: string;
  };
  if (!optionsRes.ok || !optionsJson.options) {
    throw new Error(optionsJson.message ?? 'لا يوجد Passkey مسجّل لهذا الحساب أو المتصفح لا يدعم البصمة.');
  }

  const assertion = await startAuthentication({ optionsJSON: optionsJson.options });

  const verifyRes = await authFetch('/api/auth/webauthn/login/verify', {
    method: 'POST',
    body: JSON.stringify(assertion),
  });
  const verifyJson = (await verifyRes.json()) as {
    ok?: boolean;
    email?: string;
    tokenHash?: string;
    message?: string;
  };
  if (!verifyRes.ok || !verifyJson.ok || !verifyJson.email || !verifyJson.tokenHash) {
    throw new Error(verifyJson.message ?? 'فشل تسجيل الدخول بالبصمة.');
  }

  return { email: verifyJson.email, tokenHash: verifyJson.tokenHash };
}

export async function completePasskeySession(
  email: string,
  tokenHash: string
): Promise<void> {
  const config = getSupabasePublicConfig();
  if (!config) throw new Error('Supabase غير مهيأ.');
  const supabase = createClient(config.url, config.anonKey);
  const { error } = await supabase.auth.verifyOtp({
    email,
    token: tokenHash,
    type: 'email',
  });
  if (error) {
    throw new Error(error.message);
  }
}
