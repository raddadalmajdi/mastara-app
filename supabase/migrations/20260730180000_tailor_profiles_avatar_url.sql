-- صورة حساب/شعار الخياط — تُعرض في أيقونة الهيدر.
ALTER TABLE public.tailor_profiles
  ADD COLUMN IF NOT EXISTS avatar_url text;

COMMENT ON COLUMN public.tailor_profiles.avatar_url IS 'Public URL for tailor profile avatar or shop logo';

NOTIFY pgrst, 'reload schema';
