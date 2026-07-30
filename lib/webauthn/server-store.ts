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

/** لا تُرسل في Insert — اختياري في DB وقد يغيب من Schema Cache. */
const FORBIDDEN_CHALLENGE_WRITE_COLUMNS = ['email', 'updated_at', 'created_at'] as const;

function isMissingSchemaColumn(error: PostgrestError, column: string): boolean {
  const msg = (error.message ?? '').toLowerCase();
  const col = column.toLowerCase();
  return msg.includes(col) || (error.code === 'PGRST204' && msg.includes(col));
}

function isForbiddenChallengeColumnCacheError(error: PostgrestError): boolean {
  if (error.code !== 'PGRST204') return false;
  return FORBIDDEN_CHALLENGE_WRITE_COLUMNS.some((col) => isMissingSchemaColumn(error, col));
}

/** صف الحفظ الأساسي — challenge + purpose + user_id + expires_at فقط. */
function buildWebAuthnChallengeWriteRow(params: {
  challenge: string;
  purpose: 'register' | 'login';
  userId?: string | null;
}): {
  challenge: string;
  purpose: 'register' | 'login';
  user_id: string | null;
  expires_at: string;
} {
  return {
    challenge: params.challenge,
    purpose: params.purpose,
    user_id: params.userId ?? null,
    expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
  };
}

export async function saveWebAuthnChallenge(params: {
  challenge: string;
  purpose: 'register' | 'login';
  userId?: string | null;
  /** يُستخدم لحل user_id عند تسجيل الدخول — لا يُخزَّن في DB لتجنب PGRST204 على عمود email. */
  email?: string | null;
}): Promise<void> {
  const admin = createSupabaseAdminClient();
  const row = buildWebAuthnChallengeWriteRow(params);

  let result = await admin.from('webauthn_challenges').insert(row);

  if (result.error && isForbiddenChallengeColumnCacheError(result.error)) {
    result = await admin.from('webauthn_challenges').insert(row);
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

  const { data, error } = await admin
    .from('webauthn_challenges')
    .select('user_id, expires_at')
    .eq('challenge', challenge)
    .eq('purpose', purpose)
    .maybeSingle();

  if (error) {
    if (isForbiddenChallengeColumnCacheError(error)) {
      const retry = await admin
        .from('webauthn_challenges')
        .select('user_id, expires_at')
        .eq('challenge', challenge)
        .eq('purpose', purpose)
        .maybeSingle();
      if (retry.error || !retry.data) {
        return null;
      }
      if (new Date(retry.data.expires_at).getTime() < Date.now()) {
        await admin.from('webauthn_challenges').delete().eq('challenge', challenge);
        return null;
      }
      await admin.from('webauthn_challenges').delete().eq('challenge', challenge);
      return { user_id: retry.data.user_id, email: null };
    }
    return null;
  }

  if (!data) return null;
  if (new Date(data.expires_at).getTime() < Date.now()) {
    await admin.from('webauthn_challenges').delete().eq('challenge', challenge);
    return null;
  }

  await admin.from('webauthn_challenges').delete().eq('challenge', challenge);
  return { user_id: data.user_id, email: null };
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
  if (error) throw new Error(error.message);
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
