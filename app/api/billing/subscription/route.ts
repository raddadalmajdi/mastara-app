import { NextResponse } from 'next/server';
import { getUserFromBearerToken, assertUserOrganizationAccess } from '@/lib/billing-auth-server';
import { getOrganizationSubscriptionSummary } from '@/lib/subscription-server';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const user = await getUserFromBearerToken(request);
  if (!user) {
    return NextResponse.json({ ok: false, message: 'يجب تسجيل الدخول.' }, { status: 401 });
  }

  const url = new URL(request.url);
  const organizationId = url.searchParams.get('organizationId')?.trim() ?? '';
  if (!organizationId) {
    return NextResponse.json(
      { ok: false, message: 'organizationId مطلوب.' },
      { status: 400 }
    );
  }

  try {
    await assertUserOrganizationAccess(user.id, organizationId);
    const summary = await getOrganizationSubscriptionSummary(organizationId);
    if (!summary) {
      return NextResponse.json(
        { ok: false, message: 'لم يُعثر على اشتراك.' },
        { status: 404 }
      );
    }
    return NextResponse.json({ ok: true, summary });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'خطأ';
    if (message === 'FORBIDDEN_ORG') {
      return NextResponse.json({ ok: false, message: 'غير مصرّح.' }, { status: 403 });
    }
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
