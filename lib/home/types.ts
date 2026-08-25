import type { FirebaseAuthUser } from '@/lib/firebase-auth-client';

export type AuthFeedback = { type: 'success' | 'error'; message: string } | null;

export type GuestUser = { id: string; email: string };
export type AppUser = FirebaseAuthUser | GuestUser;

export function appUserId(user: AppUser): string {
  return 'uid' in user ? user.uid : user.id;
}

export type CustomerBookStatus = 'idle' | 'searching' | 'known' | 'new';

export type CustomerInvoice = {
  id: string;
  customer_phone?: string;
  image_url: string;
  pdf_url?: string | null;
  created_at?: string;
};
