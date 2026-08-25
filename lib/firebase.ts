import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { getStorage, type FirebaseStorage } from 'firebase/storage';

/** إعداد Firebase Web SDK — يُقرأ من متغيرات NEXT_PUBLIC_* (لا مفاتيح ثابتة في الكود). */
function readFirebaseConfig() {
  return {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY?.trim() ?? '',
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN?.trim() ?? '',
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim() ?? '',
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET?.trim() ?? '',
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID?.trim() ?? '',
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID?.trim() ?? '',
  };
}

const firebaseConfig = readFirebaseConfig();

let app: FirebaseApp | null = null;

export function getFirebaseApp(): FirebaseApp {
  if (typeof window === 'undefined') {
    throw new Error('getFirebaseApp() is client-only.');
  }
  if (!isFirebaseConfigured()) {
    throw new Error(
      'إعداد Firebase غير مكتمل. أضف متغيرات NEXT_PUBLIC_FIREBASE_* في .env.local (راجع .env.example).'
    );
  }
  if (!app) {
    app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
  }
  return app;
}

export function getFirebaseAuthClient(): Auth {
  return getAuth(getFirebaseApp());
}

export function getFirebaseFirestoreClient(): Firestore {
  return getFirestore(getFirebaseApp());
}

export function getFirebaseStorageClient(): FirebaseStorage {
  return getStorage(getFirebaseApp());
}

export function isFirebaseConfigured(): boolean {
  return Boolean(
    firebaseConfig.apiKey &&
      firebaseConfig.authDomain &&
      firebaseConfig.projectId &&
      firebaseConfig.storageBucket &&
      firebaseConfig.messagingSenderId &&
      firebaseConfig.appId
  );
}

export { firebaseConfig };
