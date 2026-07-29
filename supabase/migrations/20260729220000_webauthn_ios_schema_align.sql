-- مواءمة أعمدة WebAuthn / tailor_profiles مع PostgREST (Schema Cache) — iOS Passkeys.
ALTER TABLE public.tailor_profiles
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.user_passkeys
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.webauthn_challenges
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

COMMENT ON COLUMN public.webauthn_challenges.email IS 'Optional email hint for login challenge (normalized lowercase)';
COMMENT ON COLUMN public.user_passkeys.updated_at IS 'Last credential metadata update';
COMMENT ON COLUMN public.tailor_profiles.updated_at IS 'Profile last save timestamp';

-- تحديث updated_at تلقائياً عند تعديل الصفوف (اختياري لكن يمنع drift).
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tailor_profiles_set_updated_at ON public.tailor_profiles;
CREATE TRIGGER tailor_profiles_set_updated_at
  BEFORE UPDATE ON public.tailor_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS user_passkeys_set_updated_at ON public.user_passkeys;
CREATE TRIGGER user_passkeys_set_updated_at
  BEFORE UPDATE ON public.user_passkeys
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS webauthn_challenges_set_updated_at ON public.webauthn_challenges;
CREATE TRIGGER webauthn_challenges_set_updated_at
  BEFORE UPDATE ON public.webauthn_challenges
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

NOTIFY pgrst, 'reload schema';
