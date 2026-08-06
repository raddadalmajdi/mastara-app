import { NextResponse } from 'next/server';
import { getUserFromBearerToken } from '@/lib/billing-auth-server';
import {
  buildRegistrationOptions,
  verifyRegistration,
} from '@/lib/webauthn-server';
import { verifyUserPasswordCredentials } from '@/lib/webauthn-session-server';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  let body: { email?: string; password?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, message: 'طلب غير صالح.' }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase() ?? '';
  const password = body.password ?? '';

  let userId: string | null = null;
  let resolvedEmail = email;

  const bearerUser = await getUserFromBearerToken(request);
  if (bearerUser?.email) {
    userId = bearerUser.id;
    resolvedEmail = bearerUser.email.toLowerCase();
    if (email && email !== resolvedEmail) {
      return NextResponse.json({ ok: false, message: 'غير مصرّح.' }, { status: 403 });
    }
  } else {
    if (!email || !password) {
      return NextResponse.json(
        { ok: false, message: 'البريد وكلمة المرور مطلوبان لتسجيل Passkey.' },
        { status: 400 }
      );
    }
    const verified = await verifyUserPasswordCredentials(email, password);
    if (!verified) {
      return NextResponse.json(
        { ok: false, message: 'بيانات الدخول غير صحيحة.' },
        { status: 401 }
      );
    }
    userId = verified.userId;
    resolvedEmail = verified.email;
  }

  try {
    const { options } = await buildRegistrationOptions({
      request,
      userId,
      email: resolvedEmail,
    });
    return NextResponse.json({ ok: true, options });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'خطأ داخلي.';
    console.error('[webauthn/register/options]', message);
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
