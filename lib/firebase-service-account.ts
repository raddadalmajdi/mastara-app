export type FirebaseServiceAccount = {
  project_id: string;
  client_email: string;
  private_key: string;
};

const DEFAULT_PROJECT_ID = 'eysalk-2c7be';

export function getFirebaseProjectId(): string {
  return (
    process.env.FIREBASE_PROJECT_ID?.trim() ||
    process.env.GCLOUD_PROJECT?.trim() ||
    process.env.GCP_PROJECT?.trim() ||
    DEFAULT_PROJECT_ID
  );
}

function parseJsonServiceAccount(raw: string): FirebaseServiceAccount | null {
  try {
    const parsed = JSON.parse(raw) as FirebaseServiceAccount;
    if (parsed.project_id && parsed.client_email && parsed.private_key) {
      return parsed;
    }
    return null;
  } catch {
    try {
      const decoded = Buffer.from(raw, 'base64').toString('utf8');
      const parsed = JSON.parse(decoded) as FirebaseServiceAccount;
      if (parsed.project_id && parsed.client_email && parsed.private_key) {
        return parsed;
      }
      return null;
    } catch {
      return null;
    }
  }
}

/** يقرأ حساب الخدمة من FIREBASE_SERVICE_ACCOUNT_KEY (JSON أو base64). */
export function getFirebaseServiceAccount(): FirebaseServiceAccount | null {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY?.trim();
  if (!raw) return null;
  return parseJsonServiceAccount(raw);
}

export function isGoogleCloudRuntime(): boolean {
  return Boolean(
    process.env.K_SERVICE ||
      process.env.FUNCTION_TARGET ||
      process.env.FUNCTIONS_EMULATOR ||
      process.env.GAE_ENV ||
      process.env.GOOGLE_CLOUD_PROJECT
  );
}

export function isVercelRuntime(): boolean {
  return Boolean(process.env.VERCEL);
}
