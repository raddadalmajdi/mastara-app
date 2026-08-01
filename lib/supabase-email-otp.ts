import { OTP_CODE_LENGTH } from '@/lib/otp-config';

/** يستخرج رمز OTP الرقمي من استجابة Supabase generateLink. */
export function extractSupabaseEmailOtp(raw: unknown): string | null {
  if (raw == null) return null;

  const trimmed = String(raw).trim();
  if (!trimmed) return null;

  const digitsOnly = trimmed.replace(/\D/g, '');
  if (digitsOnly.length === OTP_CODE_LENGTH) {
    return digitsOnly;
  }

  return null;
}
