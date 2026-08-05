/** يخزّن مؤقتاً الرمز الكامل من Supabase عند إرسال نسخة مختصرة (6 أرقام) للمستخدم. */
type BridgeEntry = {
  deliveryOtp: string;
  verifyToken: string;
  expiresAt: number;
};

const OTP_BRIDGE_TTL_MS = 10 * 60 * 1000;
const bridgeByEmail = new Map<string, BridgeEntry>();

function normalizeEmailKey(email: string): string {
  return email.trim().toLowerCase();
}

export function registerOtpDeliveryBridge(
  email: string,
  deliveryOtp: string,
  verifyToken: string
): void {
  if (deliveryOtp === verifyToken) return;

  bridgeByEmail.set(normalizeEmailKey(email), {
    deliveryOtp,
    verifyToken,
    expiresAt: Date.now() + OTP_BRIDGE_TTL_MS,
  });
}

export function resolveVerifyTokenForDelivery(
  email: string,
  userToken: string
): string | null {
  const key = normalizeEmailKey(email);
  const entry = bridgeByEmail.get(key);
  if (!entry) return null;

  if (Date.now() > entry.expiresAt) {
    bridgeByEmail.delete(key);
    return null;
  }

  const normalizedUser = userToken.replace(/\D/g, '');
  if (normalizedUser !== entry.deliveryOtp) return null;

  return entry.verifyToken;
}

export function clearOtpDeliveryBridge(email: string): void {
  bridgeByEmail.delete(normalizeEmailKey(email));
}
