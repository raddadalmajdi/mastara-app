export {
  getSupabaseBrowserClient,
  isSupabaseConfigured,
  getAuthCallbackUrl,
} from './supabase-browser';

import { getSupabaseBrowserClient, isSupabaseConfigured } from './supabase-browser';

/** Server-safe client; null when env vars are missing. */
export const supabase = isSupabaseConfigured() ? getSupabaseBrowserClient() : null;
