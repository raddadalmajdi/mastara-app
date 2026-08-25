'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AuthBootScreen } from '@/components/auth/AuthBootScreen';
import { AppBrand } from '@/components/brand/AppBrand';

function AuthCallbackContent() {
  const router = useRouter();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');

  useEffect(() => {
    setStatus('success');
    window.setTimeout(() => router.replace('/'), 1200);
  }, [router]);

  return (
    <main
      className="relative min-h-screen bg-mistara-sand flex flex-col items-center justify-center px-5 py-8 overflow-hidden"
      dir="rtl"
    >
      <div
        className="pointer-events-none absolute -top-32 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-primary/12 blur-[100px]"
        aria-hidden
      />
      <div className="auth-shell-card relative w-full max-w-sm sm:max-w-md mx-auto glass-panel backdrop-blur-xl rounded-[2rem] p-8 text-center space-y-4">
        <AppBrand size="hero" className="mx-auto" priority />

        {status === 'loading' && (
          <>
            <div className="mx-auto h-12 w-12 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
            <p className="text-base text-mistara-brown">جاري التحويل...</p>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 ring-4 ring-primary/25">
              <svg className="h-8 w-8 text-primary-dark" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path
                  d="M5 13l4 4L19 7"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <p className="text-base font-bold text-primary-dark">مرحباً بك في إيصالك!</p>
            <p className="text-sm text-mistara-brown/80">سيتم تحويلك إلى لوحة التحكم...</p>
          </>
        )}
      </div>
    </main>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={<AuthBootScreen message="جاري تحميل صفحة التفعيل..." />}>
      <AuthCallbackContent />
    </Suspense>
  );
}
