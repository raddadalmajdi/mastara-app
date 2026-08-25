import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { getStorage, type FirebaseStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: 'AIzaSyBLuNdKEL9N3tw-wYZRoCO2jukC4mYNjnM',
  authDomain: 'eysalk-2c7be.firebaseapp.com',
  projectId: 'eysalk-2c7be',
  storageBucket: 'eysalk-2c7be.firebasestorage.app',
  messagingSenderId: '1006612883323',
  appId: '1:1006612883323:web:3014c259dbd41e72493fde',
};

let app: FirebaseApp | null = null;

export function getFirebaseApp(): FirebaseApp {
  if (typeof window === 'undefined') {
    throw new Error('getFirebaseApp() is client-only.');
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
  return Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);
}

export { firebaseConfig };
