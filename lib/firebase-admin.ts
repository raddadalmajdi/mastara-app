import { cert, getApps, initializeApp, type App, type ServiceAccount } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { getStorage, type Storage } from 'firebase-admin/storage';

function initFirebaseAdmin(): App {
  if (getApps().length > 0) {
    return getApps()[0]!;
  }

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY?.trim();
  if (raw) {
    const serviceAccount = JSON.parse(raw) as ServiceAccount;
    return initializeApp({
      credential: cert(serviceAccount),
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET ?? 'eysalk-2c7be.appspot.com',
    });
  }

  return initializeApp({
    projectId: process.env.FIREBASE_PROJECT_ID ?? 'eysalk-2c7be',
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET ?? 'eysalk-2c7be.appspot.com',
  });
}

export function getFirebaseAdminApp(): App {
  return initFirebaseAdmin();
}

export function getFirebaseAdminAuth(): Auth {
  return getAuth(getFirebaseAdminApp());
}

export function getFirebaseAdminFirestore(): Firestore {
  return getFirestore(getFirebaseAdminApp());
}

export function getFirebaseAdminStorage(): Storage {
  return getStorage(getFirebaseAdminApp());
}
