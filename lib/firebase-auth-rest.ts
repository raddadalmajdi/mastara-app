import { createSign } from 'node:crypto';
import {
  getFirebaseProjectId,
  getFirebaseServiceAccount,
  isGoogleCloudRuntime,
  type FirebaseServiceAccount,
} from '@/lib/firebase-service-account';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const IDENTITY_SCOPE = 'https://www.googleapis.com/auth/identitytoolkit';

let cachedToken: { value: string; expiresAt: number } | null = null;

function base64Url(input: string | Buffer): string {
  return Buffer.from(input).toString('base64url');
}

async function fetchAccessTokenFromMetadata(): Promise<string> {
  const scopes = [
    'https://www.googleapis.com/auth/identitytoolkit',
    'https://www.googleapis.com/auth/cloud-platform',
  ].join(',');
  const res = await fetch(
    `http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token?scopes=${encodeURIComponent(scopes)}`,
    { headers: { 'Metadata-Flavor': 'Google' } }
  );

  if (!res.ok) {
    throw new Error(`Metadata token fetch failed (${res.status}).`);
  }

  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) {
    throw new Error('Metadata server did not return access_token.');
  }

  return json.access_token;
}

function signServiceAccountJwt(account: FirebaseServiceAccount): string {
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = base64Url(
    JSON.stringify({
      iss: account.client_email,
      sub: account.client_email,
      aud: TOKEN_URL,
      iat: now,
      exp: now + 3600,
      scope: IDENTITY_SCOPE,
    })
  );

  const unsigned = `${header}.${payload}`;
  const signature = createSign('RSA-SHA256')
    .update(unsigned)
    .sign(account.private_key.replace(/\\n/g, '\n'), 'base64url');

  return `${unsigned}.${signature}`;
}

async function fetchAccessTokenFromServiceAccount(
  account: FirebaseServiceAccount
): Promise<string> {
  const assertion = signServiceAccountJwt(account);

  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion,
  });

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  const json = (await res.json()) as { access_token?: string; error?: string };
  if (!res.ok || !json.access_token) {
    throw new Error(json.error ?? `Service account token exchange failed (${res.status}).`);
  }

  return json.access_token;
}

/** Access token لـ Firebase Auth REST — ADC على GCP أو Service Account على Vercel/محلي. */
export async function getFirebaseAuthAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.value;
  }

  const serviceAccount = getFirebaseServiceAccount();
  let token: string;

  if (serviceAccount) {
    token = await fetchAccessTokenFromServiceAccount(serviceAccount);
  } else if (isGoogleCloudRuntime()) {
    token = await fetchAccessTokenFromMetadata();
  } else {
    throw new Error(
      'FIREBASE_SERVICE_ACCOUNT_KEY غير مضبوط — مطلوب على Vercel والبيئات خارج Google Cloud.'
    );
  }

  cachedToken = { value: token, expiresAt: Date.now() + 55 * 60 * 1000 };
  return token;
}

type LookupResponse = {
  users?: Array<{ localId?: string; email?: string }>;
  error?: { message?: string };
};

/** يبحث عن مستخدم Auth بالبريد عبر Identity Toolkit REST (بدون firebase-admin). */
export async function lookupAuthUserByEmailRest(
  email: string
): Promise<{ id: string; email?: string } | null> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;

  const projectId = getFirebaseProjectId();
  const accessToken = await getFirebaseAuthAccessToken();

  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/projects/${projectId}/accounts:lookup`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email: [normalized] }),
    }
  );

  const json = (await res.json()) as LookupResponse;

  if (!res.ok) {
    const message = json.error?.message ?? `Auth lookup failed (${res.status}).`;
    throw new Error(message);
  }

  const user = json.users?.[0];
  if (!user?.localId) return null;

  return { id: user.localId, email: user.email ?? normalized };
}
