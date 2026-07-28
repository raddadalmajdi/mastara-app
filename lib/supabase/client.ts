/**
 * عميل Supabase للمتصفح — استخدم getSupabaseBrowserClient() من lib/supabase-browser.
 */
export {
  getSupabaseBrowserClient,
  getAuthCallbackUrl,
  isSupabaseConfigured,
  assertValidEmailRedirectTo,
} from '@/lib/supabase-browser';

export { getSupabasePublicConfig, logSupabasePublicConfigDiagnostics } from '@/lib/supabase/env';
