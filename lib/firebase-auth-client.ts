'use client';

import {
  onAuthStateChanged,
  signInWithCustomToken,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from 'firebase/auth';
import { getFirebaseAuthClient, isFirebaseConfigured } from '@/lib/firebase';
import { getAuthCallbackUrl, assertValidEmailRedirectTo, getAppPublicUrl } from '@/lib/app-env';

export type FirebaseAuthUser = User;

export { getAuthCallbackUrl, assertValidEmailRedirectTo, getAppPublicUrl, isFirebaseConfigured };

export function getFirebaseAuth() {
  if (typeof window === 'undefined') return null;
  if (!isFirebaseConfigured()) return null;
  return getFirebaseAuthClient();
}

export async function getFirebaseIdToken(): Promise<string | null> {
  const auth = getFirebaseAuth();
  if (!auth?.currentUser) return null;
  return auth.currentUser.getIdToken();
}

export async function firebaseSignInWithCustomToken(customToken: string) {
  const auth = getFirebaseAuth();
  if (!auth) throw new Error('Firebase Auth غير متاح.');
  return signInWithCustomToken(auth, customToken);
}

export async function firebaseSignInWithPassword(email: string, password: string) {
  const auth = getFirebaseAuth();
  if (!auth) throw new Error('Firebase Auth غير متاح.');
  return signInWithEmailAndPassword(auth, email.trim(), password);
}

export async function firebaseSignOut() {
  const auth = getFirebaseAuth();
  if (!auth) return;
  await signOut(auth);
}

export function subscribeFirebaseAuth(callback: (user: User | null) => void) {
  const auth = getFirebaseAuth();
  if (!auth) {
    callback(null);
    return () => undefined;
  }
  return onAuthStateChanged(auth, callback);
}

export function isEmailVerifiedFirebaseUser(user: User | null | undefined): boolean {
  return Boolean(user?.emailVerified);
}
