'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { completeAuthFromCallbackParams } from '@/lib/auth-callback';
import { logSupabaseAuthErrorJson } from '@/lib/auth-debug';
import { getAuthCallbackUrl, getSupabaseBrowserClient } from '@/lib/supabase-browser';
import { AuthBootScreen } from '@/components/auth/AuthBootScreen';
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
      className="relative min-h-screen bg-[#030712] flex flex-col items-center justify-center px-5 py-8 overflow-hidden"
      dir="rtl"
    >
      <div
        className="pointer-events-none absolute -top-32 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-cyan-500/20 blur-[100px]"
        aria-hidden
      />
      <div className="relative w-full max-w-sm mx-auto bg-slate-900/90 backdrop-blur-xl border border-white/10 rounded-[2rem] p-8 shadow-[0_25px_70px_-15px_rgba(8,145,178,0.35)] text-center space-y-4">
        <h1 className="text-2xl font-black text-cyan-400">مسطرة 2030</h1>

        {status === 'loading' && (
          <>
            <div className="mx-auto h-12 w-12 rounded-full border-2 border-cyan-500/30 border-t-cyan-400 animate-spin" />
            <p className="text-sm text-slate-300">جاري تأكيد حسابك بأمان...</p>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/15 ring-4 ring-emerald-500/30">
              <svg className="h-8 w-8 text-emerald-400" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path
                  d="M5 13l4 4L19 7"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <p className="text-sm font-bold text-emerald-300">تم تأكيد حسابك بنجاح!</p>
            <p className="text-xs text-slate-400">سيتم تحويلك إلى لوحة التحكم...</p>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-rose-500/15 ring-4 ring-rose-500/30">
              <svg className="h-8 w-8 text-rose-400" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M8 8l8 8M16 8l-8 8" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
              </svg>
            </div>
            <p className="text-sm font-bold text-rose-300">تعذّر تأكيد الحساب</p>
            <p className="text-xs text-slate-400 leading-relaxed">{errorMessage}</p>
            <button
              type="button"
              onClick={() => router.replace('/')}
              className="w-full rounded-xl bg-cyan-500 py-3 text-slate-950 font-bold text-sm"
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
