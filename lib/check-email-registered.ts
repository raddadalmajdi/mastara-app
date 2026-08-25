export const DUPLICATE_EMAIL_MESSAGE =
  'هذا البريد الإلكتروني مسجل مسبقاً، يرجى استخدام بريد آخر أو تسجيل الدخول.';

export function isDuplicateEmailMessage(message: string): boolean {
  return message === DUPLICATE_EMAIL_MESSAGE || message.includes('مسجل مسبقاً');
}
