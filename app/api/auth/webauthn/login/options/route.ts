import { NextResponse } from 'next/server';
import { buildAuthenticationOptions } from '@/lib/webauthn-server';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  let body: { email?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, message: 'طلب غير صالح.' }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase() ?? '';
  if (!email) {
    return NextResponse.json({ ok: false, message: 'البريد الإلكتروني مطلوب.' }, { status: 400 });
  }

  try {
    const { options } = await buildAuthenticationOptions({ request, email });
    return NextResponse.json({ ok: true, options });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'تعذّر بدء الدخول.';
    return NextResponse.json({ ok: false, message }, { status: 400 });
  }
}
