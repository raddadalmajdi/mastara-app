'use client';

import { useEffect } from 'react';

export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[RouteError]', error);
  }, [error]);

  return (
    <main
      className="min-h-screen bg-[#030712] flex flex-col items-center justify-center px-5 gap-4"
      dir="rtl"
    >
      <h1 className="text-xl font-bold text-rose-300">تعذّر تحميل الصفحة</h1>
      <p className="text-xs text-slate-400 text-center max-w-sm leading-relaxed">
        {error.message || 'خطأ غير متوقع. جرّب إعادة التحميل.'}
      </p>
      <button
        type="button"
        onClick={() => reset()}
        className="rounded-xl bg-cyan-500 px-6 py-3 text-slate-950 font-bold text-sm"
      >
        إعادة المحاولة
      </button>
    </main>
  );
}
