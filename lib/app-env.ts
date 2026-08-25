/** عنوان التطبيق العام — النطاق eysalk.com */
const DEFAULT_APP_URL = 'https://eysalk.com';

export function getAppPublicUrl(fallback = DEFAULT_APP_URL): string {
  const raw =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    fallback;

  try {
    const url = new URL(raw);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return fallback;
    }
    return url.origin;
  } catch {
    return fallback;
  }
}

export function assertValidEmailRedirectTo(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`emailRedirectTo غير صالح: ${raw}`);
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`emailRedirectTo يجب أن يبدأ بـ http/https: ${raw}`);
  }

  return url.toString();
}

export function getAuthCallbackUrl(): string {
  if (typeof window !== 'undefined') {
    return assertValidEmailRedirectTo(`${window.location.origin}/auth/callback`);
  }
  return assertValidEmailRedirectTo(`${getAppPublicUrl()}/auth/callback`);
}
