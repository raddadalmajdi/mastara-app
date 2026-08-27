'use client';

import { useEffect, useState } from 'react';
import { InvoiceScanFabIcon } from '@/components/icons/BrandIcons';
import {
  InvoiceSaveProgressRing,
  type InvoiceSaveUiPhase,
} from '@/components/invoices/InvoiceSaveProgressRing';

type ScannerFabProps = {
  visible: boolean;
  uploadSavePhase: InvoiceSaveUiPhase;
  uploadSaveError: string | null;
  isUploading: boolean;
  onOpenScanner: () => void;
};

function useKeyboardSafeInset() {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;

    const update = () => {
      const covered = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
      setInset(covered);
    };

    update();
    viewport.addEventListener('resize', update);
    viewport.addEventListener('scroll', update);
    window.addEventListener('orientationchange', update);
    return () => {
      viewport.removeEventListener('resize', update);
      viewport.removeEventListener('scroll', update);
      window.removeEventListener('orientationchange', update);
    };
  }, []);

  return inset;
}

function useScrollLift() {
  const [lift, setLift] = useState(0);

  useEffect(() => {
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const y = window.scrollY || document.documentElement.scrollTop;
        setLift(Math.min(10, y * 0.04));
      });
    };

    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
    };
  }, []);

  return lift;
}

export function ScannerFab({
  visible,
  uploadSavePhase,
  uploadSaveError,
  isUploading,
  onOpenScanner,
}: ScannerFabProps) {
  const keyboardInset = useKeyboardSafeInset();
  const scrollLift = useScrollLift();

  if (!visible) return null;

  const bottomOffset = Math.max(16, keyboardInset > 0 ? keyboardInset + 12 : 16);

  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-40 flex justify-center px-4"
      style={{
        bottom: `calc(${bottomOffset}px + env(safe-area-inset-bottom, 0px))`,
        transform: `translateY(-${scrollLift}px)`,
        transition: 'bottom 220ms ease, transform 220ms ease',
      }}
    >
      {uploadSavePhase !== 'idle' ? (
        <div className="pointer-events-auto">
          <InvoiceSaveProgressRing phase={uploadSavePhase} errorMessage={uploadSaveError} />
        </div>
      ) : (
        <button
          type="button"
          onClick={onOpenScanner}
          disabled={isUploading}
          aria-label="مسح الفاتورة بالكاميرا — التقاط فوري للمستند كاملاً"
          title="مسح الفاتورة بالكاميرا"
          className="scanner-fab pointer-events-auto touch-manipulation disabled:cursor-not-allowed disabled:opacity-60"
        >
          <span className="scanner-fab__pulse" aria-hidden />
          <span className="scanner-fab__icon" aria-hidden>
            <InvoiceScanFabIcon className="h-7 w-7" />
          </span>
          <span className="scanner-fab__copy">
            <span className="scanner-fab__title">مسح الفاتورة</span>
            <span className="scanner-fab__hint">التقاط فوري بالكاميرا</span>
          </span>
        </button>
      )}
    </div>
  );
}
