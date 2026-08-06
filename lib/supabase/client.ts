/**
 * عميل Supabase للمتصفح — استخدم getSupabaseBrowserClient() من lib/supabase-browser.
 */
export {
  getSupabaseBrowserClient,
  getAuthCallbackUrl,
  isSupabaseConfigured,
  getSupabaseConfigDiagnostic,
  assertValidEmailRedirectTo,
} from '@/lib/supabase-browser';

export {
  getSupabasePublicConfig,
  logSupabasePublicConfigDiagnostics,
  diagnoseSupabasePublicConfig,
  getAppPublicUrl,
  formatSupabaseConfigIssues,
} from '@/lib/supabase/env';
