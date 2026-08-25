'use client';

import { APP_NAME } from '@/lib/brand';

export function WelcomeSuccessOverlay() {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center glass-modal-backdrop px-6">
      <div className="w-full max-w-xs rounded-3xl border border-primary/25 glass-panel p-6 text-center shadow-2xl space-y-3">
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
        <p className="text-base font-bold text-primary-dark">تم التحقق بنجاح</p>
        <p className="text-sm text-mistara-brown/80">مرحباً بك في {APP_NAME}</p>
      </div>
    </div>
  );
}
