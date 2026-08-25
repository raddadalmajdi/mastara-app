import { getFirebaseAdminAuth, getFirebaseAdminFirestore } from '@/lib/firebase-admin';
import { OTP_CODE_LENGTH } from '@/lib/otp-config';
import { issueOtpVerificationBridge, type OtpBridgeIssue } from '@/lib/otp-delivery-bridge';

export type OtpPurpose = 'signup' | 'login' | 'magiclink' | 'email';

const OTP_TTL_MS = 10 * 60 * 1000;

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function generateOtpCode(): string {
  const max = 10 ** OTP_CODE_LENGTH;
  const min = 10 ** (OTP_CODE_LENGTH - 1);
  return String(Math.floor(min + Math.random() * (max - min)));
}

function otpDocId(email: string): string {
  return normalizeEmail(email).replace(/[^a-z0-9@._-]/g, '_');
}

export async function storeOtpSession(params: {
  email: string;
  userId: string;
  purpose: OtpPurpose;
}): Promise<{ deliveryOtp: string; otpBridgeCookie: string }> {
  const email = normalizeEmail(params.email);
  const deliveryOtp = generateOtpCode();
  const db = getFirebaseAdminFirestore();

  await db.collection('otp_sessions').doc(otpDocId(email)).set({
    email,
    userId: params.userId,
    purpose: params.purpose,
    code: deliveryOtp,
    expiresAt: Date.now() + OTP_TTL_MS,
    createdAt: Date.now(),
  });

  const issue: OtpBridgeIssue = {
    email,
    deliveryOtp,
    verifyToken: deliveryOtp,
    otpType: params.purpose === 'login' || params.purpose === 'magiclink' ? 'magiclink' : 'signup',
  };

  return {
    deliveryOtp,
    otpBridgeCookie: issueOtpVerificationBridge(issue),
  };
}

export async function verifyOtpSession(params: {
  email: string;
  code: string;
}): Promise<{ ok: true; userId: string } | { ok: false; message: string }> {
  const email = normalizeEmail(params.email);
  const code = params.code.replace(/\D/g, '');

  if (code.length !== OTP_CODE_LENGTH) {
    return { ok: false, message: `رمز التحقق يجب أن يكون ${OTP_CODE_LENGTH} أرقام.` };
  }

  const db = getFirebaseAdminFirestore();
  const ref = db.collection('otp_sessions').doc(otpDocId(email));
  const snap = await ref.get();

  if (!snap.exists) {
    return { ok: false, message: 'رمز التحقق غير صحيح أو منتهي.' };
  }

  const data = snap.data() as {
    userId?: string;
    code?: string;
    expiresAt?: number;
  };

  if (!data.userId || data.code !== code) {
    return { ok: false, message: 'رمز التحقق غير صحيح.' };
  }

  if (typeof data.expiresAt === 'number' && Date.now() > data.expiresAt) {
    await ref.delete().catch(() => undefined);
    return { ok: false, message: 'انتهت صلاحية رمز التحقق. اطلب رمزاً جديداً.' };
  }

  await ref.delete().catch(() => undefined);
  return { ok: true, userId: data.userId };
}

export async function createFirebaseSessionBundle(userId: string): Promise<{
  customToken: string;
  userId: string;
}> {
  const auth = getFirebaseAdminAuth();
  const customToken = await auth.createCustomToken(userId);
  return { customToken, userId };
}

export async function markFirebaseEmailVerified(userId: string): Promise<void> {
  await getFirebaseAdminAuth().updateUser(userId, { emailVerified: true });
}
