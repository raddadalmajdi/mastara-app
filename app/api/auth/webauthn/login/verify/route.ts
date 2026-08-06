import { NextResponse } from 'next/server';
import type { AuthenticationResponseJSON } from '@simplewebauthn/server';
import { verifyAuthentication } from '@/lib/webauthn-server';
import { createSupabaseSessionForUserId } from '@/lib/webauthn-session-server';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  let body: { email?: string; response?: AuthenticationResponseJSON };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, message: 'طلب غير صالح.' }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase() ?? '';
  const response = body.response;

  if (!email || !response) {
    return NextResponse.json(
      { ok: false, message: 'email و response مطلوبان.' },
      { status: 400 }
    );
  }

  try {
    const { userId } = await verifyAuthentication({ request, email, response });
    const sessionBundle = await createSupabaseSessionForUserId(userId);

    return NextResponse.json({
      ok: true,
      session: {
        access_token: sessionBundle.access_token,
        refresh_token: sessionBundle.refresh_token,
      },
      user: { id: sessionBundle.userId },
      organizationId: sessionBundle.organizationId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'فشل الدخول بـ Passkey.';
    console.error('[webauthn/login/verify]', message);
    return NextResponse.json({ ok: false, message }, { status: 400 });
  }
}
