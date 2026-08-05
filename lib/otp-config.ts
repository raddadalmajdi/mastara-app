/**
 * طول رمز OTP من Supabase — يجب أن يطابق عدد خانات الإدخال في الواجهة.
 * Supabase يُولّد 8 أرقام (مثل 68521541 في بريد تسجيل الدخول).
 */
export const OTP_CODE_LENGTH = 8;

/** للاستخدام في النصوص العربية — يُشتق تلقائياً من OTP_CODE_LENGTH (مثلاً «8 أرقام»). */
export const OTP_LENGTH_AR = `${OTP_CODE_LENGTH} أرقام`;
