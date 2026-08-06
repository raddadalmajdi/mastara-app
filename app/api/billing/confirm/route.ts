import { NextResponse } from 'next/server';
import { getUserFromBearerToken, assertUserOrganizationAccess } from '@/lib/billing-auth-server';
import {
  confirmSubscriptionFromTapCharge,
  logBillingEvent,
} from '@/lib/subscription-server';
import { isTapConfigured, retrieveTapCharge } from '@/lib/tap-payments';

export const runtime = 'nodejs';

/** يؤكّد حالة الدفع بعد العودة من Tap (احتياط إذا تأخر webhook). */
export async function POST(request: Request) {
  const user = await getUserFromBearerToken(request);
  if (!user) {
    return NextResponse.json({ ok: false, message: 'يجب تسجيل الدخول.' }, { status: 401 });
  }

  if (!isTapConfigured()) {
    return NextResponse.json({ ok: false, message: 'Tap غير مضبوط.' }, { status: 501 });
  }

  let body: { chargeId?: string; organizationId?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, message: 'طلب غير صالح.' }, { status: 400 });
  }

  const chargeId = body.chargeId?.trim() ?? '';
  const organizationId = body.organizationId?.trim() ?? '';
  if (!chargeId || !organizationId) {
    return NextResponse.json({ ok: false, message: 'chargeId و organizationId مطلوبان.' }, { status: 400 });
  }

  try {
    await assertUserOrganizationAccess(user.id, organizationId);
    const charge = await retrieveTapCharge(chargeId);

    if (charge.metadata?.organization_id !== organizationId) {
      return NextResponse.json({ ok: false, message: 'العملية لا تخص هذا المحل.' }, { status: 403 });
    }

    const result = await confirmSubscriptionFromTapCharge({
      id: charge.id,
      status: charge.status,
      metadata: charge.metadata as Record<string, string> | undefined,
      customer: charge.customer,
    });

    await logBillingEvent({
      organizationId,
      planId: result.planId,
      tapChargeId: charge.id,
      eventType: 'return_confirm',
      payload: { status: charge.status, ok: result.ok },
    });

    return NextResponse.json({
      ok: result.ok,
      status: charge.status,
      planId: result.planId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'تعذّر تأكيد الدفع.';
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
