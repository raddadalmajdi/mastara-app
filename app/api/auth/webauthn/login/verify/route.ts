import { NextResponse } from 'next/server';
import { verifyAuthenticationResponse } from '@simplewebauthn/server';
import { createSupabaseAdminClient } from '@/lib/delete-auth-user-admin';
import { getWebAuthnRpConfig } from '@/lib/webauthn/rp-config';
import {
  consumeWebAuthnChallenge,
  findPasskeyByCredentialId,
  updatePasskeyCounter,
} from '@/lib/webauthn/server-store';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!body?.response?.clientDataJSON || !body?.id) {
      return NextResponse.json({ ok: false, message: 'استجابة Passkey ناقصة.' }, { status: 400 });
    }

    const clientDataJson = JSON.parse(
      Buffer.from(body.response.clientDataJSON, 'base64url').toString('utf8')
    ) as { challenge?: string };
    if (!clientDataJson.challenge) {
      return NextResponse.json({ ok: false, message: 'تحدي Passkey مفقود.' }, { status: 400 });
    }

    const challengeRow = await consumeWebAuthnChallenge(clientDataJson.challenge, 'login');
    if (!challengeRow) {
      return NextResponse.json({ ok: false, message: 'انتهت صلاحية التحدي.' }, { status: 400 });
    }

    const passkey = await findPasskeyByCredentialId(body.id);
    if (!passkey) {
      return NextResponse.json({ ok: false, message: 'Passkey غير معروف.' }, { status: 404 });
    }

    const { origin, rpID } = getWebAuthnRpConfig();
    const verification = await verifyAuthenticationResponse({
      response: body,
      expectedChallenge: clientDataJson.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
      credential: {
        id: passkey.credential_id,
        publicKey: Buffer.from(passkey.public_key, 'base64url'),
        counter: passkey.counter,
        transports: (passkey.transports ?? []) as AuthenticatorTransport[],
      },
    });

    if (!verification.verified) {
      return NextResponse.json({ ok: false, message: 'فشل التحقق من البصمة.' }, { status: 401 });
    }

    await updatePasskeyCounter(passkey.id, verification.authenticationInfo.newCounter);

    const admin = createSupabaseAdminClient();
    const { data: userData, error: userError } = await admin.auth.admin.getUserById(passkey.user_id);
    if (userError || !userData.user?.email) {
      return NextResponse.json({ ok: false, message: 'تعذّر العثور على الحساب.' }, { status: 404 });
    }

    const email = userData.user.email;
    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email,
    });

    if (linkError || !linkData.properties?.hashed_token) {
      return NextResponse.json(
        { ok: false, message: linkError?.message ?? 'تعذّر إنشاء جلسة بعد Passkey.' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      email,
      tokenHash: linkData.properties.hashed_token,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'خطأ غير متوقع.';
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
