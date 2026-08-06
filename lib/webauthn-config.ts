import { APP_NAME } from '@/lib/brand';
import { getAppPublicUrl } from '@/lib/supabase/env';

export function getWebAuthnOriginFromRequest(request: Request): string {
  const forwardedHost = request.headers.get('x-forwarded-host');
  const forwardedProto = request.headers.get('x-forwarded-proto') ?? 'https';
  if (forwardedHost) {
    return `${forwardedProto}://${forwardedHost.split(',')[0]?.trim()}`;
  }
  const host = request.headers.get('host');
  if (host) {
    const proto = host.includes('localhost') ? 'http' : 'https';
    return `${proto}://${host}`;
  }
  return getAppPublicUrl();
}

export function getWebAuthnRpIdFromOrigin(origin: string): string {
  try {
    const hostname = new URL(origin).hostname;
    if (hostname === '127.0.0.1') return 'localhost';
    return hostname;
  } catch {
    return 'localhost';
  }
}

export function getWebAuthnRpConfig(request: Request): { rpName: string; rpID: string; origin: string } {
  const origin = getWebAuthnOriginFromRequest(request);
  return {
    rpName: APP_NAME,
    rpID: getWebAuthnRpIdFromOrigin(origin),
    origin,
  };
}
