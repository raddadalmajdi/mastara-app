/** يستخرج رمز OTP الرقمي من استجابة Supabase generateLink (6–8 أرقام). */
export function extractSupabaseEmailOtp(raw: unknown): string | null {
  if (raw == null) return null;

  const trimmed = String(raw).trim();
  if (!trimmed) return null;

  if (/^\d{6,8}$/.test(trimmed)) {
    return trimmed;
  }

  const digitsOnly = trimmed.replace(/\D/g, '');
  if (digitsOnly.length >= 6 && digitsOnly.length <= 8) {
    return digitsOnly;
  }

  return null;
}
