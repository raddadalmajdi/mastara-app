import type { Metadata, Viewport } from 'next';
import { cairo } from './fonts';
import './globals.css';

export const metadata: Metadata = {
  title: 'مسطرة | نظام فواتير الخياطين',
  description: 'النظام الذكي لإدارة فواتير وعملاء الخياطين',
  manifest: '/manifest.json',
  icons: {
    icon: '/logo.png',
    apple: '/logo.png',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'مسطرة',
  },
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
        className="min-h-screen bg-mistara-sand text-mistara-espresso antialiased"
        suppressHydrationWarning
      >
        {children}
      </body>
    </html>
  );
}
