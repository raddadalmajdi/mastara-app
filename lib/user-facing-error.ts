const GENERIC_ERROR = 'حدث خطأ غير متوقع، يرجى المحاولة مرة أخرى.';

const SCHEMA_CACHE_HINT =
  'تعذّر إتمام العملية مؤقتاً. حدّث الصفحة وحاول مجدداً، أو تواصل مع الدعم إن استمرّ الخطأ.';

/** يكتشف رسائل PostgREST/Supabase التقنية التي لا يجب عرضها للمستخدم. */
export function isSupabaseTechnicalMessage(message: string): boolean {
  const lower = message.toLowerCase();

  if (
    lower.includes('schema cache') ||
    lower.includes('pgrst204') ||
    lower.includes('pgrst') ||
    lower.includes('postgrest') ||
    lower.includes('expires_at') ||
    lower.includes('updated_at') ||
    lower.includes('created_at') ||
    /could not find the '[^']+' column/.test(lower) ||
    (lower.includes('column') && lower.includes('does not exist'))
  ) {
    return true;
  }

  return false;
}

function hasArabic(text: string): boolean {
  return /[\u0600-\u06FF]/.test(text);
}

/**
 * ينقّي رسائل الأخطاء قبل عرضها في الواجهة — يخفّي تفاصيل Schema Cache وأعمدة DB.
 */
export function sanitizeUserFacingMessage(
  message: string | null | undefined,
  fallback: string = GENERIC_ERROR
): string {
  if (!message?.trim()) return fallback;

  const trimmed = message.trim();

  if (isSupabaseTechnicalMessage(trimmed)) {
    return SCHEMA_CACHE_HINT;
  }

  if (hasArabic(trimmed) && trimmed.length >= 8) {
    return trimmed;
  }

  return fallback;
}

/** استخراج رسالة آمنة من unknown Error. */
export function getUserFacingErrorMessage(
  error: unknown,
  fallback: string = GENERIC_ERROR
): string {
  if (error instanceof Error) {
    return sanitizeUserFacingMessage(error.message, fallback);
  }
  return fallback;
}
