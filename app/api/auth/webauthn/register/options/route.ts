import { NextResponse } from 'next/server';
import { generateRegistrationOptions } from '@simplewebauthn/server';
import { createClient } from '@supabase/supabase-js';
import { getSupabasePublicConfig, normalizeSupabaseProjectUrl } from '@/lib/supabase/env';
import { getWebAuthnRpConfig } from '@/lib/webauthn/rp-config';
import { IOS_PLATFORM_AUTHENTICATOR_SELECTION } from '@/lib/webauthn/authenticator-selection';
import { listPasskeysForUser, saveWebAuthnChallenge } from '@/lib/webauthn/server-store';

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get('Authorization');
    const token = authHeader?.replace(/^Bearer\s+/i, '').trim();
    if (!token) {
      return NextResponse.json({ ok: false, message: 'يجب تسجيل الدخول أولاً.' }, { status: 401 });
    }

    const config = getSupabasePublicConfig();
    if (!config) {
      return NextResponse.json({ ok: false, message: 'Supabase غير مهيأ.' }, { status: 503 });
    }

    const url = normalizeSupabaseProjectUrl(config.url);
    if (!url) {
      return NextResponse.json({ ok: false, message: 'إعداد Supabase غير صالح.' }, { status: 503 });
    }

    const supabase = createClient(url, config.anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ ok: false, message: 'جلسة غير صالحة.' }, { status: 401 });
    }

    const existing = await listPasskeysForUser(user.id);
    const { rpID, rpName } = getWebAuthnRpConfig();

    const options = await generateRegistrationOptions({
      rpName,
      rpID,
      userName: user.email ?? user.id,
      userDisplayName: user.email ?? 'مسطرة 2030',
      userID: new TextEncoder().encode(user.id),
      attestationType: 'none',
      excludeCredentials: existing.map((pk) => ({
        id: pk.credential_id,
        transports: (pk.transports?.length
          ? pk.transports
          : ['internal']) as AuthenticatorTransport[],
      })),
      authenticatorSelection: IOS_PLATFORM_AUTHENTICATOR_SELECTION,
    });

    await saveWebAuthnChallenge({
      challenge: options.challenge,
      purpose: 'register',
      userId: user.id,
      email: user.email,
    });

    return NextResponse.json({ ok: true, options });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'خطأ غير متوقع.';
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
