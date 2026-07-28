/**
 * تسجيل تشخيصي مؤقت لأخطاء Supabase Auth (تطوير فقط).
 */

export function serializeSupabaseAuthError(error: unknown): string {
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

export function logSupabaseAuthErrorJson(error: unknown, context?: string): void {
  if (process.env.NODE_ENV !== 'development') return;

  try {
    const label = context ? `Supabase Auth Error JSON [${context}]` : 'Supabase Auth Error JSON';
    console.log(`${label}:\n`, serializeSupabaseAuthError(error));
    console.log(context ? `Supabase Raw Error [${context}]:` : 'Supabase Raw Error:', error);
  } catch (logError) {
    console.warn('[auth-debug] failed to log auth error', logError);
  }
}

/** يطبع رابط التفعيل المتوقع ومطابقة Supabase Redirect URLs (تطوير). */
export function logAuthRedirectDiagnostics(emailRedirectTo: string): void {
  if (process.env.NODE_ENV !== 'development') return;

  try {
    const siteUrlHint = process.env.NEXT_PUBLIC_SITE_URL ?? '(غير معرّف — يُستخدم origin المتصفح)';
    console.group('Supabase Auth Redirect diagnostics');
    console.log('emailRedirectTo (يُرسل مع signUp):', emailRedirectTo);
    console.log('NEXT_PUBLIC_SITE_URL:', siteUrlHint);
    console.log(
      'تحقق في Supabase Dashboard → Authentication → URL Configuration:\n' +
        '  • Site URL: غالباً http://localhost:3000 للتطوير\n' +
        '  • Redirect URLs: يجب أن تتضمن بالضبط:\n' +
        `      ${emailRedirectTo}\n` +
        '  • التسجيل عبر Resend API: /api/auth/sign-up (لا يعتمد على SMTP Supabase)\n' +
        '  • خطأ 400 غالباً = بريد/كلمة مرور/redirect غير مسموح أو حساب موجود'
    );
    console.groupEnd();
  } catch {
    console.log('[auth-debug] emailRedirectTo:', emailRedirectTo);
  }
}
