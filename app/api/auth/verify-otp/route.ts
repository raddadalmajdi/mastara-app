import { NextResponse } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { verifyEmailOtpOnServer } from '@/lib/auth-verify-otp-server';
import { createClearOtpBridgeCookieHeader } from '@/lib/otp-delivery-bridge';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  let body: { email?: string; token?: string; preferredType?: EmailOtpType };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { ok: false, code: 'invalid_json', message: 'طلب غير صالح.' },
      { status: 400 }
    );
  }

  const email = body.email?.trim() ?? '';
  const token = body.token?.trim() ?? '';
  const preferredType = body.preferredType ?? 'email';

  if (!email || !token) {
    return NextResponse.json(
      { ok: false, code: 'validation', message: 'email و token مطلوبان.' },
      { status: 400 }
    );
  }

  try {
    const result = await verifyEmailOtpOnServer({
      email,
      token,
      preferredType,
      cookieHeader: request.headers.get('cookie'),
    });

    if (!result.ok) {
      return NextResponse.json(
        {
          ok: false,
          code: result.code,
          message: result.message,
          error: result.error,
        },
        { status: result.status }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        session: result.session,
        user: { id: result.userId },
      },
      {
        headers: {
          'Set-Cookie': createClearOtpBridgeCookieHeader(),
        },
      }
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'خطأ داخلي أثناء التحقق من الرمز.';
    console.error('[api/auth/verify-otp]', message);
    return NextResponse.json(
      { ok: false, code: 'internal_error', message },
      { status: 500 }
    );
  }
}
