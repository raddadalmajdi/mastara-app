-- Passkeys / WebAuthn + تحديات مؤقتة (تُدار عبر Service Role من API).
CREATE TABLE IF NOT EXISTS public.user_passkeys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  credential_id text NOT NULL UNIQUE,
  public_key text NOT NULL,
  counter bigint NOT NULL DEFAULT 0,
  transports text[] DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz
);

CREATE INDEX IF NOT EXISTS user_passkeys_user_id_idx ON public.user_passkeys (user_id);

ALTER TABLE public.user_passkeys ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_passkeys_select_own ON public.user_passkeys
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.webauthn_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge text NOT NULL UNIQUE,
  user_id uuid REFERENCES auth.users (id) ON DELETE CASCADE,
  email text,
  purpose text NOT NULL CHECK (purpose IN ('register', 'login')),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '5 minutes')
);

CREATE INDEX IF NOT EXISTS webauthn_challenges_expires_idx ON public.webauthn_challenges (expires_at);

ALTER TABLE public.webauthn_challenges ENABLE ROW LEVEL SECURITY;
