import { OTP_CODE_LENGTH } from '@/lib/otp-config';

export type ParsedSupabaseEmailOtp = {
  /** الرمز المعروض في الواجهة والبريد (6 أرقام). */
  deliveryOtp: string;
  /** الرمز الكامل الذي يتوقعه Supabase عند verifyOtp. */
  verifyToken: string;
};

/** يستخرج أرقام OTP من Supabase ويُطَبِّع نسخة العرض إلى OTP_CODE_LENGTH بالضبط. */
export function parseSupabaseEmailOtp(raw: unknown): ParsedSupabaseEmailOtp | null {
  if (raw == null) return null;

  const trimmed = String(raw).trim();
  if (!trimmed) return null;

  const digitsOnly = trimmed.replace(/\D/g, '');
  if (digitsOnly.length < OTP_CODE_LENGTH) {
    console.error('[supabase-email-otp] OTP too short', {
      rawType: typeof raw,
      digitLength: digitsOnly.length,
      expectedLength: OTP_CODE_LENGTH,
    });
    return null;
  }

  const verifyToken = digitsOnly;
  let deliveryOtp = digitsOnly;

  if (digitsOnly.length > OTP_CODE_LENGTH) {
    console.warn('[supabase-email-otp] truncating Supabase OTP to configured length', {
      originalLength: digitsOnly.length,
      targetLength: OTP_CODE_LENGTH,
    });
    deliveryOtp = digitsOnly.slice(0, OTP_CODE_LENGTH);
  }

  return { deliveryOtp, verifyToken };
}

/** يُرجع رمز العرض (6 أرقام) فقط — للاستخدام في Resend والواجهة. */
export function extractSupabaseEmailOtp(raw: unknown): string | null {
  return parseSupabaseEmailOtp(raw)?.deliveryOtp ?? null;
}
