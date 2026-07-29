-- tailor_profiles: أعمدة زمنية + إزالة trigger updated_at (يتعارض أحياناً مع Schema Cache / PGRST204).
ALTER TABLE public.tailor_profiles
  ADD COLUMN IF NOT EXISTS shop_name text;

ALTER TABLE public.tailor_profiles
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.tailor_profiles
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DROP TRIGGER IF EXISTS tailor_profiles_set_updated_at ON public.tailor_profiles;

NOTIFY pgrst, 'reload schema';
