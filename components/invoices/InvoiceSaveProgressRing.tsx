'use client';

import type { ReactNode } from 'react';

export type InvoiceSaveUiPhase = 'idle' | 'preparing' | 'uploading' | 'success' | 'error';

type InvoiceSaveProgressRingProps = {
  phase: InvoiceSaveUiPhase;
  errorMessage?: string | null;
  className?: string;
};

export function InvoiceSaveProgressRing({
  phase,
  errorMessage,
  className = '',
}: InvoiceSaveProgressRingProps) {
  if (phase === 'idle') return null;

  const ringBase =
    'relative flex h-24 w-24 items-center justify-center rounded-full border-4 transition-colors duration-300';

  let ringClass = 'border-red-800 bg-red-800/10';
  let inner: ReactNode = (
    <span className="h-8 w-8 rounded-full bg-red-800/80 animate-pulse" aria-hidden />
  );

  if (phase === 'uploading') {
    ringClass = 'border-mistara-gold bg-mistara-gold/15';
    inner = (
      <span
        className="absolute inset-2 rounded-full border-2 border-mistara-gold-light/30 border-t-mistara-gold-light animate-spin"
        aria-hidden
      />
    );
  } else if (phase === 'success') {
    ringClass = 'border-mistara-gold bg-mistara-gold/20';
    inner = (
      <svg className="h-10 w-10 text-mistara-gold-dark" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M5 13l4 4L19 7"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  } else if (phase === 'error') {
    ringClass = 'border-red-800 bg-red-800/10';
    inner = <span className="text-2xl text-red-700" aria-hidden>✕</span>;
  }

  return (
    <div className={`flex flex-col items-center gap-2 pointer-events-none ${className}`}>
      <div className={`${ringBase} ${ringClass}`}>{inner}</div>
      <p className="text-xs sm:text-sm font-bold text-mistara-espresso text-center max-w-[12rem] leading-snug">
        {phase === 'preparing' && 'جاري التحضير...'}
        {phase === 'uploading' && 'جاري رفع الفاتورة...'}
        {phase === 'success' && 'تم حفظ الفاتورة بنجاح'}
        {phase === 'error' && (errorMessage ?? 'تعذّر حفظ الفاتورة')}
      </p>
    </div>
  );
}
