/**
 * تسجيل تشخيصي لأخطاء المصادقة (تطوير فقط).
 */

export function serializeAuthError(error: unknown): string {
  if (error == null) {
    return 'null';
  }

  if (typeof error === 'string') {
    return error;
  }

  try {
    if (typeof error === 'object') {
      const record = error as Record<string, unknown>;
      const snapshot: Record<string, unknown> = {
        name: record.name,
        message: record.message,
        code: record.code,
        status: record.status,
        __isAuthError: record.__isAuthError,
      };

      try {
        for (const key of Object.getOwnPropertyNames(error)) {
          if (!(key in snapshot)) {
            const value = record[key];
            if (typeof value !== 'function') {
              snapshot[key] = value;
            }
          }
        }
      } catch {
        // ignore non-enumerable / accessor errors
      }

      return JSON.stringify(snapshot, null, 2);
    }

    return JSON.stringify(error, null, 2);
  } catch {
    return String(error);
  }
}

export function logAuthErrorJson(error: unknown, context?: string): void {
  if (process.env.NODE_ENV !== 'development') return;

  try {
    const label = context ? `Auth Error JSON [${context}]` : 'Auth Error JSON';
    console.log(`${label}:\n`, serializeAuthError(error));
    console.log(context ? `Auth Raw Error [${context}]:` : 'Auth Raw Error:', error);
  } catch (logError) {
    console.warn('[auth-debug] failed to log auth error', logError);
  }
}

/** يطبع رابط التفعيل المتوقع (تطوير). */
export function logAuthRedirectDiagnostics(emailRedirectTo: string): void {
  if (process.env.NODE_ENV !== 'development') return;

  try {
    const siteUrlHint = process.env.NEXT_PUBLIC_SITE_URL ?? '(غير معرّف — يُستخدم origin المتصفح)';
    console.group('Auth redirect diagnostics');
    console.log('emailRedirectTo (يُرسل مع signUp):', emailRedirectTo);
    console.log('NEXT_PUBLIC_SITE_URL:', siteUrlHint);
    console.log(
      'تحقق من إعدادات Firebase Auth → Authorized domains و NEXT_PUBLIC_APP_URL:\n' +
        '  • التطوير: http://localhost:3000\n' +
        `  • يجب أن يتضمن مسار الاستدعاء: ${emailRedirectTo}\n` +
        '  • التسجيل عبر Resend API: /api/auth/sign-up'
    );
    console.groupEnd();
  } catch {
    console.log('[auth-debug] emailRedirectTo:', emailRedirectTo);
  }
}
