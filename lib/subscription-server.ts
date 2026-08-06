import { createSupabaseAdminClient } from '@/lib/delete-auth-user-admin';
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

function mapSubscriptionRow(row: Record<string, unknown>): OrganizationSubscription {
  return {
    id: String(row.id),
    organization_id: String(row.organization_id),
    plan_id: String(row.plan_id),
    status: row.status as SubscriptionStatus,
    tap_charge_id: row.tap_charge_id != null ? String(row.tap_charge_id) : null,
    tap_customer_id: row.tap_customer_id != null ? String(row.tap_customer_id) : null,
    current_period_start: row.current_period_start != null ? String(row.current_period_start) : null,
    current_period_end: row.current_period_end != null ? String(row.current_period_end) : null,
    trial_end: row.trial_end != null ? String(row.trial_end) : null,
    canceled_at: row.canceled_at != null ? String(row.canceled_at) : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
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

export async function listActivePlans(): Promise<SubscriptionPlan[]> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from('subscription_plans')
    .select('*')
    .eq('is_active', true)
    .order('sort_order', { ascending: true });

  if (error) {
    if (error.message.includes('subscription_plans') || error.code === '42P01') {
      return [];
    }
    throw new Error(error.message);
  }

  return (data ?? []).map((row) => mapPlanRow(row as Record<string, unknown>));
}

export async function getPlanById(planId: string): Promise<SubscriptionPlan | null> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from('subscription_plans')
    .select('*')
    .eq('id', planId)
    .maybeSingle();

  if (error) return null;
  if (!data) return null;
  return mapPlanRow(data as Record<string, unknown>);
}

/** Creates starter/trial subscription when a new organization is provisioned. */
export async function ensureStarterSubscription(organizationId: string): Promise<void> {
  const admin = createSupabaseAdminClient();

  const existing = await admin
    .from('organization_subscriptions')
    .select('id')
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (existing.data?.id) return;

  const now = new Date();
  const trialEnd = addDays(now, TRIAL_DAYS);

  const { error } = await admin.from('organization_subscriptions').insert({
    organization_id: organizationId,
    plan_id: STARTER_PLAN_ID,
    status: 'trialing',
    current_period_start: now.toISOString(),
    current_period_end: trialEnd.toISOString(),
    trial_end: trialEnd.toISOString(),
  });

  if (error && !error.message.includes('duplicate')) {
    console.warn('[subscription-server] ensureStarterSubscription failed', error.message);
  }
}

export async function getOrganizationSubscriptionSummary(
  organizationId: string
): Promise<SubscriptionSummary | null> {
  const admin = createSupabaseAdminClient();

  const { data: subRow, error: subError } = await admin
    .from('organization_subscriptions')
    .select('*')
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (subError) {
    if (subError.message.includes('organization_subscriptions') || subError.code === '42P01') {
      return null;
    }
    throw new Error(subError.message);
  }

  if (!subRow) {
    await ensureStarterSubscription(organizationId);
    return getOrganizationSubscriptionSummary(organizationId);
  }

  const subscription = mapSubscriptionRow(subRow as Record<string, unknown>);
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
  const admin = createSupabaseAdminClient();
  await admin.from('billing_events').insert({
    organization_id: params.organizationId ?? null,
    plan_id: params.planId ?? null,
    tap_charge_id: params.tapChargeId ?? null,
    event_type: params.eventType,
    payload: params.payload ?? null,
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
  const periodEnd =
    plan.billing_interval === 'year' ? addMonths(now, 12) : addMonths(now, 1);

  const admin = createSupabaseAdminClient();
  const { error } = await admin.from('organization_subscriptions').upsert(
    {
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
    },
    { onConflict: 'organization_id' }
  );

  if (error) throw new Error(error.message);

  await logBillingEvent({
    organizationId: params.organizationId,
    planId: params.planId,
    tapChargeId: params.tapChargeId,
    eventType: 'subscription_activated',
  });
}

export async function markSubscriptionPastDue(organizationId: string, tapChargeId: string): Promise<void> {
  const admin = createSupabaseAdminClient();
  await admin
    .from('organization_subscriptions')
    .update({ status: 'past_due', tap_charge_id: tapChargeId, updated_at: new Date().toISOString() })
    .eq('organization_id', organizationId);

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
    const admin = createSupabaseAdminClient();
    const { data: existingSub } = await admin
      .from('organization_subscriptions')
      .select('status, plan_id')
      .eq('organization_id', organizationId)
      .maybeSingle();

    const wasActivePaid =
      existingSub?.status === 'active' &&
      existingSub.plan_id !== STARTER_PLAN_ID;

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
