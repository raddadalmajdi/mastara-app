import { getFirebaseAdminAuth } from '@/lib/firebase-admin';

/** يبحث عن مستخدم Firebase Auth بالبريد (Admin SDK — للاستخدام على الخادم فقط). */
export async function findAuthUserByEmail(
  email: string
): Promise<{ id: string; email?: string } | null> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;

  try {
    const user = await getFirebaseAdminAuth().getUserByEmail(normalized);
    return { id: user.uid, email: user.email ?? undefined };
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === 'auth/user-not-found') return null;
    throw error;
  }
}
