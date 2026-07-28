import type { EmailOtpType, SupabaseClient } from '@supabase/supabase-js';
import type { AuthErrorLike } from '@/lib/auth-errors';

const FALLBACK_TYPES: EmailOtpType[] = ['signup', 'email', 'magiclink'];

export async function verifyEmailOtpFlexible(
  supabase: SupabaseClient,
  params: { email: string; token: string; preferredType: EmailOtpType }
): Promise<
  | { ok: true; sessionUserId: string }
  | { ok: false; error: AuthErrorLike | null }
> {
  const normalizedEmail = params.email.trim();
  const token = params.token.replace(/\D/g, '');

  const order = [
    params.preferredType,
    ...FALLBACK_TYPES.filter((t) => t !== params.preferredType),
  ];

  let lastError: AuthErrorLike | null = null;

  for (const type of order) {
    const { data, error } = await supabase.auth.verifyOtp({
      email: normalizedEmail,
      token,
      type,
    });

    if (!error && data.session?.user) {
      return { ok: true, sessionUserId: data.session.user.id };
    }
    if (error) {
      lastError = error;
    }
  }

  return { ok: false, error: lastError };
}
