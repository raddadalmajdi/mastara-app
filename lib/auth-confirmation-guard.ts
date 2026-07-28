/**
 * حارس تحقّق بريد إلكتروني مستقل تماماً عن إعداد "Confirm email" في لوحة
 * تحكم Supabase (Authentication → Providers → Email).
 *
 * لماذا هذا ضروري؟
 * - إن كان ذلك الإعداد معطّلاً (كما طُلب مؤقتاً في جلسة سابقة لتشخيص خطأ
 *   SMTP)، فإن Supabase يسمح بتسجيل الدخول فوراً حتى لو لم يُتحقق من البريد
 *   إطلاقاً — أي أن `supabase.auth.signInWithPassword` أو حتى `signUp` قد
 *   يُرجعان جلسة (session) صالحة لمستخدم لم يُدخل رمز الـ OTP قط.
 * - لذلك لا يجوز الاعتماد على "وجود جلسة" كدليل كافٍ على أن المستخدم أكمل
 *   التحقق. المصدر الوحيد للحقيقة الذي **لا يتأثر** بذلك الإعداد هو حقل
 *   `email_confirmed_at` (أو `confirmed_at`) على كائن المستخدم نفسه — هذا
 *   الحقل لا يُضبط من Supabase تلقائياً إلا في حالتين فقط:
 *     1) نجاح `supabase.auth.verifyOtp(...)` (أي إدخال رمز الـ OTP بنجاح).
 *     2) استدعاء صريح لـ `admin.auth.admin.updateUserById(id, { email_confirm: true })`
 *        من الخادم (لا نستخدمه في هذا المشروع بعد نجاح createUser بقصد).
 *
 * كل نقطة في التطبيق تحصل فيها على "جلسة" (تسجيل دخول، تسجيل حساب جديد،
 * استعادة جلسة عند فتح الصفحة، `onAuthStateChange`) **يجب** أن تمرّ عبر
 * `isEmailVerifiedUser` قبل معاملة المستخدم كمُسجَّل دخوله فعلياً؛ إن كانت
 * `false`، يجب تسجيل خروجه فوراً (supabase.auth.signOut) وتوجيهه لشاشة
 * إدخال رمز الـ OTP — بغض النظر عمّا يقوله إعداد لوحة Supabase.
 */
export type MinimalConfirmableUser = {
  email_confirmed_at?: string | null;
  confirmed_at?: string | null;
} | null | undefined;

export function isEmailVerifiedUser(user: MinimalConfirmableUser): boolean {
  if (!user) return false;
  return Boolean(user.email_confirmed_at || user.confirmed_at);
}
