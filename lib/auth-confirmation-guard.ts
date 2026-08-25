/**
 * حارس تحقّق البريد الإلكتروني — مستقل عن إعدادات Firebase Auth في لوحة التحكم.
 *
 * لا يكفي وجود جلسة Firebase لاعتبار المستخدم مُحقَّقاً؛ المصدر الوحيد للحقيقة
 * هو `emailVerified` على كائن المستخدم (أو حقول التوافق `email_confirmed_at`).
 *
 * كل نقطة تحصل فيها على جلسة (تسجيل دخول، استعادة جلسة، onAuthStateChanged)
 * يجب أن تمرّ عبر `isEmailVerifiedUser` قبل معاملة المستخدم كمُسجَّل دخوله فعلياً.
 */
export type MinimalConfirmableUser = {
  email_confirmed_at?: string | null;
  confirmed_at?: string | null;
  emailVerified?: boolean;
} | null | undefined;

export function isEmailVerifiedUser(user: MinimalConfirmableUser): boolean {
  if (!user) return false;
  if (typeof user.emailVerified === 'boolean') return user.emailVerified;
  return Boolean(user.email_confirmed_at || user.confirmed_at);
}
