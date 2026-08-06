import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticatorTransportFuture,
  type RegistrationResponseJSON,
  type AuthenticationResponseJSON,
} from '@simplewebauthn/server';
import { createSupabaseAdminClient } from '@/lib/delete-auth-user-admin';
import { findAuthUserByEmail } from '@/lib/check-email-registered';
import {
  consumeWebAuthnChallenge,
  replaceWebAuthnChallenge,
} from '@/lib/webauthn-challenges-db';
import { getWebAuthnRpConfig } from '@/lib/webauthn-config';

export type StoredPasskey = {
  id: string;
  user_id: string;
  credential_id: string;
  public_key: string;
  counter: number;
  transports: string[];
};

function toBufferSource(value: string): Uint8Array<ArrayBuffer> {
  const buf = Buffer.from(value, 'base64url');
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength) as Uint8Array<ArrayBuffer>;
}

async function storeChallenge(params: {
  challenge: string;
  userId: string | null;
  email: string | null;
  purpose: 'register' | 'login';
}): Promise<void> {
  await replaceWebAuthnChallenge({
    challenge: params.challenge,
    user_id: params.userId,
    email: params.email,
    purpose: params.purpose,
  });
}

async function consumePendingChallenge(params: {
  challenge: string;
  purpose: 'register' | 'login';
  userId: string;
  email: string;
}): Promise<boolean> {
  return consumeWebAuthnChallenge(params);
}

async function listPasskeysForUser(userId: string): Promise<StoredPasskey[]> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from('user_passkeys')
    .select('id, user_id, credential_id, public_key, counter, transports')
    .eq('user_id', userId);

  if (error) {
    if (error.code === '42P01') return [];
    throw new Error(error.message);
  }

  return (data ?? []) as StoredPasskey[];
}

export async function userHasPasskeys(email: string): Promise<boolean> {
  const user = await findAuthUserByEmail(email.trim().toLowerCase());
  if (!user) return false;
  const passkeys = await listPasskeysForUser(user.id);
  return passkeys.length > 0;
}

export async function buildRegistrationOptions(params: {
  request: Request;
  userId: string;
  email: string;
  userDisplayName?: string;
}) {
  const { rpName, rpID, origin } = getWebAuthnRpConfig(params.request);
  const existing = await listPasskeysForUser(params.userId);

  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userName: params.email,
    userDisplayName: params.userDisplayName ?? params.email,
    userID: new TextEncoder().encode(params.userId),
    attestationType: 'none',
    excludeCredentials: existing.map((pk) => ({
      id: pk.credential_id,
      transports: pk.transports as AuthenticatorTransportFuture[],
    })),
    authenticatorSelection: {
      residentKey: 'preferred',
      userVerification: 'preferred',
      authenticatorAttachment: 'platform',
    },
  });

  await storeChallenge({
    challenge: options.challenge,
    userId: params.userId,
    email: params.email.trim().toLowerCase(),
    purpose: 'register',
  });

  return { options, origin, rpID };
}

export async function verifyRegistration(params: {
  request: Request;
  userId: string;
  email: string;
  response: RegistrationResponseJSON;
}) {
  const { rpID, origin } = getWebAuthnRpConfig(params.request);
  const normalizedEmail = params.email.trim().toLowerCase();

  const verification = await verifyRegistrationResponse({
    response: params.response,
    expectedChallenge: async (challenge) =>
      consumePendingChallenge({
        challenge,
        purpose: 'register',
        userId: params.userId,
        email: normalizedEmail,
      }),
    expectedOrigin: origin,
    expectedRPID: rpID,
    requireUserVerification: true,
  });

  if (!verification.verified || !verification.registrationInfo) {
    throw new Error('فشل التحقق من Passkey.');
  }

  const { credential } = verification.registrationInfo;
  const admin = createSupabaseAdminClient();

  const { error } = await admin.from('user_passkeys').insert({
    user_id: params.userId,
    credential_id: credential.id,
    public_key: Buffer.from(credential.publicKey).toString('base64url'),
    counter: credential.counter,
    transports: credential.transports ?? [],
    last_used_at: new Date().toISOString(),
  });

  if (error) {
    if (error.message.includes('duplicate') || error.code === '23505') {
      throw new Error('هذا المفتاح مسجّل مسبقاً على هذا الجهاز.');
    }
    throw new Error(error.message);
  }

  return { ok: true as const };
}

export async function buildAuthenticationOptions(params: { request: Request; email: string }) {
  const normalized = params.email.trim().toLowerCase();
  const user = await findAuthUserByEmail(normalized);
  if (!user) {
    throw new Error('لا يوجد حساب بهذا البريد.');
  }

  const passkeys = await listPasskeysForUser(user.id);
  if (passkeys.length === 0) {
    throw new Error('لا يوجد Passkey مسجّل لهذا الحساب. سجّل مفتاحاً أولاً.');
  }

  const { rpID, origin } = getWebAuthnRpConfig(params.request);

  const options = await generateAuthenticationOptions({
    rpID,
    userVerification: 'preferred',
    allowCredentials: passkeys.map((pk) => ({
      id: pk.credential_id,
      transports: pk.transports as AuthenticatorTransportFuture[],
    })),
  });

  await storeChallenge({
    challenge: options.challenge,
    userId: user.id,
    email: normalized,
    purpose: 'login',
  });

  return { options, origin, rpID, userId: user.id };
}

export async function verifyAuthentication(params: {
  request: Request;
  email: string;
  response: AuthenticationResponseJSON;
}): Promise<{ userId: string }> {
  const normalized = params.email.trim().toLowerCase();
  const user = await findAuthUserByEmail(normalized);
  if (!user) {
    throw new Error('لا يوجد حساب بهذا البريد.');
  }

  const passkeys = await listPasskeysForUser(user.id);
  const credentialId = params.response.id;
  const passkey = passkeys.find((pk) => pk.credential_id === credentialId);
  if (!passkey) {
    throw new Error('Passkey غير معروف.');
  }

  const { rpID, origin } = getWebAuthnRpConfig(params.request);

  const verification = await verifyAuthenticationResponse({
    response: params.response,
    expectedChallenge: async (challenge) =>
      consumePendingChallenge({
        challenge,
        purpose: 'login',
        userId: user.id,
        email: normalized,
      }),
    expectedOrigin: origin,
    expectedRPID: rpID,
    credential: {
      id: passkey.credential_id,
      publicKey: toBufferSource(passkey.public_key),
      counter: passkey.counter,
      transports: passkey.transports as AuthenticatorTransportFuture[],
    },
    requireUserVerification: true,
  });

  if (!verification.verified) {
    throw new Error('فشل التحقق من Passkey.');
  }

  const admin = createSupabaseAdminClient();
  await admin
    .from('user_passkeys')
    .update({
      counter: verification.authenticationInfo.newCounter,
      last_used_at: new Date().toISOString(),
    })
    .eq('id', passkey.id);

  return { userId: user.id };
}
