import type { Metadata, Viewport } from 'next';
import { cairo } from './fonts';
import './globals.css';

export const metadata: Metadata = {
  title: 'مسطرة | نظام فواتير الخياطين',
  description: 'النظام الذكي لإدارة فواتير وعملاء الخياطين',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'مسطرة',
  },
};

export const viewport: Viewport = {
  themeColor: '#030712',
  colorScheme: 'dark',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

const shellStyle = {
  backgroundColor: '#030712',
  color: '#f1f5f9',
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
      className={`${cairo.variable} bg-[#030712]`}
      suppressHydrationWarning
    >
      <body
        style={shellStyle}
        className="min-h-screen bg-[#030712] text-slate-100 antialiased"
        suppressHydrationWarning
      >
        {children}
      </body>
    </html>
  );
}
