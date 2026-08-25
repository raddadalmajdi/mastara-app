import { NextResponse } from 'next/server';
import { findAuthUserByEmail } from '@/lib/check-email-registered-server';

export const runtime = 'nodejs';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  let body: { email?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { ok: false, code: 'invalid_json', message: 'طلب غير صالح.' },
      { status: 400 }
    );
  }

  const email = body.email?.trim().toLowerCase() ?? '';

  if (!email || !EMAIL_RE.test(email)) {
    return NextResponse.json(
      { ok: false, code: 'validation', message: 'صيغة البريد الإلكتروني غير صحيحة.' },
      { status: 400 }
    );
  }

  try {
    const user = await findAuthUserByEmail(email);
    return NextResponse.json({ ok: true, exists: Boolean(user) });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'تعذّر التحقق من البريد.';
    console.error('[api/auth/check-email]', message, error);
    return NextResponse.json(
      {
        ok: false,
        code: 'internal_error',
        message:
          process.env.NODE_ENV === 'development'
            ? message
            : 'تعذّر التحقق من البريد. حاول مجدداً.',
      },
      { status: 500 }
    );
  }
}
