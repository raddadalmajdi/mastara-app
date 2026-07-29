-- ملف الخياط: اسم المحل + الهاتف + ملاحظات (إن لم يكن الجدول موجوداً).
CREATE TABLE IF NOT EXISTS public.tailor_profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  phone text,
  cloud_notes text,
  shop_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.tailor_profiles
  ADD COLUMN IF NOT EXISTS shop_name text;

COMMENT ON COLUMN public.tailor_profiles.shop_name IS 'Commercial shop / business display name for the tailor';

-- عملاء كل خياط (رقم + اسم) — فهرس فريد لكل خياط ورقم.
CREATE TABLE IF NOT EXISTS public.tailor_customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tailor_user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  phone text NOT NULL,
  customer_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tailor_customers_tailor_phone_unique UNIQUE (tailor_user_id, phone)
);

CREATE INDEX IF NOT EXISTS tailor_customers_tailor_user_id_idx ON public.tailor_customers (tailor_user_id);
CREATE INDEX IF NOT EXISTS tailor_customers_phone_idx ON public.tailor_customers (phone);

ALTER TABLE public.tailor_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tailor_customers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tailor_profiles_select_own ON public.tailor_profiles;
DROP POLICY IF EXISTS tailor_profiles_insert_own ON public.tailor_profiles;
DROP POLICY IF EXISTS tailor_profiles_update_own ON public.tailor_profiles;

CREATE POLICY tailor_profiles_select_own ON public.tailor_profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY tailor_profiles_insert_own ON public.tailor_profiles
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY tailor_profiles_update_own ON public.tailor_profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS tailor_customers_select_own ON public.tailor_customers;
DROP POLICY IF EXISTS tailor_customers_insert_own ON public.tailor_customers;
DROP POLICY IF EXISTS tailor_customers_update_own ON public.tailor_customers;

CREATE POLICY tailor_customers_select_own ON public.tailor_customers
  FOR SELECT TO authenticated
  USING (auth.uid() = tailor_user_id);

CREATE POLICY tailor_customers_insert_own ON public.tailor_customers
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = tailor_user_id);

CREATE POLICY tailor_customers_update_own ON public.tailor_customers
  FOR UPDATE TO authenticated
  USING (auth.uid() = tailor_user_id)
  WITH CHECK (auth.uid() = tailor_user_id);
