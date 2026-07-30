-- webauthn_challenges: مواءمة الأعمدة + إزالة trigger updated_at + إعادة تحميل Schema Cache.
ALTER TABLE public.webauthn_challenges
  ADD COLUMN IF NOT EXISTS email text;

ALTER TABLE public.webauthn_challenges
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.webauthn_challenges
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

COMMENT ON COLUMN public.webauthn_challenges.email IS 'Optional email hint (app uses user_id only; column kept for legacy rows)';

DROP TRIGGER IF EXISTS webauthn_challenges_set_updated_at ON public.webauthn_challenges;

NOTIFY pgrst, 'reload schema';
