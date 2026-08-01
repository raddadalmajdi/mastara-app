import { OTP_LENGTH_AR } from '@/lib/otp-config';

/** نصوص موحّدة لتأكيد الحساب برمز التحقق (OTP). */
export const AUTH_CONFIRMATION_SENT =
  `أرسلنا رمز تحقق مكوّناً من ${OTP_LENGTH_AR} إلى بريدك (قد يتأخر دقيقة). أدخله أدناه لتفعيل حسابك. راجع مجلد Spam إن لم تظهر الرسالة.`;

export const AUTH_CONFIRMATION_RESENT =
  'أُرسل رمز جديد إلى بريدك. تحقق أيضاً من مجلد الرسائل غير المرغوبة (Spam) إن لم يصلك خلال دقيقة.';

export const AUTH_CONFIRMATION_LINK_HINT =
  'الرمز صالح لفترة محدودة فقط. إن انتهت صلاحيته اطلب رمزاً جديداً بالضغط على «إعادة الإرسال» أدناه.';

export const AUTH_OTP_OPTIONAL_LABEL = 'رمز التحقق المرسل إلى بريدك الإلكتروني';

export const AUTH_OTP_INCOMPLETE = `أدخل الرمز كاملاً (${OTP_LENGTH_AR}) المرسل إلى بريدك لتفعيل الحساب.`;

export const AUTH_UNCONFIRMED_LOGIN =
  `حسابك لم يُفعَّل بعد. أدخل رمز التحقق (${OTP_LENGTH_AR}) المرسل إلى بريدك، أو اطلب رمزاً جديداً.`;
