import { NextResponse } from 'next/server';
import {
  getUserFromBearerToken,
  requireBillingOwner,
} from '@/lib/billing-auth-server';
import {
  getPlanById,
  logBillingEvent,
} from '@/lib/subscription-server';
import {
  createTapCharge,
  getBillingSiteUrl,
  isTapConfigured,
} from '@/lib/tap-payments';
import { APP_NAME } from '@/lib/brand';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  if (!isTapConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        code: 'tap_not_configured',
        message: 'بوابة Tap Payments غير مضبوطة (TAP_SECRET_KEY).',
      },
      { status: 501 }
    );
  }

  const user = await getUserFromBearerToken(request);
  if (!user?.email) {
    return NextResponse.json({ ok: false, message: 'يجب تسجيل الدخول.' }, { status: 401 });
  }

  let body: { organizationId?: string; planId?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, message: 'طلب غير صالح.' }, { status: 400 });
  }

  const organizationId = body.organizationId?.trim() ?? '';
  const planId = body.planId?.trim() ?? '';

  if (!organizationId || !planId) {
    return NextResponse.json(
      { ok: false, message: 'organizationId و planId مطلوبان.' },
      { status: 400 }
    );
  }

  try {
    await requireBillingOwner(user.id, organizationId);
  } catch (error) {
    const msg = error instanceof Error ? error.message : '';
    if (msg === 'FORBIDDEN_NOT_OWNER') {
      return NextResponse.json(
        { ok: false, message: 'فقط مالك المحل يمكنه ترقية الاشتراك.' },
        { status: 403 }
      );
    }
    return NextResponse.json({ ok: false, message: 'غير مصرّح.' }, { status: 403 });
  }

  const plan = await getPlanById(planId);
  if (!plan || plan.billing_interval === 'free' || plan.price_amount <= 0) {
    return NextResponse.json(
      { ok: false, message: 'الباقة المختارة غير قابلة للدفع.' },
      { status: 400 }
    );
  }

  const siteUrl = getBillingSiteUrl();
  const redirectUrl = `${siteUrl}/billing/return`;
  const webhookUrl = `${siteUrl}/api/billing/webhook/tap`;

  const emailLocal = user.email.split('@')[0] ?? 'merchant';

  try {
    const charge = await createTapCharge({
      amount: plan.price_amount,
      currency: plan.currency,
      description: `${APP_NAME} — ${plan.name_ar}`,
      customer: {
        first_name: emailLocal.slice(0, 32),
        email: user.email,
      },
      metadata: {
        organization_id: organizationId,
        plan_id: planId,
        user_id: user.id,
      },
      redirectUrl,
      webhookUrl,
    });

    await logBillingEvent({
      organizationId,
      planId,
      tapChargeId: charge.id,
      eventType: 'checkout_created',
      payload: { status: charge.status },
    });

    const checkoutUrl = charge.transaction?.url;
    if (!checkoutUrl) {
      return NextResponse.json(
        { ok: false, message: 'لم يُرجع Tap رابط الدفع.' },
        { status: 502 }
      );
    }

    return NextResponse.json({
      ok: true,
      chargeId: charge.id,
      checkoutUrl,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'فشل إنشاء جلسة الدفع.';
    console.error('[api/billing/checkout]', message);
    return NextResponse.json({ ok: false, message }, { status: 502 });
  }
}
