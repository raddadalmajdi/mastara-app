import { NextResponse } from 'next/server';
import { deleteAuthUserByEmail } from '@/lib/delete-auth-user-admin';

const DEFAULT_DEV_EMAIL = 'rraddad@hotmail.com';

export async function POST(request: Request) {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json(
      { ok: false, message: 'مسار التطوير غير متاح في بيئة الإنتاج.' },
      { status: 403 }
    );
  }

  let email = DEFAULT_DEV_EMAIL;
  try {
    const body = (await request.json()) as { email?: string };
    if (body.email?.trim()) {
      email = body.email.trim();
    }
  } catch {
    // empty body → default email
  }

  try {
    const result = await deleteAuthUserByEmail(email);
    console.info('[dev/delete-auth-user]', result);
    return NextResponse.json(result, { status: result.ok ? 200 : 404 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'فشل حذف المستخدم عبر Admin API.';
    console.error('[dev/delete-auth-user]', message);
    return NextResponse.json({ ok: false, email, message }, { status: 500 });
  }
}
