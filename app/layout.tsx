import type { Metadata, Viewport } from 'next';
import { cairo } from './fonts';
import './globals.css';
import {
  APP_APPLE_TOUCH_ICON_PATH,
  APP_FAVICON_16_PATH,
  APP_FAVICON_PATH,
  APP_LOGO_OG_PATH,
  APP_MANIFEST_PATH,
  APP_NAME,
  APP_SITE_URL,
  APP_TAGLINE,
} from '@/lib/brand';
import { BrandWatermark } from '@/components/brand/BrandWatermark';
import { AppProviders } from './providers';

export const metadata: Metadata = {
  metadataBase: new URL(APP_SITE_URL),
  title: {
    default: `${APP_NAME} | ${APP_TAGLINE}`,
    template: `%s | ${APP_NAME}`,
  },
  description: APP_TAGLINE,
  applicationName: APP_NAME,
  manifest: APP_MANIFEST_PATH,
  alternates: {
    canonical: '/',
  },
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
  openGraph: {
    type: 'website',
    locale: 'ar_SA',
    url: APP_SITE_URL,
    siteName: APP_NAME,
    title: `${APP_NAME} | ${APP_TAGLINE}`,
    description: APP_TAGLINE,
    images: [
      {
        url: APP_LOGO_OG_PATH,
        width: 1024,
        height: 916,
        alt: APP_NAME,
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: `${APP_NAME} | ${APP_TAGLINE}`,
    description: APP_TAGLINE,
    images: [APP_LOGO_OG_PATH],
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  themeColor: '#0073CF',
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
        <link rel="canonical" href={APP_SITE_URL} />
        <link rel="icon" href={APP_FAVICON_16_PATH} type="image/png" sizes="16x16" />
        <link rel="icon" href={APP_FAVICON_PATH} type="image/png" sizes="32x32" />
        <link rel="apple-touch-icon" href={APP_APPLE_TOUCH_ICON_PATH} sizes="180x180" />
        <meta property="og:url" content={APP_SITE_URL} />
        <meta property="og:image" content={APP_LOGO_OG_PATH} />
      </head>
      <body
        style={shellStyle}
        className="relative min-h-screen bg-mistara-sand text-mistara-espresso antialiased"
        suppressHydrationWarning
      >
        <BrandWatermark />
        <AppProviders>
          <div className="relative z-[1] min-h-screen">{children}</div>
        </AppProviders>
      </body>
    </html>
  );
}
