import { NextResponse } from 'next/server';
import { resendSignupVerificationEmail } from '@/lib/auth-sign-up-server';

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
    const result = await resendSignupVerificationEmail({
      email,
      password,
      emailRedirectTo,
    });

    if (!result.ok) {
      return NextResponse.json(
        { ok: false, code: result.code, message: result.message },
        { status: result.status }
      );
    }

    return NextResponse.json({
      ok: true,
      emailSentViaResend: true,
      user: { id: result.userId, email: result.email },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'خطأ داخلي أثناء إعادة الإرسال.';
    console.error('[api/auth/resend-verification]', message);
    return NextResponse.json(
      { ok: false, code: 'internal_error', message },
      { status: 500 }
    );
  }
}
