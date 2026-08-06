-- Subscription & billing linked to organizations (Tap Payments).
-- Run in Supabase SQL Editor after organizations migration.

-- ─── subscription_plans (catalog) ───
CREATE TABLE IF NOT EXISTS public.subscription_plans (
  id text PRIMARY KEY,
  name_ar text NOT NULL,
  description_ar text,
  price_amount numeric(12, 3) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'SAR',
  billing_interval text NOT NULL DEFAULT 'month'
    CHECK (billing_interval IN ('month', 'year', 'free')),
  trial_days integer NOT NULL DEFAULT 0,
  features jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.subscription_plans IS 'Billable plan catalog for organizations';

-- ─── organization_subscriptions (one row per org) ───
CREATE TABLE IF NOT EXISTS public.organization_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL UNIQUE REFERENCES public.organizations (id) ON DELETE CASCADE,
  plan_id text NOT NULL REFERENCES public.subscription_plans (id),
  status text NOT NULL DEFAULT 'trialing'
    CHECK (status IN ('active', 'trialing', 'past_due', 'canceled')),
  tap_charge_id text,
  tap_customer_id text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  trial_end timestamptz,
  canceled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS organization_subscriptions_org_idx
  ON public.organization_subscriptions (organization_id);

CREATE INDEX IF NOT EXISTS organization_subscriptions_status_idx
  ON public.organization_subscriptions (status);

COMMENT ON TABLE public.organization_subscriptions IS 'Active subscription state per organization';

-- ─── billing_events (webhook / checkout audit log) ───
CREATE TABLE IF NOT EXISTS public.billing_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations (id) ON DELETE SET NULL,
  plan_id text,
  tap_charge_id text,
  event_type text NOT NULL,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS billing_events_org_idx ON public.billing_events (organization_id);
CREATE INDEX IF NOT EXISTS billing_events_charge_idx ON public.billing_events (tap_charge_id);

-- ─── seed plans ───
INSERT INTO public.subscription_plans (
  id, name_ar, description_ar, price_amount, currency, billing_interval, trial_days, features, sort_order
) VALUES
  (
    'starter',
    'الباقة المجانية',
    'ابدأ مجاناً مع فترة تجريبية — مناسبة للمحلات الصغيرة.',
    0,
    'SAR',
    'free',
    14,
    '["مسح الفواتير","دفتر العملاء","مشاركة واتساب"]'::jsonb,
    0
  ),
  (
    'pro_monthly',
    'إيصالك برو — شهري',
    'كل الميزات بدون حدود — فواتير غير محدودة ودعم أولوية.',
    49.000,
    'SAR',
    'month',
    0,
    '["فواتير غير محدودة","دفتر عملاء","مشاركة واتساب","دعم أولوية","مدى وApple Pay"]'::jsonb,
    1
  ),
  (
    'pro_yearly',
    'إيصالك برو — سنوي',
    'وفر شهرين — اشتراك سنوي بخصم.',
    490.000,
    'SAR',
    'year',
    0,
    '["فواتير غير محدودة","دفتر عملاء","مشاركة واتساب","دعم أولوية","مدى وApple Pay","خصم سنوي"]'::jsonb,
    2
  )
ON CONFLICT (id) DO UPDATE SET
  name_ar = EXCLUDED.name_ar,
  description_ar = EXCLUDED.description_ar,
  price_amount = EXCLUDED.price_amount,
  currency = EXCLUDED.currency,
  billing_interval = EXCLUDED.billing_interval,
  trial_days = EXCLUDED.trial_days,
  features = EXCLUDED.features,
  sort_order = EXCLUDED.sort_order;

-- ─── RLS ───
ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS subscription_plans_select_all ON public.subscription_plans;
CREATE POLICY subscription_plans_select_all ON public.subscription_plans
  FOR SELECT TO authenticated
  USING (is_active = true);

DROP POLICY IF EXISTS organization_subscriptions_select_member ON public.organization_subscriptions;
DROP POLICY IF EXISTS organization_subscriptions_update_service ON public.organization_subscriptions;

CREATE POLICY organization_subscriptions_select_member ON public.organization_subscriptions
  FOR SELECT TO authenticated
  USING (
    organization_id IN (SELECT public.current_user_organization_ids())
  );

-- Inserts/updates via service role (checkout + webhooks); members read only.

DROP POLICY IF EXISTS billing_events_select_member ON public.billing_events;
CREATE POLICY billing_events_select_member ON public.billing_events
  FOR SELECT TO authenticated
  USING (
    organization_id IN (SELECT public.current_user_organization_ids())
  );

NOTIFY pgrst, 'reload schema';
