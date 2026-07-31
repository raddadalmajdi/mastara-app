import type { Metadata, Viewport } from 'next';
import { cairo } from './fonts';
import './globals.css';
import { APP_LOGO_PATH, APP_LOGO_SIZE, APP_NAME, APP_TAGLINE } from '@/lib/brand';
import { BrandWatermark } from '@/components/brand/BrandWatermark';

export const metadata: Metadata = {
  title: `${APP_NAME} | ${APP_TAGLINE}`,
  description: APP_TAGLINE,
  manifest: '/manifest.json',
  icons: {
    icon: [
      { url: APP_LOGO_PATH, type: 'image/png', sizes: APP_LOGO_SIZE },
      { url: '/favicon.ico', sizes: '32x32', type: 'image/x-icon' },
    ],
    shortcut: APP_LOGO_PATH,
    apple: [{ url: APP_LOGO_PATH, type: 'image/png', sizes: APP_LOGO_SIZE }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: APP_NAME,
  },
  applicationName: APP_NAME,
};

export const viewport: Viewport = {
  themeColor: '#E8EBF0',
  colorScheme: 'light',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

const shellStyle = {
  backgroundColor: '#E8EBF0',
  color: '#1E293B',
  minHeight: '100%',
} as const;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ar"
      dir="rtl"
      style={shellStyle}
      className={`${cairo.variable} bg-mistara-sand`}
      suppressHydrationWarning
    >
      <body
        style={shellStyle}
        className="relative min-h-screen bg-mistara-sand text-mistara-espresso antialiased"
        suppressHydrationWarning
      >
        <BrandWatermark />
        <div className="relative z-[1] min-h-screen">{children}</div>
      </body>
    </html>
  );
}
