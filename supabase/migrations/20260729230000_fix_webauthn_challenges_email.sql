-- إصلاح: عمود email في webauthn_challenges (جدول قديم بدون العمود) + تحديث Schema Cache.
ALTER TABLE public.webauthn_challenges
  ADD COLUMN IF NOT EXISTS email text;

COMMENT ON COLUMN public.webauthn_challenges.email IS 'Optional email hint for WebAuthn login/register challenge';

NOTIFY pgrst, 'reload schema';
