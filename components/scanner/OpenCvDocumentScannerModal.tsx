'use client';

import { useCallback, useState } from 'react';
import DocumentScanner from './DocumentScanner';
import { canvasToDocumentPdfBlob } from '@/lib/document-scanner/to-pdf';
import { dataUrlToCanvas, dataUrlToJpegBlob } from '@/lib/scanner-data-url';
import type { DocumentScanResult } from '@/lib/document-scanner/scan-result';

type OpenCvDocumentScannerModalProps = {
  onClose: () => void;
  onConfirm: (result: DocumentScanResult) => Promise<void>;
};

/**
 * غلاف ملء الشاشة لماسح OpenCV — يحوّل data URL إلى JPEG+PDF
 * ثم يمرّرهما لمسار رفع Supabase الموجود في الصفحة الرئيسية.
 */
export function OpenCvDocumentScannerModal({ onClose, onConfirm }: OpenCvDocumentScannerModalProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleCapture = useCallback(
    async (dataUrl: string) => {
      setIsSaving(true);
      setErrorMessage(null);
      try {
        const canvas = await dataUrlToCanvas(dataUrl);
        const jpegBlob = await dataUrlToJpegBlob(dataUrl);
        const pdfBlob = await canvasToDocumentPdfBlob(canvas, { preferPng: false, highQuality: true });
        await onConfirm({ jpegBlob, pdfBlob });
      } catch (err) {
        console.error('[opencv-scanner] save failed', err);
        setErrorMessage(err instanceof Error ? err.message : 'تعذّر حفظ المستند.');
        setIsSaving(false);
      }
    },
    [onConfirm]
  );

  return (
    <div className="fixed inset-0 z-[70] flex flex-col glass-modal-backdrop" dir="rtl">
      <header className="relative z-20 flex items-center justify-between border-b border-mistara-gold/20 bg-mistara-cream/80 px-4 py-3 backdrop-blur-md">
        <h2 className="text-sm font-black text-mistara-gold">ماسح OpenCV المتقدّم</h2>
        <button
          type="button"
          onClick={onClose}
          disabled={isSaving}
          className="rounded-xl border border-mistara-brown/20 glass-panel px-3 py-1.5 text-sm font-bold text-mistara-brown disabled:opacity-50"
        >
          ✕
        </button>
      </header>

      {errorMessage && (
        <div
          role="alert"
          className="relative z-20 mx-4 mt-3 rounded-2xl border border-red-800/35 bg-red-800/8 px-3.5 py-2.5 text-sm font-bold text-red-900"
        >
          {errorMessage}
        </div>
      )}

      {isSaving ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3">
          <span className="h-10 w-10 animate-spin rounded-full border-2 border-mistara-gold/30 border-t-mistara-gold" />
          <p className="text-sm font-bold text-mistara-warm">جاري رفع المستند...</p>
        </div>
      ) : (
        <DocumentScanner
          autoStartCamera
          onCapture={handleCapture}
          onClose={onClose}
          className="min-h-0 flex-1 overflow-hidden"
        />
      )}
    </div>
  );
}
