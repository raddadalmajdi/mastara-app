import { NextResponse } from 'next/server';
import { sanitizeUserFacingMessage } from '@/lib/user-facing-error';

export function webAuthnErrorResponse(
  error: unknown,
  fallback: string,
  status = 400
): NextResponse {
  const raw = error instanceof Error ? error.message : fallback;
  console.error('[webauthn]', raw);
  return NextResponse.json(
    { ok: false, message: sanitizeUserFacingMessage(raw, fallback) },
    { status }
  );
}
