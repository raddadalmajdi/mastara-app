import { NextResponse } from 'next/server';
import { getUserFromBearerToken } from '@/lib/billing-auth-server';
import { findAuthUserByEmail } from '@/lib/check-email-registered';
import { verifyRegistration } from '@/lib/webauthn-server';
import type { RegistrationResponseJSON } from '@simplewebauthn/server';
import { webAuthnErrorResponse } from '@/lib/webauthn-api-errors';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  let body: { email?: string; response?: RegistrationResponseJSON };
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

  const bearerUser = await getUserFromBearerToken(request);
  let userId: string | null = bearerUser?.id ?? null;

  if (bearerUser && bearerUser.email?.toLowerCase() !== email) {
    return NextResponse.json({ ok: false, message: 'غير مصرّح.' }, { status: 403 });
  }

  if (!userId) {
    const user = await findAuthUserByEmail(email);
    if (!user) {
      return NextResponse.json({ ok: false, message: 'لا يوجد حساب بهذا البريد.' }, { status: 404 });
    }
    userId = user.id;
  }

  try {
    await verifyRegistration({ request, userId, email, response });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return webAuthnErrorResponse(error, 'فشل تسجيل Passkey.');
  }
}
