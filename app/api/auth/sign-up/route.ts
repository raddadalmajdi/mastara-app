import { NextResponse } from 'next/server';
import { registerUserWithResendVerification } from '@/lib/auth-sign-up-server';

// هذا المسار يستدعي Supabase Admin API ثم Resend API بالتسلسل، وقد يستغرق
// أكثر من المهلة الافتراضية لدوال Vercel الخادمة (10 ثوانٍ على خطة Hobby)،
// مما كان يتسبب في إنهاء Vercel للدالة قسراً وإرجاع 502 قبل أن يكمل الكود
// معالجة الاستجابة بنفسه. نرفع السقف صراحةً هنا (تُقيَّده Vercel تلقائياً
// حسب الخطة المفعّلة) بما يتوافق مع مهلات lib/auth-sign-up-server.ts.
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
        message: 'email و password و emailRedirectTo مطلوبة.',
      },
      { status: 400 }
    );
  }

  try {
    const started = Date.now();
    const result = await registerUserWithResendVerification({
      email,
      password,
      emailRedirectTo,
    });
    console.info('[api/auth/sign-up]', {
      ok: result.ok,
      code: result.ok ? undefined : result.code,
      ms: Date.now() - started,
    });

    if (!result.ok) {
      return NextResponse.json(
        { ok: false, code: result.code, message: result.message },
        { status: result.status }
      );
    }

    return NextResponse.json({
      ok: true,
      needsVerification: true,
      emailSentViaResend: true,
      user: { id: result.userId, email: result.email },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'خطأ داخلي أثناء التسجيل.';
    console.error('[api/auth/sign-up]', message);
    return NextResponse.json(
      { ok: false, code: 'internal_error', message },
      { status: 500 }
    );
  }
}
