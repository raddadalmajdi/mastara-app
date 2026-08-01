import type { Metadata, Viewport } from 'next';
import { cairo } from './fonts';
import './globals.css';
import {
  APP_APPLE_TOUCH_ICON_PATH,
  APP_FAVICON_16_PATH,
  APP_FAVICON_PATH,
  APP_MANIFEST_PATH,
  APP_NAME,
  APP_TAGLINE,
} from '@/lib/brand';
import { BrandWatermark } from '@/components/brand/BrandWatermark';

export const metadata: Metadata = {
  title: `${APP_NAME} | ${APP_TAGLINE}`,
  description: APP_TAGLINE,
  manifest: APP_MANIFEST_PATH,
  icons: {
    icon: [
      { url: APP_FAVICON_16_PATH, type: 'image/png', sizes: '16x16' },
      { url: APP_FAVICON_PATH, type: 'image/png', sizes: '32x32' },
    ],
    shortcut: APP_FAVICON_PATH,
    apple: [{ url: APP_APPLE_TOUCH_ICON_PATH, type: 'image/png', sizes: '180x180' }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: APP_NAME,
  },
  applicationName: APP_NAME,
};

export const viewport: Viewport = {
  themeColor: '#1877F2',
  colorScheme: 'light',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

const shellStyle = {
  backgroundColor: '#F0F7FF',
  color: '#0A2463',
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
      <head>
        <link rel="icon" href={APP_FAVICON_16_PATH} type="image/png" sizes="16x16" />
        <link rel="icon" href={APP_FAVICON_PATH} type="image/png" sizes="32x32" />
        <link rel="apple-touch-icon" href={APP_APPLE_TOUCH_ICON_PATH} sizes="180x180" />
      </head>
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
