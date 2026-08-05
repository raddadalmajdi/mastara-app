import { NextResponse } from 'next/server';
import { sendLoginOtpViaResend } from '@/lib/auth-login-otp-server';
import { logResendEnvDiagnostics } from '@/lib/resend-diagnostics';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: Request) {
  let body: { email?: string; emailRedirectTo?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { ok: false, code: 'invalid_json', message: 'طلب غير صالح.' },
      { status: 400 }
    );
  }

  const email = body.email?.trim().toLowerCase() ?? '';
  const emailRedirectTo = body.emailRedirectTo?.trim() ?? '';

  if (!email || !emailRedirectTo) {
    return NextResponse.json(
      {
        ok: false,
        code: 'validation',
        message: 'email و emailRedirectTo مطلوبان.',
      },
      { status: 400 }
    );
  }

  try {
    logResendEnvDiagnostics('api/auth/send-login-otp');
    const started = Date.now();
    const result = await sendLoginOtpViaResend({ email, emailRedirectTo });
    console.info('[api/auth/send-login-otp]', {
      ok: result.ok,
      code: result.ok ? undefined : result.code,
      ms: Date.now() - started,
    });

    if (!result.ok) {
      console.error('[api/auth/send-login-otp] failed', {
        code: result.code,
        message: result.message,
        email,
      });
      return NextResponse.json(
        { ok: false, code: result.code, message: result.message },
        { status: result.status }
      );
    }

    return NextResponse.json({
      ok: true,
      emailSentViaResend: true,
      user: { id: result.userId, email: result.email },
    }, {
      headers: {
        'Set-Cookie': result.otpBridgeCookie,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'خطأ داخلي أثناء إرسال رمز الدخول.';
    console.error('[api/auth/send-login-otp]', message);
    return NextResponse.json(
      { ok: false, code: 'internal_error', message },
      { status: 500 }
    );
  }
}
