import { createRequire } from 'module';
import {
  getFirebaseProjectId,
  getFirebaseServiceAccount,
  isGoogleCloudRuntime,
  isVercelRuntime,
} from '@/lib/firebase-service-account';

/** يحمّل firebase-admin فرعياً — Vercel: require مباشر؛ Firebase Turbopack: مسار ديناميكي. */
function loadAdminSubpath(sub: string): unknown {
  const req = createRequire(import.meta.url);

  if (isVercelRuntime() || process.env.NODE_ENV === 'development') {
    return req(`firebase-admin/${sub}`);
  }

  const runReq = new Function('r', 'pkg', 's', 'return r(pkg + "/" + s)') as (
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

function initFirebaseAdmin(): import('firebase-admin/app').App {
  const { getApps, initializeApp, applicationDefault, cert } = adminApp();

  if (getApps().length > 0) {
    return getApps()[0]!;
  }

  const projectId = getFirebaseProjectId();
  const storageBucket = process.env.FIREBASE_STORAGE_BUCKET ?? `${projectId}.appspot.com`;

  const serviceAccount = getFirebaseServiceAccount();
  if (serviceAccount) {
    return initializeApp({
      credential: cert(serviceAccount as import('firebase-admin/app').ServiceAccount),
      projectId,
      storageBucket,
    });
  }

  if (isGoogleCloudRuntime()) {
    return initializeApp({
      credential: applicationDefault(),
      projectId,
      storageBucket,
    });
  }

  throw new Error(
    'FIREBASE_SERVICE_ACCOUNT_KEY غير مضبوط — مطلوب لتهيئة firebase-admin على Vercel.'
  );
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
