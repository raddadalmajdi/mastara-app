import type { AuthenticatorSelectionCriteria } from '@simplewebauthn/server';

/** إعدادات موحّدة لـ Face ID / Touch ID على iOS و Safari (مفتاح سكني على الجهاز). */
export const IOS_PLATFORM_AUTHENTICATOR_SELECTION: AuthenticatorSelectionCriteria = {
  authenticatorAttachment: 'platform',
  residentKey: 'required',
  userVerification: 'required',
};

/** transports مفضّلة لـ Passkeys على Apple (platform = internal). */
export const IOS_PREFERRED_TRANSPORTS = ['internal', 'hybrid'] as const;
