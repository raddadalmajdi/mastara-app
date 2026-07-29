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

  let ringClass = 'border-rose-500 bg-rose-500/15';
  let inner: ReactNode = (
    <span className="h-8 w-8 rounded-full bg-rose-500/80 animate-pulse" aria-hidden />
  );

  if (phase === 'uploading') {
    ringClass = 'border-emerald-400 bg-emerald-500/20';
    inner = (
      <span
        className="absolute inset-2 rounded-full border-2 border-emerald-300/30 border-t-emerald-300 animate-spin"
        aria-hidden
      />
    );
  } else if (phase === 'success') {
    ringClass = 'border-emerald-400 bg-emerald-500/25';
    inner = (
      <svg className="h-10 w-10 text-emerald-300" viewBox="0 0 24 24" fill="none" aria-hidden>
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
    ringClass = 'border-rose-500 bg-rose-500/20';
    inner = <span className="text-2xl text-rose-300" aria-hidden>✕</span>;
  }

  return (
    <div className={`flex flex-col items-center gap-2 pointer-events-none ${className}`}>
      <div className={`${ringBase} ${ringClass}`}>{inner}</div>
      <p className="text-xs sm:text-sm font-bold text-white text-center max-w-[12rem] leading-snug">
        {phase === 'preparing' && 'جاري التحضير...'}
        {phase === 'uploading' && 'جاري رفع الفاتورة...'}
        {phase === 'success' && 'تم حفظ الفاتورة بنجاح'}
        {phase === 'error' && (errorMessage ?? 'تعذّر حفظ الفاتورة')}
      </p>
    </div>
  );
}
