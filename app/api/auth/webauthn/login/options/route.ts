import { NextResponse } from 'next/server';
import { generateAuthenticationOptions } from '@simplewebauthn/server';
import { getWebAuthnRpConfig } from '@/lib/webauthn/rp-config';
import {
  listPasskeysByEmail,
  resolveUserIdByEmail,
  saveWebAuthnChallenge,
} from '@/lib/webauthn/server-store';

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { email?: string };
    const email = body.email?.trim().toLowerCase();

    const { rpID } = getWebAuthnRpConfig();

    const passkeys = email ? await listPasskeysByEmail(email) : [];

    if (email && !passkeys.length) {
      return NextResponse.json(
        {
          ok: false,
          message:
            'لا يوجد Passkey مسجّل لهذا البريد. سجّل الدخول بالكلمة المرور ثم فعّل البصمة من الإعدادات.',
        },
        { status: 404 }
      );
    }

    const options = await generateAuthenticationOptions({
      rpID,
      userVerification: 'required',
      allowCredentials:
        passkeys.length > 0
          ? passkeys.map((pk) => ({
              id: pk.credential_id,
              transports: (pk.transports ?? []) as AuthenticatorTransport[],
            }))
          : undefined,
    });

    const userId = email ? await resolveUserIdByEmail(email) : null;

    await saveWebAuthnChallenge({
      challenge: options.challenge,
      purpose: 'login',
      userId,
      email: email ?? null,
    });

    return NextResponse.json({ ok: true, options });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'خطأ غير متوقع.';
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
