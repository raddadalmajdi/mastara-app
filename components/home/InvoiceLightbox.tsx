'use client';

import { InvoiceThumbnail } from '@/components/invoices/InvoiceThumbnail';
import { DocumentStackIcon } from '@/components/icons/BrandIcons';
import type { CustomerInvoice } from '@/lib/home/types';

type InvoiceLightboxProps = {
  activeIndex: number | null;
  invoices: CustomerInvoice[];
  exportingPdfId: string | null;
  onClose: () => void;
  onNavigate: (index: number) => void;
  onDownloadPdf: (invoice: CustomerInvoice, invoiceNumber: number) => void;
  onPrintPdf: (invoice: CustomerInvoice, invoiceNumber: number) => void;
};

export function InvoiceLightbox({
  activeIndex,
  invoices,
  exportingPdfId,
  onClose,
  onNavigate,
  onDownloadPdf,
  onPrintPdf,
}: InvoiceLightboxProps) {
  if (activeIndex === null) return null;

  const invoice = invoices[activeIndex];
  if (!invoice) return null;

  const invoiceNumber = invoices.length - activeIndex;

  return (
    <div className="fixed inset-0 glass-modal-backdrop z-50 flex flex-col items-center justify-center p-4">
      <div className="absolute top-4 right-4 z-10">
        <button
          type="button"
          onClick={onClose}
          className="w-11 h-11 rounded-full glass-panel border border-mistara-gold/30 text-mistara-gold font-bold flex items-center justify-center text-lg shadow-lg"
        >
          ✕
        </button>
      </div>

      <div className="relative w-full max-w-lg lg:max-w-2xl h-[70vh] sm:h-[80vh] glass-panel border border-mistara-gold/30 rounded-2xl overflow-hidden flex items-center justify-center p-2 shadow-2xl">
        <InvoiceThumbnail
          src={invoice.image_url}
          alt="Invoice Large"
          className="w-full h-full object-contain"
          priority
        />
      </div>

      <div className="flex items-center gap-4 mt-4">
        <button
          type="button"
          disabled={activeIndex >= invoices.length - 1}
          onClick={() => onNavigate(activeIndex + 1)}
          className="glass-panel disabled:opacity-30 border border-mistara-gold/30 text-mistara-gold text-sm px-4 py-2.5 rounded-xl font-bold"
        >
          السابق
        </button>
        <span className="text-sm text-mistara-gold font-bold font-mono tnum">
          {activeIndex + 1} / {invoices.length}
        </span>
        <button
          type="button"
          disabled={activeIndex <= 0}
          onClick={() => onNavigate(activeIndex - 1)}
          className="glass-panel disabled:opacity-30 border border-mistara-gold/30 text-mistara-gold text-sm px-4 py-2.5 rounded-xl font-bold"
        >
          التالي
        </button>
      </div>

      <div className="flex items-center gap-2 mt-3 w-full max-w-lg lg:max-w-2xl px-2">
        <button
          type="button"
          disabled={exportingPdfId === invoice.id}
          onClick={() => onDownloadPdf(invoice, invoiceNumber)}
          className="flex-1 bg-primary text-primary-foreground font-bold text-sm py-3 rounded-xl shadow-md disabled:opacity-50 flex items-center justify-center gap-1.5"
        >
          {exportingPdfId === invoice.id ? (
            'جارٍ التجهيز...'
          ) : (
            <>
              <DocumentStackIcon className="h-4 w-4 shrink-0" />
              <span>تنزيل PDF</span>
            </>
          )}
        </button>
        <button
          type="button"
          disabled={exportingPdfId === invoice.id}
          onClick={() => onPrintPdf(invoice, invoiceNumber)}
          className="flex-1 glass-panel text-mistara-warm border border-mistara-gold/30 text-sm py-3 rounded-xl font-bold disabled:opacity-50"
        >
          {exportingPdfId === invoice.id ? 'جارٍ التجهيز...' : '🖨️ طباعة PDF'}
        </button>
      </div>
    </div>
  );
}
