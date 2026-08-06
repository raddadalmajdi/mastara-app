import { NextResponse } from 'next/server';
import { userHasPasskeys } from '@/lib/webauthn-server';

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
    return NextResponse.json({ ok: false, hasPasskeys: false }, { status: 400 });
  }

  try {
    const hasPasskeys = await userHasPasskeys(email);
    return NextResponse.json({ ok: true, hasPasskeys });
  } catch {
    return NextResponse.json({ ok: true, hasPasskeys: false });
  }
}
