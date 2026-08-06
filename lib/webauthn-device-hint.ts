export type BiometricHint = {
  shortLabel: string;
  registerLabel: string;
  loginLabel: string;
  icon: 'face' | 'fingerprint' | 'platform';
};

/** يكتشف نوع الجهاز/المتصفح لعرض Face ID أو بصمة الجهاز أو Windows Hello. */
export function detectBiometricHint(): BiometricHint {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return {
      shortLabel: 'Passkey',
      registerLabel: 'تسجيل Passkey',
      loginLabel: 'الدخول بـ Passkey',
      icon: 'platform',
    };
  }

  const ua = navigator.userAgent;
  const isIOS =
    /iPhone|iPad|iPod/i.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/i.test(ua);
  const isMacDesktop = /Macintosh/i.test(ua) && navigator.maxTouchPoints <= 1;
  const isWindows = /Windows/i.test(ua);

  if (isIOS) {
    const hasFaceId = /iPhone/i.test(ua) && !/iPhone [1-8]|iPhone SE/i.test(ua);
    return {
      shortLabel: hasFaceId ? 'Face ID' : 'Touch ID',
      registerLabel: hasFaceId ? 'تسجيل Face ID' : 'تسجيل Touch ID',
      loginLabel: hasFaceId ? 'الدخول بـ Face ID' : 'الدخول بـ Touch ID',
      icon: 'face',
    };
  }

  if (isAndroid) {
    return {
      shortLabel: 'بصمة الجهاز',
      registerLabel: 'تسجيل بصمة/وجه الجهاز',
      loginLabel: 'الدخول بالبصمة أو الوجه',
      icon: 'fingerprint',
    };
  }

  if (isMacDesktop) {
    return {
      shortLabel: 'Touch ID',
      registerLabel: 'تسجيل Touch ID',
      loginLabel: 'الدخول بـ Touch ID',
      icon: 'fingerprint',
    };
  }

  if (isWindows) {
    return {
      shortLabel: 'Windows Hello',
      registerLabel: 'تسجيل Windows Hello',
      loginLabel: 'الدخول بـ Windows Hello',
      icon: 'platform',
    };
  }

  return {
    shortLabel: 'Passkey',
    registerLabel: 'تسجيل Passkey',
    loginLabel: 'الدخول بـ Passkey',
    icon: 'platform',
  };
}

export function isWebAuthnSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.PublicKeyCredential !== 'undefined' &&
    typeof window.PublicKeyCredential === 'function'
  );
}
