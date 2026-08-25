import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Capacitor mobile shell for إيصالك.
 *
 * - `webDir: out` matches Next.js static export (`MOBILE_EXPORT=1 next build`).
 * - Optional `CAPACITOR_SERVER_URL` loads the hosted app (recommended while API routes
 *   live on Vercel). Example: https://www.eysalk.com
 * - For local dev against `next dev`: CAPACITOR_SERVER_URL=http://localhost:3000
 */
const serverUrl = process.env.CAPACITOR_SERVER_URL?.trim();

const config: CapacitorConfig = {
  appId: 'com.eysalk.app',
  appName: 'إيصالك',
  webDir: 'out',
  ...(serverUrl
    ? {
        server: {
          url: serverUrl,
          cleartext: serverUrl.startsWith('http://'),
        },
      }
    : {}),
  android: {
    allowMixedContent: false,
  },
  ios: {
    contentInset: 'automatic',
  },
};

export default config;
