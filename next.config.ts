import type { NextConfig } from 'next';

const isMobileExport = process.env.MOBILE_EXPORT === '1';

const nextConfig: NextConfig = {
  ...(isMobileExport
    ? {
        output: 'export',
        // Capacitor serves files from `out/` — no Next image optimizer server.
        images: { unoptimized: true },
      }
    : {
        serverExternalPackages: ['firebase-admin'],
        images: {
          remotePatterns: [{ protocol: 'https', hostname: 'firebasestorage.googleapis.com' }],
        },
      }),
  allowedDevOrigins: ['172.20.10.3'],
  async headers() {
    if (isMobileExport) return [];
    return [
      {
        source: '/libs/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
      {
        source: '/:path*.js',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
    ];
  },
};

export default nextConfig;
