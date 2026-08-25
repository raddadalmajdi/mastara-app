import { createRequire } from 'module';
import type admin from 'firebase-admin';
import {
  getFirebaseProjectId,
  getFirebaseServiceAccount,
  isGoogleCloudRuntime,
  isVercelRuntime,
} from '@/lib/firebase-service-account';

type FirebaseAdmin = typeof admin;

let adminModule: FirebaseAdmin | null = null;

/** يحمّل firebase-admin — Vercel/محلي: require مباشر؛ Firebase Turbopack: مسار ديناميكي. */
function loadAdmin(): FirebaseAdmin {
  if (adminModule) return adminModule;

  const req = createRequire(import.meta.url);

  if (isVercelRuntime() || process.env.NODE_ENV === 'development') {
    adminModule = req('firebase-admin') as FirebaseAdmin;
    return adminModule;
  }

  const runReq = new Function('r', 'pkg', 'return r(pkg)') as (
    request: NodeRequire,
    pkg: string
  ) => FirebaseAdmin;
  adminModule = runReq(req, ['fire', 'base', '-', 'admin'].join(''));
  return adminModule;
}

function ensureInitialized(): FirebaseAdmin {
  const admin = loadAdmin();

  if (admin.apps.length > 0) {
    return admin;
  }

  const projectId = getFirebaseProjectId();
  const storageBucket = process.env.FIREBASE_STORAGE_BUCKET ?? `${projectId}.appspot.com`;

  const serviceAccount = getFirebaseServiceAccount();
  if (serviceAccount) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount as admin.ServiceAccount),
      projectId,
      storageBucket,
    });
    return admin;
  }

  if (isGoogleCloudRuntime()) {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      projectId,
      storageBucket,
    });
    return admin;
  }

  throw new Error(
    'FIREBASE_SERVICE_ACCOUNT_KEY غير مضبوط — مطلوب لتهيئة firebase-admin على Vercel.'
  );
}

export function getFirebaseAdminApp(): admin.app.App {
  return ensureInitialized().app();
}

export function getFirebaseAdminAuth(): admin.auth.Auth {
  return ensureInitialized().auth();
}

export function getFirebaseAdminFirestore(): admin.firestore.Firestore {
  return ensureInitialized().firestore();
}

export function getFirebaseAdminStorage(): admin.storage.Storage {
  return ensureInitialized().storage();
}
