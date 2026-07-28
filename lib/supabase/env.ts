export type SupabasePublicConfig = {
  url: string;
  anonKey: string;
};

function trimEnv(value: string | undefined): string | undefined {
  if (value == null) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * يتحقق من أن القيمة تبدو كـ JWT سليم (3 أجزاء Base64 مفصولة بنقاط).
 * يكتشف مبكراً حالات دمج/تشويه المفتاح مع نص آخر (مثل نسخ خاطئ لمتغيرات .env).
 */
export function looksLikeJwt(value: string): boolean {
  const parts = value.split('.');
  if (parts.length !== 3) return false;
  return parts.every((part) => part.length > 0 && /^[A-Za-z0-9_-]+$/.test(part));
}

/**
 * يستخرج origin المشروع فقط (بدون أي مسار مثل /rest/v1 أو /auth/v1).
 * supabase-js يُلحق مساراته الخاصة تلقائياً بالـ URL الأساسي —
 * أي مسار إضافي هنا يكسر جميع طلبات Auth/Admin API بخطأ غامض من الخادم
 * مثل "Invalid path specified in request URL".
 */
export function normalizeSupabaseProjectUrl(rawUrl: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return null;
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return null;
  }

  if (process.env.NODE_ENV === 'development' && parsed.pathname !== '/' && parsed.pathname !== '') {
    console.warn(
      '[Supabase] تحذير: NEXT_PUBLIC_SUPABASE_URL يحتوي مساراً إضافياً وتم تجاهله:',
      parsed.pathname,
      '— يجب أن يكون فقط https://<project-ref>.supabase.co بدون /rest/v1 أو /auth/v1.'
    );
  }

  // origin فقط: البروتوكول + الدومين + المنفذ — بدون أي pathname/query/hash.
  return parsed.origin;
}

/** يقرأ ويتحقق من NEXT_PUBLIC_SUPABASE_URL و NEXT_PUBLIC_SUPABASE_ANON_KEY. */
export function getSupabasePublicConfig(): SupabasePublicConfig | null {
  const rawUrl = trimEnv(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const rawKey = trimEnv(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

  if (!rawUrl || !rawKey) {
    return null;
  }

  const url = normalizeSupabaseProjectUrl(rawUrl);
  if (!url) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[Supabase] NEXT_PUBLIC_SUPABASE_URL غير صالح:', rawUrl);
    }
    return null;
  }

  if (!looksLikeJwt(rawKey)) {
    if (process.env.NODE_ENV === 'development') {
      console.error(
        '[Supabase] NEXT_PUBLIC_SUPABASE_ANON_KEY لا يبدو كـ JWT صالح (تحقق من عدم دمجه بنص آخر عن طريق الخطأ). الطول:',
        rawKey.length
      );
    }
    return null;
  }

  return { url, anonKey: rawKey };
}

export function logSupabasePublicConfigDiagnostics(config: SupabasePublicConfig | null): void {
  if (process.env.NODE_ENV !== 'development') return;

  if (!config) {
    console.error(
      '[Supabase] متغيرات البيئة ناقصة أو URL غير صالح. تحقق من .env.local:\n' +
        '  NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co\n' +
        '  NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>'
    );
    return;
  }

  console.log('[Supabase] client config OK:', {
    url: config.url,
    anonKeyPreview: `${config.anonKey.slice(0, 12)}… (${config.anonKey.length} chars)`,
  });
}
