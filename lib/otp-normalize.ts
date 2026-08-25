import { OTP_CODE_LENGTH } from '@/lib/otp-config';

/** يُطَبِّع رمز OTP إلى OTP_CODE_LENGTH أرقام. */
export function normalizeOtpCode(raw: unknown): string | null {
  if (raw == null) return null;
  const digits = String(raw).replace(/\D/g, '');
  if (digits.length < OTP_CODE_LENGTH) return null;
  return digits.slice(0, OTP_CODE_LENGTH);
}
