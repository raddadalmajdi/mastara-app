import { NextResponse } from 'next/server';
import { APP_NAME } from '@/lib/brand';

export const runtime = 'nodejs';

/**
 * نقطة List-Unsubscribe (RFC 8058) — رسائل OTP معاملاتية وليست تسويقية.
 * POST: one-click من Gmail/Yahoo → 202 Accepted.
 * GET: صفحة توضيحية بسيطة.
 */
export async function POST() {
  return new NextResponse(null, { status: 202 });
}

export async function GET() {
  const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head><meta charset="utf-8"/><title>${APP_NAME}</title></head>
<body style="font-family:system-ui,sans-serif;max-width:32rem;margin:2rem auto;padding:0 1rem;line-height:1.7;color:#334155;">
  <h1 style="font-size:1.15rem;color:#0f172a;">رسائل رمز التحقق</h1>
  <p>هذه الرسائل <strong>معاملاتية</strong> (تفعيل حساب أو تسجيل دخول) وليست نشرة بريدية.</p>
  <p>لإيقاف رسائل OTP، احذف حسابك أو تواصل مع الدعم — لا يمكن إلغاء الاشتراك من رسائل الأمان دون ذلك.</p>
</body>
</html>`;

  return new NextResponse(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}
