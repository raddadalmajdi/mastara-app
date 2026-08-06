import { NextResponse } from 'next/server';
import {
  confirmSubscriptionFromTapCharge,
  logBillingEvent,
} from '@/lib/subscription-server';
import {
  isTapConfigured,
  retrieveTapCharge,
  verifyTapWebhookHash,
  type TapChargeResponse,
} from '@/lib/tap-payments';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  if (!isTapConfigured()) {
    return NextResponse.json({ ok: false }, { status: 501 });
  }

  let charge: TapChargeResponse;
  try {
    charge = (await request.json()) as TapChargeResponse;
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const hashstring = request.headers.get('hashstring');

  const hashValid = verifyTapWebhookHash({ charge, hashstringHeader: hashstring });
  if (!hashValid) {
    console.error('[api/billing/webhook/tap] invalid hashstring', { chargeId: charge.id });
    return NextResponse.json({ ok: false, message: 'invalid hash' }, { status: 401 });
  }

  try {
    const verified = await retrieveTapCharge(charge.id);
    const result = await confirmSubscriptionFromTapCharge({
      id: verified.id,
      status: verified.status,
      metadata: verified.metadata as Record<string, string> | undefined,
      customer: verified.customer,
    });

    await logBillingEvent({
      organizationId: result.organizationId,
      planId: result.planId,
      tapChargeId: verified.id,
      eventType: 'webhook_received',
      payload: { status: verified.status, ok: result.ok },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'webhook error';
    console.error('[api/billing/webhook/tap]', message);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
