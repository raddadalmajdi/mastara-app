import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/browser';
import { sanitizeUserFacingMessage } from '@/lib/user-facing-error';

async function parseJson<T>(res: Response): Promise<T & { ok?: boolean; message?: string }> {
  return (await res.json()) as T & { ok?: boolean; message?: string };
}

export async function fetchPasskeyRegisterOptions(params: {
  email: string;
  password?: string;
  accessToken?: string;
}): Promise<PublicKeyCredentialCreationOptionsJSON> {
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  if (params.accessToken) {
    headers.Authorization = `Bearer ${params.accessToken}`;
  }

  const res = await fetch('/api/auth/webauthn/register/options', {
    method: 'POST',
    headers,
    credentials: 'include',
    body: JSON.stringify({
      email: params.email,
      password: params.password,
    }),
  });

  const json = await parseJson<{ options?: PublicKeyCredentialCreationOptionsJSON }>(res);
  if (!res.ok || !json.options) {
    throw new Error(
      sanitizeUserFacingMessage(json.message, 'تعذّر بدء تسجيل Passkey.')
    );
  }
  return json.options;
}

export async function submitPasskeyRegistration(params: {
  email: string;
  response: RegistrationResponseJSON;
  accessToken?: string;
}): Promise<void> {
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  if (params.accessToken) {
    headers.Authorization = `Bearer ${params.accessToken}`;
  }

  const res = await fetch('/api/auth/webauthn/register/verify', {
    method: 'POST',
    headers,
    credentials: 'include',
    body: JSON.stringify({
      email: params.email,
      response: params.response,
    }),
  });

  const json = await parseJson<{ ok?: boolean }>(res);
  if (!res.ok || !json.ok) {
    throw new Error(
      sanitizeUserFacingMessage(json.message, 'تعذّر إتمام تسجيل Passkey.')
    );
  }
}

export async function fetchPasskeyLoginOptions(
  email: string
): Promise<PublicKeyCredentialRequestOptionsJSON> {
  const res = await fetch('/api/auth/webauthn/login/options', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ email }),
  });

  const json = await parseJson<{ options?: PublicKeyCredentialRequestOptionsJSON }>(res);
  if (!res.ok || !json.options) {
    throw new Error(
      sanitizeUserFacingMessage(json.message, 'تعذّر بدء الدخول بـ Passkey.')
    );
  }
  return json.options;
}

export async function submitPasskeyLogin(params: {
  email: string;
  response: AuthenticationResponseJSON;
}): Promise<{
  session: { access_token: string; refresh_token: string };
  organizationId: string | null;
}> {
  const res = await fetch('/api/auth/webauthn/login/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      email: params.email,
      response: params.response,
    }),
  });

  const json = await parseJson<{
    ok?: boolean;
    session?: { access_token: string; refresh_token: string };
    organizationId?: string | null;
  }>(res);

  if (!res.ok || !json.ok || !json.session) {
    throw new Error(
      sanitizeUserFacingMessage(json.message, 'تعذّر إتمام الدخول بـ Passkey.')
    );
  }

  return {
    session: json.session,
    organizationId: json.organizationId ?? null,
  };
}

export async function checkPasskeyAvailable(email: string): Promise<boolean> {
  const trimmed = email.trim();
  if (!trimmed) return false;

  const res = await fetch('/api/auth/webauthn/status', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ email: trimmed }),
  });

  const json = await parseJson<{ hasPasskeys?: boolean }>(res);
  return Boolean(json.hasPasskeys);
}
