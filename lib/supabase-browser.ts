import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  diagnoseSupabasePublicConfig,
  formatSupabaseConfigIssues,
  getAppPublicUrl,
  getSupabasePublicConfig,
  logSupabasePublicConfigDiagnostics,
} from '@/lib/supabase/env';

let browserClient: SupabaseClient | null = null;

export function isSupabaseConfigured(): boolean {
  return diagnoseSupabasePublicConfig().ok;
}

export function getSupabaseConfigDiagnostic() {
  return diagnoseSupabasePublicConfig();
}

export { formatSupabaseConfigIssues, getAppPublicUrl };

/** يتحقق من صيغة رابط التفعيل (مطلوب لـ emailRedirectTo). */
export function assertValidEmailRedirectTo(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`emailRedirectTo غير صالح: ${raw}`);
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`emailRedirectTo يجب أن يبدأ بـ http/https: ${raw}`);
  }

  if (!url.pathname.endsWith('/auth/callback')) {
    if (process.env.NODE_ENV === 'development') {
      console.warn(
        '[Supabase] emailRedirectTo pathname:',
        url.pathname,
        '— المتوقع ينتهي بـ /auth/callback'
      );
    }
  }

  return url.toString();
}

/** Redirect URL for email links (dev + production via NEXT_PUBLIC_SITE_URL / APP_URL). */
export function getAuthCallbackUrl(): string {
  if (typeof window !== 'undefined') {
    return assertValidEmailRedirectTo(`${window.location.origin}/auth/callback`);
  }
  const site = getAppPublicUrl();
  return assertValidEmailRedirectTo(`${site}/auth/callback`);
}

export function getSupabaseBrowserClient(): SupabaseClient | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const config = getSupabasePublicConfig();
  logSupabasePublicConfigDiagnostics(config);

  if (!config) {
    return null;
  }

  if (!browserClient) {
    browserClient = createClient(config.url, config.anonKey, {
      auth: {
        flowType: 'pkce',
        detectSessionInUrl: true,
        persistSession: true,
        autoRefreshToken: true,
      },
      global: {
        headers: {
          'X-Client-Info': 'mastara-app',
        },
      },
    });
  }

  return browserClient;
}

/** إعادة تهيئة العميل بعد تغيير env (تطوير). */
export function resetSupabaseBrowserClientForDev(): void {
  browserClient = null;
}
