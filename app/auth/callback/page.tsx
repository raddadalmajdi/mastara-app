'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { completeAuthFromCallbackParams } from '@/lib/auth-callback';
import { logSupabaseAuthErrorJson } from '@/lib/auth-debug';
import { getAuthCallbackUrl, getSupabaseBrowserClient } from '@/lib/supabase-browser';
import { AuthBootScreen } from '@/components/auth/AuthBootScreen';
import { AppBrand } from '@/components/brand/AppBrand';
import { withTimeout } from '@/lib/async-timeout';

function AuthCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setStatus('error');
      setErrorMessage('إعدادات Supabase غير مكتملة. تحقق من متغيرات البيئة.');
      return;
    }

    const client = supabase;

    async function completeAuth() {
      const params = {
        code: searchParams.get('code'),
        tokenHash: searchParams.get('token_hash'),
        type: searchParams.get('type'),
        error: searchParams.get('error'),
        errorDescription: searchParams.get('error_description'),
      };

      if (process.env.NODE_ENV === 'development') {
        console.group('Supabase auth/callback (client page)');
        console.log('expected redirect base:', getAuthCallbackUrl());
        console.log('query params:', params);
        console.log('full URL:', window.location.href);
        console.groupEnd();
      }

      const result = await withTimeout(
        completeAuthFromCallbackParams(client, params),
        25_000,
        'تأكيد الحساب من الرابط'
      );

      if (!result.ok && process.env.NODE_ENV === 'development') {
        logSupabaseAuthErrorJson(result.error ?? { message: result.message }, 'auth/callback');
      }

      if (result.ok) {
        setStatus('success');
        window.setTimeout(() => router.replace('/'), 1600);
        return;
      }

      setStatus('error');
      setErrorMessage(result.message);
    }

    void completeAuth().catch((error) => {
      console.error('[auth/callback]', error);
      setStatus('error');
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'تعذّر تأكيد الحساب. ارجع للصفحة الرئيسية وحاول مجدداً.'
      );
    });
  }, [searchParams, router]);

  return (
    <main
      className="relative min-h-screen bg-mistara-sand flex flex-col items-center justify-center px-5 py-8 overflow-hidden"
      dir="rtl"
    >
      <div
        className="pointer-events-none absolute -top-32 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-mistara-gold/15 blur-[100px]"
        aria-hidden
      />
      <div className="relative w-full max-w-sm sm:max-w-md mx-auto glass-panel/90 backdrop-blur-xl border border-mistara-brown/12 rounded-[2rem] p-8 shadow-[0_25px_70px_-15px_rgba(212,175,55,0.22)] text-center space-y-4">
        <AppBrand size="lg" className="mx-auto" />

        {status === 'loading' && (
          <>
            <div className="mx-auto h-12 w-12 rounded-full border-2 border-mistara-gold/30 border-t-mistara-gold animate-spin" />
            <p className="text-base text-mistara-brown">جاري تأكيد حسابك بأمان...</p>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-mistara-gold/12 ring-4 ring-mistara-gold/30">
              <svg className="h-8 w-8 text-mistara-gold-dark" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path
                  d="M5 13l4 4L19 7"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <p className="text-base font-bold text-mistara-gold-dark">تم تأكيد حسابك بنجاح!</p>
            <p className="text-sm text-mistara-brown/80">سيتم تحويلك إلى لوحة التحكم...</p>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-800/10 ring-4 ring-red-800/25">
              <svg className="h-8 w-8 text-red-800" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M8 8l8 8M16 8l-8 8" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
              </svg>
            </div>
            <p className="text-base font-bold text-red-700">تعذّر تأكيد الحساب</p>
            <p className="text-sm text-mistara-brown/80 leading-relaxed">{errorMessage}</p>
            <button
              type="button"
              onClick={() => router.replace('/')}
              className="w-full rounded-xl bg-mistara-gold py-3 text-mistara-cream font-bold text-base"
            >
              العودة لإدخال رمز التحقق
            </button>
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
