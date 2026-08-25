/**
 * طول رمز OTP المعتمد في الواجهة والبريد (6 أرقام).
 */
export const OTP_CODE_LENGTH = 6;

/** للاستخدام في النصوص العربية — يُشتق تلقائياً من OTP_CODE_LENGTH (مثلاً «6 أرقام»). */
export const OTP_LENGTH_AR = `${OTP_CODE_LENGTH} أرقام`;
