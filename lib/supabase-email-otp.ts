import { OTP_CODE_LENGTH } from '@/lib/otp-config';

/** الحد الأدنى/الأقصى لطول OTP الذي يُولّده Supabase Auth (قد يختلف عن إعداد الواجهة). */
const SUPABASE_OTP_MIN = 4;
const SUPABASE_OTP_MAX = 10;

/**
 * يستخرج رمز OTP الرقمي من استجابة Supabase generateLink للإرسال عبر Resend.
 * يقبل أي طول ضمن نطاق Supabase المعتاد (4–10 أرقام) حتى لا يُرفض الرمز
 * إذا اختلف طوله عن OTP_CODE_LENGTH في الواجهة.
 */
export function extractSupabaseEmailOtp(raw: unknown): string | null {
  if (raw == null) return null;

  const trimmed = String(raw).trim();
  if (!trimmed) return null;

  const digitsOnly = trimmed.replace(/\D/g, '');
  if (digitsOnly.length >= SUPABASE_OTP_MIN && digitsOnly.length <= SUPABASE_OTP_MAX) {
    if (digitsOnly.length !== OTP_CODE_LENGTH) {
      console.warn('[supabase-email-otp] OTP length mismatch', {
        supabaseLength: digitsOnly.length,
        uiExpectedLength: OTP_CODE_LENGTH,
        hint: 'Update OTP_CODE_LENGTH in lib/otp-config.ts or Supabase Auth OTP settings so they match.',
      });
    }
    return digitsOnly;
  }

  if (/^\d+$/.test(trimmed) && trimmed.length >= SUPABASE_OTP_MIN && trimmed.length <= SUPABASE_OTP_MAX) {
    return trimmed;
  }

  console.error('[supabase-email-otp] invalid OTP from Supabase', {
    rawType: typeof raw,
    digitLength: digitsOnly.length,
  });
  return null;
}
