export type SupabasePublicConfig = {
  url: string;
  anonKey: string;
};

export type SupabaseConfigIssue =
  | 'missing_supabase_url'
  | 'missing_supabase_anon_key'
  | 'invalid_supabase_url'
  | 'invalid_supabase_anon_key';

export type SupabaseConfigDiagnostic = {
  ok: boolean;
  config: SupabasePublicConfig | null;
  issues: SupabaseConfigIssue[];
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

/** يُشخّص سبب فشل إعداد Supabase العام (بدون رمي أخطاء). */
export function diagnoseSupabasePublicConfig(): SupabaseConfigDiagnostic {
  const issues: SupabaseConfigIssue[] = [];
  const rawUrl = trimEnv(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const rawKey = trimEnv(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

  if (!rawUrl) issues.push('missing_supabase_url');
  if (!rawKey) issues.push('missing_supabase_anon_key');

  if (rawUrl && !normalizeSupabaseProjectUrl(rawUrl)) {
    issues.push('invalid_supabase_url');
  }
  if (rawKey && !looksLikeJwt(rawKey)) {
    issues.push('invalid_supabase_anon_key');
  }

  const config = getSupabasePublicConfig();
  return { ok: config !== null, config, issues };
}

const ISSUE_MESSAGES: Record<SupabaseConfigIssue, string> = {
  missing_supabase_url: 'NEXT_PUBLIC_SUPABASE_URL غير معرّف.',
  missing_supabase_anon_key: 'NEXT_PUBLIC_SUPABASE_ANON_KEY غير معرّف.',
  invalid_supabase_url: 'NEXT_PUBLIC_SUPABASE_URL غير صالح (يجب أن يكون origin المشروع فقط).',
  invalid_supabase_anon_key: 'NEXT_PUBLIC_SUPABASE_ANON_KEY لا يبدو كـ JWT صالح.',
};

export function formatSupabaseConfigIssues(issues: SupabaseConfigIssue[]): string {
  return issues.map((issue) => ISSUE_MESSAGES[issue]).join(' ');
}

/**
 * عنوان التطبيق العام — يُفضَّل NEXT_PUBLIC_APP_URL ثم NEXT_PUBLIC_SITE_URL ثم fallback.
 * يُستخدم لروابط Auth وTap redirect/webhook.
 */
export function getAppPublicUrl(fallback = 'https://www.malaktout.com'): string {
  const raw = trimEnv(process.env.NEXT_PUBLIC_APP_URL) ?? trimEnv(process.env.NEXT_PUBLIC_SITE_URL);
  if (!raw) return fallback.replace(/\/$/, '');

  try {
    const parsed = new URL(raw.includes('://') ? raw : `https://${raw}`);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return parsed.origin;
    }
  } catch {
    // fall through
  }

  if (process.env.NODE_ENV === 'development') {
    console.warn('[env] getAppPublicUrl: قيمة غير صالحة —', raw);
  }
  return fallback.replace(/\/$/, '');
}

let loggedSupabaseDiagnostic = false;

export function logSupabasePublicConfigDiagnostics(config: SupabasePublicConfig | null): void {
  if (loggedSupabaseDiagnostic) return;
  loggedSupabaseDiagnostic = true;

  if (!config) {
    const diagnostic = diagnoseSupabasePublicConfig();
    console.error(
      '[Supabase] إعداد العميل ناقص أو غير صالح:',
      formatSupabaseConfigIssues(diagnostic.issues),
      diagnostic.issues.length > 0
        ? '\nتحقق من .env.local / Vercel: NEXT_PUBLIC_SUPABASE_URL و NEXT_PUBLIC_SUPABASE_ANON_KEY'
        : ''
    );
    return;
  }

  if (process.env.NODE_ENV === 'development') {
    console.log('[Supabase] client config OK:', {
      url: config.url,
      anonKeyPreview: `${config.anonKey.slice(0, 12)}… (${config.anonKey.length} chars)`,
    });
  }
}
