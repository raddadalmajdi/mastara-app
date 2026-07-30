'use client';

import { useEffect } from 'react';
import { AuthBootScreen } from '@/components/auth/AuthBootScreen';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[GlobalError]', error);
  }, [error]);

  return (
    <html lang="ar" dir="rtl" style={{ backgroundColor: '#EDE4D3', color: '#2C1810' }}>
      <body style={{ backgroundColor: '#EDE4D3', margin: 0 }}>
        <div className="min-h-screen flex flex-col items-center justify-center px-5 gap-4">
          <AuthBootScreen message="حدث خطأ أثناء تحميل التطبيق." />
          <button
            type="button"
            onClick={() => reset()}
            className="rounded-xl bg-mistara-gold px-6 py-3 text-mistara-cream font-bold text-sm"
          >
            إعادة المحاولة
          </button>
          <p className="text-[10px] text-mistara-brown/60 max-w-sm text-center font-mono" dir="ltr">
            {error.message}
          </p>
        </div>
      </body>
    </html>
  );
}
