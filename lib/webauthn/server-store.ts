import type { PostgrestError } from '@supabase/supabase-js';
import { createSupabaseAdminClient } from '@/lib/delete-auth-user-admin';

export type StoredPasskey = {
  id: string;
  user_id: string;
  credential_id: string;
  public_key: string;
  counter: number;
  transports: string[] | null;
};

function isMissingSchemaColumn(error: PostgrestError, column: string): boolean {
  const msg = error.message ?? '';
  return (
    msg.includes(column) ||
    (error.code === 'PGRST204' && msg.toLowerCase().includes(column.toLowerCase()))
  );
}

export async function saveWebAuthnChallenge(params: {
  challenge: string;
  purpose: 'register' | 'login';
  userId?: string | null;
  email?: string | null;
}): Promise<void> {
  const admin = createSupabaseAdminClient();
  const expires = new Date(Date.now() + 5 * 60 * 1000).toISOString();
  const fullRow = {
    challenge: params.challenge,
    purpose: params.purpose,
    user_id: params.userId ?? null,
    email: params.email?.trim().toLowerCase() ?? null,
    expires_at: expires,
  };

  let result = await admin.from('webauthn_challenges').insert(fullRow);

  if (result.error && isMissingSchemaColumn(result.error, 'email')) {
    const { email: _removed, ...legacyRow } = fullRow;
    result = await admin.from('webauthn_challenges').insert(legacyRow);
  }

  if (result.error) {
    throw new Error(result.error.message);
  }
}

export async function consumeWebAuthnChallenge(
  challenge: string,
  purpose: 'register' | 'login'
): Promise<{ user_id: string | null; email: string | null } | null> {
  const admin = createSupabaseAdminClient();

  let data: { user_id: string | null; email?: string | null; expires_at: string } | null = null;
  let error: PostgrestError | null = null;

  const withEmail = await admin
    .from('webauthn_challenges')
    .select('user_id, email, expires_at')
    .eq('challenge', challenge)
    .eq('purpose', purpose)
    .maybeSingle();

  if (withEmail.error && isMissingSchemaColumn(withEmail.error, 'email')) {
    const legacy = await admin
      .from('webauthn_challenges')
      .select('user_id, expires_at')
      .eq('challenge', challenge)
      .eq('purpose', purpose)
      .maybeSingle();
    data = legacy.data
      ? { user_id: legacy.data.user_id, email: null, expires_at: legacy.data.expires_at }
      : null;
    error = legacy.error;
  } else {
    data = withEmail.data;
    error = withEmail.error;
  }

  if (error || !data) return null;
  if (new Date(data.expires_at).getTime() < Date.now()) {
    await admin.from('webauthn_challenges').delete().eq('challenge', challenge);
    return null;
  }

  await admin.from('webauthn_challenges').delete().eq('challenge', challenge);
  return { user_id: data.user_id, email: data.email ?? null };
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
  const patch = { counter, last_used_at: new Date().toISOString() };
  let { error } = await admin.from('user_passkeys').update(patch).eq('id', id);
  if (error && isMissingSchemaColumn(error, 'last_used_at')) {
    ({ error } = await admin.from('user_passkeys').update({ counter }).eq('id', id));
  }
  if (error && isMissingSchemaColumn(error, 'updated_at')) {
    ({ error } = await admin.from('user_passkeys').update({ counter }).eq('id', id));
  }
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
