import { createSupabaseAdminClient } from '@/lib/delete-auth-user-admin';

/** الأعمدة الوحيدة المستخدمة في INSERT: challenge, user_id, email, purpose. */
export type WebAuthnChallengeWriteRow = {
  challenge: string;
  user_id: string | null;
  email: string | null;
  purpose: WebAuthnChallengePurpose;
};

export type WebAuthnChallengePurpose = 'register' | 'login';

/** الأعمدة الوحيدة المستخدمة في SELECT: id, user_id, email. */
export const WEBAUTHN_CHALLENGE_SELECT_COLUMNS = 'id, user_id, email' as const;

function sanitizeWriteRow(row: WebAuthnChallengeWriteRow): WebAuthnChallengeWriteRow {
  return {
    challenge: row.challenge,
    user_id: row.user_id,
    email: row.email,
    purpose: row.purpose,
  };
}

export type WebAuthnChallengePendingRow = {
  id: string;
  user_id: string | null;
  email: string | null;
};

/**
 * يستبدل التحدي النشط لـ (email + purpose) بتحدٍ جديد.
 * يكتب فقط: challenge, user_id, email, purpose.
 */
export async function replaceWebAuthnChallenge(row: WebAuthnChallengeWriteRow): Promise<void> {
  const admin = createSupabaseAdminClient();
  const payload = sanitizeWriteRow(row);

  if (payload.email) {
    await admin
      .from('webauthn_challenges')
      .delete()
      .eq('email', payload.email)
      .eq('purpose', payload.purpose);
  }

  const { error } = await admin.from('webauthn_challenges').insert(payload);

  if (error) {
    throw new Error(error.message);
  }
}

/**
 * يبحث عن تحدٍ pending ويحذفه (استخدام لمرة واحدة).
 * يقرأ فقط: id, user_id, email.
 */
export async function consumeWebAuthnChallenge(params: {
  challenge: string;
  purpose: WebAuthnChallengePurpose;
  userId: string;
  email: string;
}): Promise<boolean> {
  const admin = createSupabaseAdminClient();
  const normalizedEmail = params.email.trim().toLowerCase();

  const { data, error } = await admin
    .from('webauthn_challenges')
    .select(WEBAUTHN_CHALLENGE_SELECT_COLUMNS)
    .eq('challenge', params.challenge)
    .eq('purpose', params.purpose)
    .maybeSingle();

  if (error || !data) return false;

  const row = data as WebAuthnChallengePendingRow;
  if (row.user_id !== params.userId) return false;
  if (row.email !== normalizedEmail) return false;

  await admin.from('webauthn_challenges').delete().eq('id', row.id);
  return true;
}
