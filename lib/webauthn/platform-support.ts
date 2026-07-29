/**
 * فحص توافق WebAuthn — Safari/iOS يتطلب HTTPS و PublicKeyCredential.
 * يُفضّل التحقق من توفر Face ID/Touch ID قبل استدعاء startRegistration/startAuthentication.
 */
export function isPublicKeyCredentialAvailable(): boolean {
  return typeof window !== 'undefined' && typeof window.PublicKeyCredential !== 'undefined';
}

export async function assertWebAuthnPlatformReady(): Promise<void> {
  if (!isPublicKeyCredentialAvailable()) {
    throw new Error(
      'المتصفح لا يدعم Passkeys. على iPhone استخدم Safari (iOS 16+) أو حدّث iOS، وتأكد من فتح الموقع عبر HTTPS.'
    );
  }

  if (!window.isSecureContext) {
    throw new Error('Passkeys تعمل فقط عبر اتصال آمن (HTTPS).');
  }

  const checkPlatform =
    typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === 'function'
      ? PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
      : Promise.resolve(true);

  const platformAvailable = await checkPlatform;
  if (!platformAvailable) {
    throw new Error(
      'Face ID / Touch ID غير متاح على هذا الجهاز. فعّل القفل البيومتري في إعدادات iPhone ثم أعد المحاولة.'
    );
  }
}

/** @deprecated استخدم isPublicKeyCredentialAvailable أو assertWebAuthnPlatformReady */
export function isWebAuthnSupported(): boolean {
  return isPublicKeyCredentialAvailable();
}
