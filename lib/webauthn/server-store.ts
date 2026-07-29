import { createSupabaseAdminClient } from '@/lib/delete-auth-user-admin';

export type StoredPasskey = {
  id: string;
  user_id: string;
  credential_id: string;
  public_key: string;
  counter: number;
  transports: string[] | null;
};

export async function saveWebAuthnChallenge(params: {
  challenge: string;
  purpose: 'register' | 'login';
  userId?: string | null;
  email?: string | null;
}): Promise<void> {
  const admin = createSupabaseAdminClient();
  const expires = new Date(Date.now() + 5 * 60 * 1000).toISOString();
  const { error } = await admin.from('webauthn_challenges').insert({
    challenge: params.challenge,
    purpose: params.purpose,
    user_id: params.userId ?? null,
    email: params.email?.trim().toLowerCase() ?? null,
    expires_at: expires,
  });
  if (error) {
    throw new Error(error.message);
  }
}

export async function consumeWebAuthnChallenge(
  challenge: string,
  purpose: 'register' | 'login'
): Promise<{ user_id: string | null; email: string | null } | null> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from('webauthn_challenges')
    .select('user_id, email, expires_at')
    .eq('challenge', challenge)
    .eq('purpose', purpose)
    .maybeSingle();

  if (error || !data) return null;
  if (new Date(data.expires_at).getTime() < Date.now()) {
    await admin.from('webauthn_challenges').delete().eq('challenge', challenge);
    return null;
  }

  await admin.from('webauthn_challenges').delete().eq('challenge', challenge);
  return { user_id: data.user_id, email: data.email };
}

export async function listPasskeysForUser(userId: string): Promise<StoredPasskey[]> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from('user_passkeys')
    .select('id, user_id, credential_id, public_key, counter, transports')
    .eq('user_id', userId);
  if (error) throw new Error(error.message);
  return (data ?? []) as StoredPasskey[];
}

export async function listPasskeysByEmail(email: string): Promise<StoredPasskey[]> {
  const userId = await resolveUserIdByEmail(email);
  if (!userId) return [];
  return listPasskeysForUser(userId);
}

export async function findPasskeyByCredentialId(credentialId: string): Promise<StoredPasskey | null> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from('user_passkeys')
    .select('id, user_id, credential_id, public_key, counter, transports')
    .eq('credential_id', credentialId)
    .maybeSingle();
  if (error || !data) return null;
  return data as StoredPasskey;
}

export async function insertPasskey(row: {
  user_id: string;
  credential_id: string;
  public_key: string;
  counter: number;
  transports: string[];
}): Promise<void> {
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from('user_passkeys').insert(row);
  if (error) throw new Error(error.message);
}

export async function updatePasskeyCounter(id: string, counter: number): Promise<void> {
  const admin = createSupabaseAdminClient();
  await admin
    .from('user_passkeys')
    .update({ counter, last_used_at: new Date().toISOString() })
    .eq('id', id);
}

export async function resolveUserIdByEmail(email: string): Promise<string | null> {
  const admin = createSupabaseAdminClient();
  const normalized = email.trim().toLowerCase();
  let page = 1;
  while (page <= 10) {
    const { data } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    const hit = data.users.find((u) => u.email?.toLowerCase() === normalized);
    if (hit) return hit.id;
    if (data.users.length < 200) break;
    page += 1;
  }
  return null;
}
