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

  // قبول 6–8 أرقام مؤقتاً أثناء انتقال إعدادات Supabase
  if (digitsOnly.length >= 6 && digitsOnly.length <= 8) {
    return digitsOnly;
  }

  if (/^\d{6,8}$/.test(trimmed)) {
    return trimmed;
  }

  return null;
}
