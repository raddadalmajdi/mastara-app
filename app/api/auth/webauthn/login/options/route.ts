import { NextResponse } from 'next/server';
import { generateAuthenticationOptions } from '@simplewebauthn/server';
import { getWebAuthnRpConfig } from '@/lib/webauthn/rp-config';
import { resolveUserIdByEmail, saveWebAuthnChallenge } from '@/lib/webauthn/server-store';

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { email?: string };
    const email = body.email?.trim().toLowerCase() || undefined;

    const { rpID } = getWebAuthnRpConfig();

    // iOS / Safari: مفاتيح سكنية (residentKey: required) — لا نمرّر allowCredentials
    // ليظهر Face ID مباشرة ويختار iCloud Keychain / Passkey المناسب للموقع.
    const options = await generateAuthenticationOptions({
      rpID,
      userVerification: 'required',
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
