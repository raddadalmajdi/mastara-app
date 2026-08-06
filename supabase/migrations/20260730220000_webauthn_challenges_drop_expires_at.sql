-- إزالة عمود انتهاء الصلاحية من webauthn_challenges — التطبيق يستهلك التحديات لمرة واحدة.
-- نفّذ في Supabase SQL Editor إن وُجد العمود في قاعدة البيانات.

DROP INDEX IF EXISTS public.webauthn_challenges_expires_idx;

ALTER TABLE public.webauthn_challenges
  DROP COLUMN IF EXISTS expires_at;

NOTIFY pgrst, 'reload schema';
