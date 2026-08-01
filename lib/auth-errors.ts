import { logSupabaseAuthErrorJson } from '@/lib/auth-debug';

type AuthErrorLike = {
  message?: string;
  code?: string;
  status?: number;
};

export type { AuthErrorLike };

const GENERIC_ERROR = 'حدث خطأ غير متوقع، يرجى المحاولة مرة أخرى.';

function hasArabic(text: string): boolean {
  return /[\u0600-\u06FF]/.test(text);
}

/** للتشخيص المؤقت في التطوير — يطبع الخطأ الكامل من Supabase/GoTrue. */
export function logSupabaseAuthError(
  error: AuthErrorLike | null | undefined,
  context?: string
): void {
  logSupabaseAuthErrorJson(error, context);
}

/**
 * ينقّي الرسائل الخام ويمنع ظهور رسائل أدوات المطور للمستخدم النهائي.
 */
export function sanitizeAuthUserMessage(message: string): string {
  const lower = message.toLowerCase();
  const trimmed = message.trim();

  if (
    message.includes('[DEV]') ||
    lower.includes('service_role') ||
    lower.includes('admin api') ||
    (message.includes('لم ي') && message.includes('عثر') && message.includes('مستخدم'))
  ) {
    return GENERIC_ERROR;
  }

  if (lower.includes('invalid login credentials') || lower.includes('invalid grant')) {
    return 'البريد الإلكتروني أو كلمة المرور غير صحيحة.';
  }

  if (
    lower.includes('user not found') ||
    lower.includes('لم يُعثر على مستخدم') ||
    lower.includes('no user found')
  ) {
    return 'هذا البريد غير مسجل، يرجى إنشاء حساب جديد.';
  }

  if (
    lower.includes('email rate limit') ||
    lower.includes('too many requests') ||
    lower.includes('over_email_send_rate_limit')
  ) {
    return 'تم إرسال طلبات كثيرة في وقت قصير، يرجى المحاولة بعد قليل.';
  }

  if (lower.includes('invalid email') || lower.includes('email address') && lower.includes('invalid')) {
    return 'صيغة البريد الإلكتروني غير صحيحة. تحقق من الكتابة وحاول مجدداً.';
  }

  if (lower.includes('password') && (lower.includes('short') || lower.includes('least') || lower.includes('weak'))) {
    return 'كلمة المرور ضعيفة أو قصيرة. استخدم 6 أحرف على الأقل.';
  }

  if (lower.includes('already registered') || lower.includes('already been registered')) {
    return 'هذا البريد الإلكتروني مسجل مسبقاً، يرجى استخدام بريد آخر أو تسجيل الدخول.';
  }

  if (
    lower.includes('smtp') ||
    lower.includes('resend') ||
    lower.includes('mail server') ||
    lower.includes('error sending') ||
    lower.includes('confirmation email') ||
    lower.includes('send email') ||
    lower.includes('email address is not authorized')
  ) {
    return 'تعذّر إرسال بريد التفعيل. تحقق من إعدادات SMTP (Resend) في Supabase أو انتظر دقيقة وحاول مجدداً.';
  }

  if (
    lower.includes('redirect') &&
    (lower.includes('not allowed') || lower.includes('invalid') || lower.includes('mismatch'))
  ) {
    return 'إعداد عنوان الاستدعاء (Redirect URL) غير صحيح في Supabase → Authentication → URL Configuration.';
  }

  if (lower.includes('signup') && lower.includes('disabled')) {
    return 'التسجيل غير متاح حالياً في إعدادات المشروع.';
  }

  if (lower.includes('hook') && lower.includes('fail')) {
    return 'فشل إرسال البريد عبر خطاف Auth. راجع إعدادات SMTP/Resend في Supabase.';
  }

  if (lower.includes('captcha') || lower.includes('turnstile')) {
    return 'فشل التحقق الأمني (Captcha). حدّث الصفحة وحاول مجدداً.';
  }

  if (hasArabic(trimmed) && trimmed.length >= 12) {
    return trimmed;
  }

  return GENERIC_ERROR;
}

const APP_AUTH_ERROR_CODES = new Set([
  'user_exists',
  'resend_send_failed',
  'resend_not_configured',
  'validation',
  'invalid_redirect',
  'generate_link_failed',
  'missing_link',
  'otp_unavailable',
  'create_user_failed',
  'invalid_response',
  'internal_error',
  'invalid_json',
  'network_error',
  'request_timeout',
]);

export function mapAuthErrorToArabic(error: AuthErrorLike | null | undefined): string {
  logSupabaseAuthError(error);

  if (!error) {
    return GENERIC_ERROR;
  }

  const code = error.code ?? '';
  const rawMessage = (error.message ?? '').trim();

  if (APP_AUTH_ERROR_CODES.has(code) && rawMessage.length > 0) {
    return rawMessage;
  }

  const msg = rawMessage.toLowerCase();
  const name = (error as { name?: string }).name ?? '';
  const status = error.status ?? 0;

  if (
    name === 'AuthRetryableFetchError' ||
    (status >= 500 && !APP_AUTH_ERROR_CODES.has(code)) ||
    msg.includes('retryablefetch')
  ) {
    return (
      '\u062a\u0639\u0630\u0651\u0631 \u0625\u0643\u0645\u0627\u0644 \u0627\u0644\u062a\u0633\u062c\u064a\u0644: \u062e\u0627\u062f\u0645 Supabase \u0623\u0648 SMTP (Resend) \u0641\u0634\u0644 \u063a\u0627\u0644\u0628\u0627\u064b \u0641\u064a \u0625\u0631\u0633\u0627\u0644 \u0628\u0631\u064a\u062f \u0627\u0644\u062a\u0641\u0639\u064a\u0644. ' +
      'راجع Authentication → SMTP في Supabase. إن وُجد حسابك، جرّب «تسجيل الدخول» أو «إعادة إرسال» التفعيل.'
    );
  }

  if (code === 'unexpected_failure' || code === 'bad_json') {
    return 'تعذّر الاتصال بخدمة المصادقة. حاول مجدداً أو راجع إعدادات Supabase/SMTP.';
  }

  if (code === 'email_address_invalid' || msg.includes('invalid email address')) {
    return 'صيغة البريد الإلكتروني غير صحيحة.';
  }

  if (code === 'otp_expired' || msg.includes('otp expired') || msg.includes('token has expired')) {
    return 'انتهت صلاحية رمز التحقق. اطلب رسالة جديدة وحاول مجدداً.';
  }

  if (code === 'otp_disabled' || (msg.includes('otp') && msg.includes('disabled'))) {
    return 'التحقق برمز OTP غير مفعّل حالياً في إعدادات Supabase. تواصل مع الدعم.';
  }

  if (
    msg.includes('invalid otp') ||
    msg.includes('invalid token') ||
    msg.includes('token is invalid') ||
    code === 'validation_failed'
  ) {
    return 'رمز التحقق غير صحيح. تأكد من إدخال آخر رمز وصلك (6 أرقام)، أو اطلب رمزاً جديداً.';
  }

  if (
    code === 'invalid_credentials' ||
    msg.includes('invalid login credentials') ||
    msg.includes('invalid email or password') ||
    msg.includes('invalid grant')
  ) {
    return 'البريد الإلكتروني أو كلمة المرور غير صحيحة.';
  }

  if (code === 'email_not_confirmed' || msg.includes('email not confirmed')) {
    return 'لم يتم تأكيد بريدك بعد. افتح رسالة التفعيل (تحقق من Spam) ثم سجّل الدخول.';
  }

  if (
    code === 'user_already_registered' ||
    msg.includes('already registered') ||
    msg.includes('already been registered')
  ) {
    return 'هذا البريد الإلكتروني مسجل مسبقاً، يرجى استخدام بريد آخر أو تسجيل الدخول.';
  }

  if (
    msg.includes('user not found') ||
    msg.includes('no user') ||
    code === 'user_not_found' ||
    (msg.includes('signups not allowed') && msg.includes('otp'))
  ) {
    return 'هذا البريد غير مسجل، يرجى إنشاء حساب جديد.';
  }

  if (code === 'weak_password' || (msg.includes('password') && msg.includes('weak'))) {
    return 'كلمة المرور ضعيفة. استخدم 6 أحرف على الأقل مع أرقام أو رموز.';
  }

  if (msg.includes('password') && (msg.includes('short') || msg.includes('least'))) {
    return 'كلمة المرور قصيرة جداً. يُفضّل 6 أحرف على الأقل.';
  }

  if (code === 'signup_disabled' || msg.includes('signups not allowed')) {
    return 'التسجيل غير متاح حالياً. تواصل مع الدعم.';
  }

  if (
    code === 'over_email_send_rate_limit' ||
    msg.includes('email rate limit') ||
    msg.includes('rate limit exceeded')
  ) {
    return 'تم إرسال طلبات كثيرة في وقت قصير، يرجى المحاولة بعد قليل.';
  }

  if (msg.includes('rate limit') || msg.includes('too many requests')) {
    return 'تم إرسال طلبات كثيرة في وقت قصير، يرجى المحاولة بعد قليل.';
  }

  if (
    msg.includes('smtp') ||
    msg.includes('resend') ||
    msg.includes('mail server') ||
    msg.includes('error sending') ||
    msg.includes('confirmation') ||
    msg.includes('email address is not authorized')
  ) {
    return 'تعذّر إرسال بريد التفعيل عبر SMTP. راجع Resend وSupabase Auth → SMTP، ثم حاول مجدداً.';
  }

  if (
    msg.includes('redirect') &&
    (msg.includes('not allowed') || msg.includes('invalid') || msg.includes('url'))
  ) {
    return 'إعداد عنوان الاستدعاء (Redirect URL) غير مسموح. أضف /auth/callback في Redirect URLs ضمن Supabase.';
  }

  if (msg.includes('network') || msg.includes('fetch') || msg.includes('failed to fetch')) {
    return 'تعذّر الاتصال بالخادم. تحقق من الإنترنت ومتغيرات NEXT_PUBLIC_SUPABASE_* محلياً.';
  }

  if (error.message) {
    return sanitizeAuthUserMessage(error.message);
  }

  if (code) {
    return sanitizeAuthUserMessage(code.replace(/_/g, ' '));
  }

  return GENERIC_ERROR;
}
