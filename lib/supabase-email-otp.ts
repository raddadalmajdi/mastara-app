import { OTP_CODE_LENGTH } from '@/lib/otp-config';

/** يستخرج ويُطَبِّع رمز OTP المكوّن من 8 أرقام من استجابة Supabase generateLink. */
export function extractSupabaseEmailOtp(raw: unknown): string | null {
  if (raw == null) return null;

  const trimmed = String(raw).trim();
  if (!trimmed) return null;

  const digitsOnly = trimmed.replace(/\D/g, '');

  if (digitsOnly.length === OTP_CODE_LENGTH) {
    return digitsOnly;
  }

  if (/^\d+$/.test(trimmed) && trimmed.length === OTP_CODE_LENGTH) {
    return trimmed;
  }

  console.error('[supabase-email-otp] invalid OTP from Supabase (expected 8 digits)', {
    rawType: typeof raw,
    digitLength: digitsOnly.length,
    expectedLength: OTP_CODE_LENGTH,
  });
  return null;
}
