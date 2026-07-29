import { NextResponse } from 'next/server';
import { verifyRegistrationResponse } from '@simplewebauthn/server';
import { createClient } from '@supabase/supabase-js';
import { getSupabasePublicConfig, normalizeSupabaseProjectUrl } from '@/lib/supabase/env';
import { getWebAuthnRpConfig } from '@/lib/webauthn/rp-config';
import { consumeWebAuthnChallenge, insertPasskey } from '@/lib/webauthn/server-store';

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
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ ok: false, message: 'جلسة غير صالحة.' }, { status: 401 });
    }

    const body = await request.json();
    if (!body?.response?.clientDataJSON) {
      return NextResponse.json({ ok: false, message: 'استجابة Passkey ناقصة.' }, { status: 400 });
    }

    const clientDataJson = JSON.parse(
      Buffer.from(body.response.clientDataJSON, 'base64url').toString('utf8')
    ) as { challenge?: string };
    if (!clientDataJson.challenge) {
      return NextResponse.json({ ok: false, message: 'تحدي Passkey مفقود.' }, { status: 400 });
    }

    const challengeRow = await consumeWebAuthnChallenge(clientDataJson.challenge, 'register');
    if (!challengeRow || challengeRow.user_id !== user.id) {
      return NextResponse.json({ ok: false, message: 'انتهت صلاحية التحدي.' }, { status: 400 });
    }

    const { origin, rpID } = getWebAuthnRpConfig();
    const verification = await verifyRegistrationResponse({
      response: body,
      expectedChallenge: clientDataJson.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
    });

    if (!verification.verified || !verification.registrationInfo) {
      return NextResponse.json({ ok: false, message: 'فشل التحقق من Passkey.' }, { status: 400 });
    }

    const { credential } = verification.registrationInfo;

    await insertPasskey({
      user_id: user.id,
      credential_id: credential.id,
      public_key: Buffer.from(credential.publicKey).toString('base64url'),
      counter: credential.counter,
      transports: body.response.transports ?? [],
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'خطأ غير متوقع.';
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
