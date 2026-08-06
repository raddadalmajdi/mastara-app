export type SubscriptionStatus = 'active' | 'trialing' | 'past_due' | 'canceled';

export type BillingInterval = 'month' | 'year' | 'free';

export type SubscriptionPlan = {
  id: string;
  name_ar: string;
  description_ar: string | null;
  price_amount: number;
  currency: string;
  billing_interval: BillingInterval;
  trial_days: number;
  features: string[];
  is_active: boolean;
  sort_order: number;
};

export type OrganizationSubscription = {
  id: string;
  organization_id: string;
  plan_id: string;
  status: SubscriptionStatus;
  tap_charge_id: string | null;
  tap_customer_id: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  trial_end: string | null;
  canceled_at: string | null;
  created_at: string;
  updated_at: string;
};

export type SubscriptionSummary = {
  subscription: OrganizationSubscription;
  plan: SubscriptionPlan;
  isPaidActive: boolean;
  daysUntilTrialEnd: number | null;
};

export const SUBSCRIPTION_STATUS_LABELS: Record<SubscriptionStatus, string> = {
  active: 'نشط',
  trialing: 'تجربة مجانية',
  past_due: 'متأخر الدفع',
  canceled: 'ملغى',
};

export function parsePlanFeatures(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.filter((item): item is string => typeof item === 'string');
  }
  return [];
}

export function isSubscriptionUsable(status: SubscriptionStatus): boolean {
  return status === 'active' || status === 'trialing';
}

export function formatPlanPrice(plan: SubscriptionPlan): string {
  if (plan.billing_interval === 'free' || plan.price_amount <= 0) {
    return 'مجاني';
  }
  const amount = plan.price_amount.toLocaleString('ar-SA', {
    minimumFractionDigits: plan.currency === 'SAR' ? 0 : 2,
    maximumFractionDigits: 3,
  });
  const suffix =
    plan.billing_interval === 'year'
      ? '/سنة'
      : plan.billing_interval === 'month'
        ? '/شهر'
        : '';
  return `${amount} ${plan.currency}${suffix}`;
}
