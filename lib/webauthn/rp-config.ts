/** إعدادات Relying Party لـ WebAuthn (Passkeys / Face ID / Touch ID). */
export function getWebAuthnRpConfig(): { rpID: string; rpName: string; origin: string } {
  const fallback = 'https://www.malaktout.com';
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim() || fallback;
  let origin: string;
  try {
    origin = new URL(raw).origin;
  } catch {
    origin = fallback;
  }

  const hostname = new URL(origin).hostname;
  const rpID = hostname;

  return {
    rpID,
    rpName: 'مسطرة 2030',
    origin,
  };
}
