import type { AuthResponse } from '@supabase/supabase-js';
import { resolveSignUpFlow, type SignUpFlowResult } from '@/lib/auth-handler';

export type { SignUpFlowResult };
export { resolveSignUpFlow, verifyEmailOtpFlexible } from '@/lib/auth-handler';

/** @deprecated استخدم resolveSignUpFlow(data, error) */
export function interpretSignUpData(data: AuthResponse['data']): SignUpFlowResult {
  return resolveSignUpFlow(data, null);
}
