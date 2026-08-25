import { createRequire } from 'module';

/** يحمّل firebase-admin فرعياً — مسار ديناميكي بالكامل لتفادي rewrite من Turbopack. */
function loadAdminSubpath(sub: string): unknown {
  const req = createRequire(import.meta.url);
  const runReq = new Function('r', 'pkg', 'sub', 'return r(pkg + "/" + sub)') as (
    request: NodeRequire,
    pkg: string,
    subpath: string
  ) => unknown;
  const pkg = ['fire', 'base', '-', 'admin'].join('');
  return runReq(req, pkg, sub);
}

function adminApp(): typeof import('firebase-admin/app') {
  return loadAdminSubpath('app') as typeof import('firebase-admin/app');
}

function adminAuth(): typeof import('firebase-admin/auth') {
  return loadAdminSubpath('auth') as typeof import('firebase-admin/auth');
}

function adminFirestore(): typeof import('firebase-admin/firestore') {
  return loadAdminSubpath('firestore') as typeof import('firebase-admin/firestore');
}

function adminStorage(): typeof import('firebase-admin/storage') {
  return loadAdminSubpath('storage') as typeof import('firebase-admin/storage');
}

function parseServiceAccount(raw: string): import('firebase-admin/app').ServiceAccount | null {
  try {
    return JSON.parse(raw) as import('firebase-admin/app').ServiceAccount;
  } catch {
    try {
      return JSON.parse(Buffer.from(raw, 'base64').toString('utf8')) as import('firebase-admin/app').ServiceAccount;
    } catch {
      return null;
    }
  }
}

function initFirebaseAdmin(): import('firebase-admin/app').App {
  const { getApps, initializeApp, applicationDefault, cert } = adminApp();

  if (getApps().length > 0) {
    return getApps()[0]!;
  }

  const projectId =
    process.env.FIREBASE_PROJECT_ID ??
    process.env.GCLOUD_PROJECT ??
    process.env.GCP_PROJECT ??
    'eysalk-2c7be';
  const storageBucket = process.env.FIREBASE_STORAGE_BUCKET ?? 'eysalk-2c7be.appspot.com';

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY?.trim();
  if (raw) {
    const serviceAccount = parseServiceAccount(raw);
    if (serviceAccount) {
      return initializeApp({
        credential: cert(serviceAccount),
        projectId,
        storageBucket,
      });
    }
    console.error('[firebase-admin] FIREBASE_SERVICE_ACCOUNT_KEY is set but invalid JSON.');
  }

  return initializeApp({
    credential: applicationDefault(),
    projectId,
    storageBucket,
  });
}

export function getFirebaseAdminApp(): import('firebase-admin/app').App {
  return initFirebaseAdmin();
}

export function getFirebaseAdminAuth(): import('firebase-admin/auth').Auth {
  const { getAuth } = adminAuth();
  return getAuth(getFirebaseAdminApp());
}

export function getFirebaseAdminFirestore(): import('firebase-admin/firestore').Firestore {
  const { getFirestore } = adminFirestore();
  return getFirestore(getFirebaseAdminApp());
}

export function getFirebaseAdminStorage(): import('firebase-admin/storage').Storage {
  const { getStorage } = adminStorage();
  return getStorage(getFirebaseAdminApp());
}
