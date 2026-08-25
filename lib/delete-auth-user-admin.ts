import { findAuthUserByEmail } from '@/lib/check-email-registered-server';
import { getFirebaseAdminAuth } from '@/lib/firebase-admin';

export type DeleteAuthUserResult =
  | { ok: true; email: string; userId: string; message: string }
  | { ok: false; email: string; message: string };

export async function deleteAuthUserByEmail(email: string): Promise<DeleteAuthUserResult> {
  const normalized = email.trim().toLowerCase();

  if (!normalized) {
    return { ok: false, email: normalized, message: 'البريد الإلكتروني فارغ.' };
  }

  const matchedUser = await findAuthUserByEmail(normalized);

  if (!matchedUser) {
    return {
      ok: false,
      email: normalized,
      message: `لا يوجد مستخدم Auth بالبريد ${normalized} — يمكنك إنشاء حساب جديد من واجهة التسجيل.`,
    };
  }

  await getFirebaseAdminAuth().deleteUser(matchedUser.id);

  return {
    ok: true,
    email: matchedUser.email ?? normalized,
    userId: matchedUser.id,
    message: `تم حذف المستخدم نهائياً من Auth (${matchedUser.email ?? normalized}).`,
  };
}
