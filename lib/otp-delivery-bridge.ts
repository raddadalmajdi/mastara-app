import { createHmac, timingSafeEqual } from 'crypto';

export type OtpBridgeType = 'signup' | 'email' | 'magiclink';

/** مدة صلاحية جسر التحقق — يجب أن تكون ≥ نافذة Supabase OTP (افتراضياً 3600 ث). */
const OTP_BRIDGE_TTL_MS = 60 * 60 * 1000;
export const OTP_BRIDGE_COOKIE_NAME = '__mastara_otp_v';

type BridgePayload = {
  e: string;
  d: string;
  v: string;
  t: OtpBridgeType;
  x: number;
};

type BridgeEntry = {
  deliveryOtp: string;
  verifyToken: string;
  otpType: OtpBridgeType;
  expiresAt: number;
};

export type OtpBridgeIssue = {
  email: string;
  deliveryOtp: string;
  verifyToken: string;
  otpType: OtpBridgeType;
};

const bridgeByEmail = new Map<string, BridgeEntry>();

function normalizeEmailKey(email: string): string {
  return email.trim().toLowerCase();
}

function getSigningSecret(): string {
  const secret =
    process.env.OTP_BRIDGE_SECRET?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!secret) {
    throw new Error('Missing OTP bridge signing secret (SUPABASE_SERVICE_ROLE_KEY).');
  }
  return secret;
}

function signPayload(payload: BridgePayload): string {
  const json = JSON.stringify(payload);
  const b64 = Buffer.from(json, 'utf8').toString('base64url');
  const sig = createHmac('sha256', getSigningSecret()).update(b64).digest('base64url');
  return `${b64}.${sig}`;
}

function verifySignedPayload(token: string): BridgePayload | null {
  const dot = token.indexOf('.');
  if (dot <= 0) return null;

  const b64 = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = createHmac('sha256', getSigningSecret()).update(b64).digest('base64url');

  try {
    const sigBuf = Buffer.from(sig, 'utf8');
    const expectedBuf = Buffer.from(expected, 'utf8');
    if (sigBuf.length !== expectedBuf.length) return null;
    if (!timingSafeEqual(sigBuf, expectedBuf)) return null;
  } catch {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(b64, 'base64url').toString('utf8')) as BridgePayload;
    if (!payload.e || !payload.d || !payload.v || !payload.t || !payload.x) return null;
    if (Date.now() > payload.x) return null;
    return payload;
  } catch {
    return null;
  }
}

function readCookieValue(cookieHeader: string | null | undefined, name: string): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const trimmed = part.trim();
    if (trimmed.startsWith(`${name}=`)) {
      return decodeURIComponent(trimmed.slice(name.length + 1));
    }
  }
  return null;
}

function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

export function createOtpBridgeCookieHeader(issue: OtpBridgeIssue): string {
  const payload: BridgePayload = {
    e: normalizeEmailKey(issue.email),
    d: issue.deliveryOtp,
    v: issue.verifyToken,
    t: issue.otpType,
    x: Date.now() + OTP_BRIDGE_TTL_MS,
  };
  const value = signPayload(payload);
  const secure = isProduction() ? '; Secure' : '';
  return `${OTP_BRIDGE_COOKIE_NAME}=${encodeURIComponent(value)}; Path=/; HttpOnly${secure}; SameSite=Lax; Max-Age=${Math.floor(OTP_BRIDGE_TTL_MS / 1000)}`;
}

export function createClearOtpBridgeCookieHeader(): string {
  const secure = isProduction() ? '; Secure' : '';
  return `${OTP_BRIDGE_COOKIE_NAME}=; Path=/; HttpOnly${secure}; SameSite=Lax; Max-Age=0`;
}

/** يُسجّل جسر التحقق في الذاكرة (احتياطي محلي) ويُرجع رأس Set-Cookie للبيئات Serverless. */
export function issueOtpVerificationBridge(issue: OtpBridgeIssue): string {
  bridgeByEmail.set(normalizeEmailKey(issue.email), {
    deliveryOtp: issue.deliveryOtp,
    verifyToken: issue.verifyToken,
    otpType: issue.otpType,
    expiresAt: Date.now() + OTP_BRIDGE_TTL_MS,
  });
  return createOtpBridgeCookieHeader(issue);
}

function resolveFromMemory(
  email: string,
  userToken: string
): { verifyToken: string; otpType: OtpBridgeType } | null {
  const key = normalizeEmailKey(email);
  const entry = bridgeByEmail.get(key);
  if (!entry) return null;

  if (Date.now() > entry.expiresAt) {
    bridgeByEmail.delete(key);
    return null;
  }

  const normalizedUser = userToken.replace(/\D/g, '');
  if (normalizedUser !== entry.deliveryOtp) return null;

  return { verifyToken: entry.verifyToken, otpType: entry.otpType };
}

export function resolveOtpVerificationBridge(
  cookieHeader: string | null | undefined,
  email: string,
  userToken: string
): { verifyToken: string; otpType: OtpBridgeType } | null {
  const normalizedUser = userToken.replace(/\D/g, '');
  const normalizedEmail = normalizeEmailKey(email);

  const cookieValue = readCookieValue(cookieHeader, OTP_BRIDGE_COOKIE_NAME);
  if (cookieValue) {
    const payload = verifySignedPayload(cookieValue);
    if (
      payload &&
      payload.e === normalizedEmail &&
      payload.d === normalizedUser
    ) {
      return { verifyToken: payload.v, otpType: payload.t };
    }
  }

  return resolveFromMemory(normalizedEmail, normalizedUser);
}

export function clearOtpVerificationBridge(email: string): void {
  bridgeByEmail.delete(normalizeEmailKey(email));
}

/** @deprecated Use issueOtpVerificationBridge */
export function registerOtpDeliveryBridge(
  email: string,
  deliveryOtp: string,
  verifyToken: string,
  otpType: OtpBridgeType = 'email'
): void {
  issueOtpVerificationBridge({ email, deliveryOtp, verifyToken, otpType });
}

/** @deprecated Use resolveOtpVerificationBridge */
export function resolveVerifyTokenForDelivery(
  email: string,
  userToken: string
): string | null {
  return resolveOtpVerificationBridge(null, email, userToken)?.verifyToken ?? null;
}

/** @deprecated Use clearOtpVerificationBridge */
export function clearOtpDeliveryBridge(email: string): void {
  clearOtpVerificationBridge(email);
}
