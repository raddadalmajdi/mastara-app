import { lookupAuthUserByEmailRest } from '@/lib/firebase-auth-rest';

/** يبحث عن مستخدم Firebase Auth بالبريد (REST — متوافق مع Vercel و Firebase Hosting). */
export async function findAuthUserByEmail(
  email: string
): Promise<{ id: string; email?: string } | null> {
  return lookupAuthUserByEmailRest(email);
}
