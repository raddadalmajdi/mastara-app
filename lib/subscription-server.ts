import { getFirebaseAdminFirestore } from '@/lib/firebase-admin';
import { DEFAULT_SUBSCRIPTION_PLANS } from '@/lib/subscription-plans-seed';
import {
  isSubscriptionUsable,
  parsePlanFeatures,
  type OrganizationSubscription,
  type SubscriptionPlan,
  type SubscriptionStatus,
  type SubscriptionSummary,
} from '@/lib/subscription';

const STARTER_PLAN_ID = 'starter';
const TRIAL_DAYS = 14;

function mapPlanRow(row: Record<string, unknown>): SubscriptionPlan {
  return {
    id: String(row.id),
    name_ar: String(row.name_ar),
    description_ar: row.description_ar != null ? String(row.description_ar) : null,
    price_amount: Number(row.price_amount ?? 0),
    currency: String(row.currency ?? 'SAR'),
    billing_interval: (row.billing_interval as SubscriptionPlan['billing_interval']) ?? 'month',
    trial_days: Number(row.trial_days ?? 0),
    features: parsePlanFeatures(row.features),
    is_active: Boolean(row.is_active ?? true),
    sort_order: Number(row.sort_order ?? 0),
  };
}

function mapSubscriptionRow(id: string, row: Record<string, unknown>): OrganizationSubscription {
  return {
    id,
    organization_id: String(row.organization_id),
    plan_id: String(row.plan_id),
    status: row.status as SubscriptionStatus,
    tap_charge_id: row.tap_charge_id != null ? String(row.tap_charge_id) : null,
    tap_customer_id: row.tap_customer_id != null ? String(row.tap_customer_id) : null,
    current_period_start: row.current_period_start != null ? String(row.current_period_start) : null,
    current_period_end: row.current_period_end != null ? String(row.current_period_end) : null,
    trial_end: row.trial_end != null ? String(row.trial_end) : null,
    canceled_at: row.canceled_at != null ? String(row.canceled_at) : null,
    created_at: String(row.created_at ?? new Date().toISOString()),
    updated_at: String(row.updated_at ?? new Date().toISOString()),
  };
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function addMonths(date: Date, months: number): Date {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const end = new Date(iso).getTime();
  const diff = end - Date.now();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

async function seedPlansIfEmpty(): Promise<void> {
  const db = getFirebaseAdminFirestore();
  const snap = await db.collection('subscription_plans').limit(1).get();
  if (!snap.empty) return;

  const batch = db.batch();
  for (const plan of DEFAULT_SUBSCRIPTION_PLANS) {
    const ref = db.collection('subscription_plans').doc(plan.id);
    batch.set(ref, { ...plan, is_active: true });
  }
  await batch.commit();
}

export async function listActivePlans(): Promise<SubscriptionPlan[]> {
  await seedPlansIfEmpty().catch(() => undefined);

  const db = getFirebaseAdminFirestore();
  const snap = await db
    .collection('subscription_plans')
    .where('is_active', '==', true)
    .get();

  if (snap.empty) {
    return DEFAULT_SUBSCRIPTION_PLANS.filter((p) => p.is_active);
  }

  const plans = snap.docs
    .map((docSnap) => mapPlanRow({ id: docSnap.id, ...docSnap.data() }))
    .sort((a, b) => a.sort_order - b.sort_order);

  return plans.length > 0 ? plans : DEFAULT_SUBSCRIPTION_PLANS.filter((p) => p.is_active);
}

export async function getPlanById(planId: string): Promise<SubscriptionPlan | null> {
  const fromDefaults = DEFAULT_SUBSCRIPTION_PLANS.find((p) => p.id === planId);
  const db = getFirebaseAdminFirestore();
  const snap = await db.collection('subscription_plans').doc(planId).get();
  if (!snap.exists) return fromDefaults ?? null;
  return mapPlanRow({ id: snap.id, ...snap.data() });
}

/** Creates starter/trial subscription when a new organization is provisioned. */
export async function ensureStarterSubscription(organizationId: string): Promise<void> {
  const db = getFirebaseAdminFirestore();
  const existing = await db
    .collection('organization_subscriptions')
    .where('organization_id', '==', organizationId)
    .limit(1)
    .get();

  if (!existing.empty) return;

  const now = new Date();
  const trialEnd = addDays(now, TRIAL_DAYS);

  await db.collection('organization_subscriptions').add({
    organization_id: organizationId,
    plan_id: STARTER_PLAN_ID,
    status: 'trialing',
    current_period_start: now.toISOString(),
    current_period_end: trialEnd.toISOString(),
    trial_end: trialEnd.toISOString(),
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
  });
}

export async function getOrganizationSubscriptionSummary(
  organizationId: string
): Promise<SubscriptionSummary | null> {
  const db = getFirebaseAdminFirestore();
  const snap = await db
    .collection('organization_subscriptions')
    .where('organization_id', '==', organizationId)
    .limit(1)
    .get();

  if (snap.empty) {
    await ensureStarterSubscription(organizationId);
    return getOrganizationSubscriptionSummary(organizationId);
  }

  const docSnap = snap.docs[0]!;
  const subscription = mapSubscriptionRow(docSnap.id, docSnap.data() as Record<string, unknown>);
  const plan = await getPlanById(subscription.plan_id);
  if (!plan) return null;

  return {
    subscription,
    plan,
    isPaidActive: isSubscriptionUsable(subscription.status) && plan.id !== STARTER_PLAN_ID,
    daysUntilTrialEnd: subscription.status === 'trialing' ? daysUntil(subscription.trial_end) : null,
  };
}

export async function logBillingEvent(params: {
  organizationId?: string;
  planId?: string;
  tapChargeId?: string;
  eventType: string;
  payload?: unknown;
}): Promise<void> {
  const db = getFirebaseAdminFirestore();
  await db.collection('billing_events').add({
    organization_id: params.organizationId ?? null,
    plan_id: params.planId ?? null,
    tap_charge_id: params.tapChargeId ?? null,
    event_type: params.eventType,
    payload: params.payload ?? null,
    created_at: new Date().toISOString(),
  });
}

export async function activatePaidSubscription(params: {
  organizationId: string;
  planId: string;
  tapChargeId: string;
  tapCustomerId?: string;
}): Promise<void> {
  const plan = await getPlanById(params.planId);
  if (!plan || plan.billing_interval === 'free') {
    throw new Error('INVALID_PAID_PLAN');
  }

  const now = new Date();
  const periodEnd = plan.billing_interval === 'year' ? addMonths(now, 12) : addMonths(now, 1);

  const db = getFirebaseAdminFirestore();
  const existing = await db
    .collection('organization_subscriptions')
    .where('organization_id', '==', params.organizationId)
    .limit(1)
    .get();

  const payload = {
    organization_id: params.organizationId,
    plan_id: params.planId,
    status: 'active',
    tap_charge_id: params.tapChargeId,
    tap_customer_id: params.tapCustomerId ?? null,
    current_period_start: now.toISOString(),
    current_period_end: periodEnd.toISOString(),
    trial_end: null,
    canceled_at: null,
    updated_at: now.toISOString(),
  };

  if (existing.empty) {
    await db.collection('organization_subscriptions').add({
      ...payload,
      created_at: now.toISOString(),
    });
  } else {
    await existing.docs[0]!.ref.set(payload, { merge: true });
  }

  await logBillingEvent({
    organizationId: params.organizationId,
    planId: params.planId,
    tapChargeId: params.tapChargeId,
    eventType: 'subscription_activated',
  });
}

export async function markSubscriptionPastDue(organizationId: string, tapChargeId: string): Promise<void> {
  const db = getFirebaseAdminFirestore();
  const snap = await db
    .collection('organization_subscriptions')
    .where('organization_id', '==', organizationId)
    .limit(1)
    .get();

  if (!snap.empty) {
    await snap.docs[0]!.ref.set(
      { status: 'past_due', tap_charge_id: tapChargeId, updated_at: new Date().toISOString() },
      { merge: true }
    );
  }

  await logBillingEvent({
    organizationId,
    tapChargeId,
    eventType: 'subscription_past_due',
  });
}

export async function confirmSubscriptionFromTapCharge(charge: {
  id: string;
  status: string;
  metadata?: Record<string, string>;
  customer?: { id?: string };
}): Promise<{ ok: boolean; organizationId?: string; planId?: string }> {
  const organizationId = charge.metadata?.organization_id;
  const planId = charge.metadata?.plan_id;

  if (!organizationId || !planId) {
    return { ok: false };
  }

  if (charge.status === 'CAPTURED') {
    await activatePaidSubscription({
      organizationId,
      planId,
      tapChargeId: charge.id,
      tapCustomerId: charge.customer?.id,
    });
    return { ok: true, organizationId, planId };
  }

  if (['FAILED', 'DECLINED', 'CANCELLED'].includes(charge.status)) {
    const db = getFirebaseAdminFirestore();
    const snap = await db
      .collection('organization_subscriptions')
      .where('organization_id', '==', organizationId)
      .limit(1)
      .get();

    const existingSub = snap.empty ? null : (snap.docs[0]!.data() as { status?: string; plan_id?: string });
    const wasActivePaid =
      existingSub?.status === 'active' && existingSub.plan_id !== STARTER_PLAN_ID;

    if (wasActivePaid) {
      await markSubscriptionPastDue(organizationId, charge.id);
    }

    await logBillingEvent({
      organizationId,
      planId,
      tapChargeId: charge.id,
      eventType: 'checkout_failed',
      payload: { status: charge.status, markedPastDue: wasActivePaid },
    });
    return { ok: false, organizationId, planId };
  }

  return { ok: false, organizationId, planId };
}
