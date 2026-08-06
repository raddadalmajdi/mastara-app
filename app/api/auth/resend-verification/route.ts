import { NextResponse } from 'next/server';
import { resendSignupVerificationEmail } from '@/lib/auth-sign-up-server';
import { logResendEnvDiagnostics } from '@/lib/resend-diagnostics';
import { logServerException } from '@/lib/server-error-log';

// انظر تعليق المهلة في app/api/auth/sign-up/route.ts — نفس السبب هنا.
export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: Request) {
  let body: { email?: string; password?: string; emailRedirectTo?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { ok: false, code: 'invalid_json', message: 'طلب غير صالح.' },
      { status: 400 }
    );
  }

  const email = body.email?.trim().toLowerCase() ?? '';
  const password = body.password ?? '';
  const emailRedirectTo = body.emailRedirectTo?.trim() ?? '';

  if (!email || !password || !emailRedirectTo) {
    return NextResponse.json(
      {
        ok: false,
        code: 'validation',
        message: 'email و password و emailRedirectTo مطلوبة لإعادة الإرسال.',
      },
      { status: 400 }
    );
  }

  try {
    logResendEnvDiagnostics('api/auth/resend-verification');
    const result = await resendSignupVerificationEmail({
      email,
      password,
      emailRedirectTo,
    });

    if (!result.ok) {
      console.error('[api/auth/resend-verification] failed', {
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
    logServerException('api/auth/resend-verification', error, { email });
    const message =
      error instanceof Error ? error.message : 'خطأ داخلي أثناء إعادة الإرسال.';
    return NextResponse.json(
      { ok: false, code: 'internal_error', message },
      { status: 500 }
    );
  }
}
