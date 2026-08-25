'use client';

import { CameraScanIcon, ReceiptIcon } from '@/components/icons/BrandIcons';
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

export function ScannerFab({
  visible,
  uploadSavePhase,
  uploadSaveError,
  isUploading,
  onOpenScanner,
}: ScannerFabProps) {
  if (!visible) return null;

  return (
    <div className="fixed bottom-4 left-0 right-0 z-40 flex justify-center items-center pointer-events-none">
      {uploadSavePhase !== 'idle' ? (
        <InvoiceSaveProgressRing phase={uploadSavePhase} errorMessage={uploadSaveError} />
      ) : (
        <button
          type="button"
          onClick={onOpenScanner}
          disabled={isUploading}
          aria-label="ماسح OpenCV المتقدّم — اكتشاف حي للحواف"
          className="pointer-events-auto flex h-28 w-28 flex-col items-center justify-center gap-0.5 rounded-full border-4 border-accent/90 bg-gradient-to-br from-primary-light via-primary to-primary-dark px-2 text-center text-primary-foreground shadow-[0_0_36px_rgba(0,115,207,0.38)] transition-transform active:scale-95 disabled:cursor-not-allowed disabled:opacity-60 sm:h-32 sm:w-32"
          title="فتح الكاميرا ومسح فاتورة أو مستند"
        >
          <span className="relative flex h-9 w-12 items-center justify-center" aria-hidden>
            <ReceiptIcon className="absolute left-0 h-5 w-5 opacity-90" />
            <CameraScanIcon className="absolute right-0 h-6 w-6 drop-shadow-sm" />
          </span>
          <span className="max-w-[6.5rem] text-[10px] font-black leading-tight sm:text-[11px]">
            ماسح OpenCV المتقدّm
          </span>
          <span className="max-w-[7rem] text-[8px] font-bold leading-tight opacity-85 sm:text-[9px]">
            اكتشاف حي للحواف
          </span>
        </button>
      )}
    </div>
  );
}
