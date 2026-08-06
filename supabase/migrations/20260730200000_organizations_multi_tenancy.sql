-- Multi-tenancy: organizations + memberships + organization_id on tenant tables.
-- Run in Supabase SQL Editor after prior migrations.

-- ─── organizations ───
CREATE TABLE IF NOT EXISTS public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL,
  owner_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT organizations_slug_unique UNIQUE (slug)
);

CREATE INDEX IF NOT EXISTS organizations_owner_id_idx ON public.organizations (owner_id);
CREATE INDEX IF NOT EXISTS organizations_slug_idx ON public.organizations (slug);

COMMENT ON TABLE public.organizations IS 'Tailor shop / tenant; one primary org per owner at signup';

-- ─── organization_members ───
CREATE TABLE IF NOT EXISTS public.organization_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'owner' CHECK (role IN ('owner', 'member')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT organization_members_org_user_unique UNIQUE (organization_id, user_id),
  CONSTRAINT organization_members_user_unique UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS organization_members_user_id_idx ON public.organization_members (user_id);
CREATE INDEX IF NOT EXISTS organization_members_org_id_idx ON public.organization_members (organization_id);

COMMENT ON TABLE public.organization_members IS 'Links auth users to their active organization';

-- ─── organization_id on tenant tables ───
ALTER TABLE public.tailor_profiles
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations (id) ON DELETE SET NULL;

ALTER TABLE public.tailor_customers
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations (id) ON DELETE CASCADE;

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations (id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS tailor_profiles_organization_id_idx
  ON public.tailor_profiles (organization_id);

CREATE INDEX IF NOT EXISTS tailor_customers_organization_id_idx
  ON public.tailor_customers (organization_id);

CREATE INDEX IF NOT EXISTS invoices_organization_id_idx
  ON public.invoices (organization_id);

CREATE INDEX IF NOT EXISTS invoices_org_customer_phone_idx
  ON public.invoices (organization_id, customer_phone);

-- ─── helper: org ids for current user ───
CREATE OR REPLACE FUNCTION public.current_user_organization_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT organization_id
  FROM public.organization_members
  WHERE user_id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.current_user_organization_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_user_organization_ids() TO authenticated;

-- ─── RLS: organizations ───
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS organizations_select_member ON public.organizations;
DROP POLICY IF EXISTS organizations_insert_owner ON public.organizations;
DROP POLICY IF EXISTS organizations_update_owner ON public.organizations;

CREATE POLICY organizations_select_member ON public.organizations
  FOR SELECT TO authenticated
  USING (
    id IN (SELECT public.current_user_organization_ids())
    OR owner_id = auth.uid()
  );

CREATE POLICY organizations_insert_owner ON public.organizations
  FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY organizations_update_owner ON public.organizations
  FOR UPDATE TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

-- ─── RLS: organization_members ───
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS organization_members_select_own ON public.organization_members;
DROP POLICY IF EXISTS organization_members_insert_self ON public.organization_members;

CREATE POLICY organization_members_select_own ON public.organization_members
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY organization_members_insert_self ON public.organization_members
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- ─── RLS: invoices (org-scoped + legacy user_id fallback) ───
DROP POLICY IF EXISTS invoices_select_own ON public.invoices;
DROP POLICY IF EXISTS invoices_insert_own ON public.invoices;
DROP POLICY IF EXISTS invoices_update_own ON public.invoices;
DROP POLICY IF EXISTS invoices_delete_own ON public.invoices;

CREATE POLICY invoices_select_own ON public.invoices
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR organization_id IN (SELECT public.current_user_organization_ids())
  );

CREATE POLICY invoices_insert_own ON public.invoices
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND (
      organization_id IS NULL
      OR organization_id IN (SELECT public.current_user_organization_ids())
    )
  );

CREATE POLICY invoices_update_own ON public.invoices
  FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    OR organization_id IN (SELECT public.current_user_organization_ids())
  )
  WITH CHECK (
    user_id = auth.uid()
    AND (
      organization_id IS NULL
      OR organization_id IN (SELECT public.current_user_organization_ids())
    )
  );

CREATE POLICY invoices_delete_own ON public.invoices
  FOR DELETE TO authenticated
  USING (
    user_id = auth.uid()
    OR organization_id IN (SELECT public.current_user_organization_ids())
  );

-- ─── RLS: tailor_customers (org-scoped + legacy) ───
DROP POLICY IF EXISTS tailor_customers_select_own ON public.tailor_customers;
DROP POLICY IF EXISTS tailor_customers_insert_own ON public.tailor_customers;
DROP POLICY IF EXISTS tailor_customers_update_own ON public.tailor_customers;

CREATE POLICY tailor_customers_select_own ON public.tailor_customers
  FOR SELECT TO authenticated
  USING (
    auth.uid() = tailor_user_id
    OR organization_id IN (SELECT public.current_user_organization_ids())
  );

CREATE POLICY tailor_customers_insert_own ON public.tailor_customers
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = tailor_user_id
    AND (
      organization_id IS NULL
      OR organization_id IN (SELECT public.current_user_organization_ids())
    )
  );

CREATE POLICY tailor_customers_update_own ON public.tailor_customers
  FOR UPDATE TO authenticated
  USING (
    auth.uid() = tailor_user_id
    OR organization_id IN (SELECT public.current_user_organization_ids())
  )
  WITH CHECK (
    auth.uid() = tailor_user_id
    AND (
      organization_id IS NULL
      OR organization_id IN (SELECT public.current_user_organization_ids())
    )
  );

-- tailor_profiles: allow org-scoped select/update where applicable
DROP POLICY IF EXISTS tailor_profiles_select_own ON public.tailor_profiles;
DROP POLICY IF EXISTS tailor_profiles_insert_own ON public.tailor_profiles;
DROP POLICY IF EXISTS tailor_profiles_update_own ON public.tailor_profiles;

CREATE POLICY tailor_profiles_select_own ON public.tailor_profiles
  FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    OR organization_id IN (SELECT public.current_user_organization_ids())
  );

CREATE POLICY tailor_profiles_insert_own ON public.tailor_profiles
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND (
      organization_id IS NULL
      OR organization_id IN (SELECT public.current_user_organization_ids())
    )
  );

CREATE POLICY tailor_profiles_update_own ON public.tailor_profiles
  FOR UPDATE TO authenticated
  USING (
    auth.uid() = user_id
    OR organization_id IN (SELECT public.current_user_organization_ids())
  )
  WITH CHECK (
    auth.uid() = user_id
    AND (
      organization_id IS NULL
      OR organization_id IN (SELECT public.current_user_organization_ids())
    )
  );

NOTIFY pgrst, 'reload schema';
