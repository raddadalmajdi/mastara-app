-- tailor_profiles: أعمدة زمنية + shop_name (للجداول القديمة) + إعادة تحميل Schema Cache.
ALTER TABLE public.tailor_profiles
  ADD COLUMN IF NOT EXISTS shop_name text;

ALTER TABLE public.tailor_profiles
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.tailor_profiles
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

COMMENT ON COLUMN public.tailor_profiles.updated_at IS 'Profile last save timestamp';

NOTIFY pgrst, 'reload schema';
