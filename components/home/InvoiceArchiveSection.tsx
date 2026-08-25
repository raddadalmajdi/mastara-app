'use client';

import { InvoiceThumbnail } from '@/components/invoices/InvoiceThumbnail';
import { DocumentStackIcon } from '@/components/icons/BrandIcons';
import { formatInvoiceDate } from '@/lib/home/invoice-helpers';
import type { CustomerInvoice } from '@/lib/home/types';
import { isCustomerPhoneSearchable } from '@/lib/tailor-customers';

type InvoiceArchiveSectionProps = {
  customerLocalPhone: string;
  customerInvoices: CustomerInvoice[];
  whatsappMessages: Record<string, string>;
  onWhatsappMessageChange: (invoiceId: string, message: string) => void;
  onOpenImage: (index: number) => void;
  onSendWhatsApp: (fullPhone: string, invoiceId: string) => void;
  onDownloadPdf: (invoice: CustomerInvoice, invoiceNumber: number) => void;
  onPrintPdf: (invoice: CustomerInvoice, invoiceNumber: number) => void;
  exportingPdfId: string | null;
};

export function InvoiceArchiveSection({
  customerLocalPhone,
  customerInvoices,
  whatsappMessages,
  onWhatsappMessageChange,
  onOpenImage,
  onSendWhatsApp,
  onDownloadPdf,
  onPrintPdf,
  exportingPdfId,
}: InvoiceArchiveSectionProps) {
  if (!isCustomerPhoneSearchable(customerLocalPhone) || customerInvoices.length === 0) {
    return null;
  }

  const latestInvoice = customerInvoices[0];
  const latestInvoiceNumber = customerInvoices.length;

  return (
    <section className="space-y-4">
      <h2 className="text-base sm:text-lg text-mistara-gold font-bold">
        أرشيف فواتير العميل (<span className="tnum">{customerInvoices.length}</span>)
      </h2>

      <div className="glass-panel border-2 border-mistara-gold/50 rounded-3xl p-4 shadow-2xl space-y-3">
        <div className="flex items-center justify-between bg-mistara-cream px-4 py-2.5 rounded-2xl border border-mistara-gold/30">
          <div>
            <span className="text-sm sm:text-base font-black text-mistara-warm">
              ⭐ الفاتورة الأحدث (فاتورة #<span className="tnum">{latestInvoiceNumber}</span>)
            </span>
            <span className="text-xs text-mistara-brown/80 font-bold font-mono tnum block" dir="ltr">
              {formatInvoiceDate(latestInvoice.created_at ?? '')}
            </span>
          </div>
        </div>

        <div className="w-full bg-mistara-cream rounded-2xl border border-mistara-brown/15 p-2 flex flex-col items-center space-y-3">
          <div
            onClick={() => onOpenImage(0)}
            className="w-full h-96 sm:h-[28rem] lg:h-[32rem] rounded-xl overflow-hidden border border-mistara-gold/30 glass-panel cursor-pointer relative shadow-inner flex items-center justify-center"
          >
            <InvoiceThumbnail
              src={latestInvoice.image_url}
              alt="Latest Invoice"
              className="w-full h-full object-contain"
              priority
            />
          </div>

          <div className="flex gap-2 w-full">
            <button
              type="button"
              onClick={() => onOpenImage(0)}
              className="flex-1 bg-mistara-gold/10 text-mistara-gold border border-mistara-gold/30 text-sm py-3 rounded-xl font-bold"
            >
              تكبير المعاينة
            </button>
            <button
              type="button"
              disabled={exportingPdfId === latestInvoice.id}
              onClick={() => onDownloadPdf(latestInvoice, latestInvoiceNumber)}
              className="flex-1 bg-primary text-primary-foreground font-bold text-sm py-3 rounded-xl text-center shadow-md flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              {exportingPdfId === latestInvoice.id ? (
                <span>جارٍ التجهيز...</span>
              ) : (
                <>
                  <DocumentStackIcon className="h-4 w-4 shrink-0" />
                  <span>تنزيل PDF</span>
                </>
              )}
            </button>
          </div>
          <button
            type="button"
            disabled={exportingPdfId === latestInvoice.id}
            onClick={() => onPrintPdf(latestInvoice, latestInvoiceNumber)}
            className="w-full glass-panel text-mistara-warm border border-mistara-gold/30 text-sm py-3 rounded-xl font-bold flex items-center justify-center gap-1 disabled:opacity-50"
          >
            <span>{exportingPdfId === latestInvoice.id ? 'جارٍ التجهيز...' : '🖨️ معاينة وطباعة PDF'}</span>
          </button>
        </div>

        <div className="bg-mistara-cream border border-mistara-brown/15 rounded-2xl p-3 space-y-2">
          <label className="text-sm text-mistara-gold font-bold block">رسالة الواتساب المخصصة لهذه الفاتورة:</label>
          <textarea
            value={whatsappMessages[latestInvoice.id] || ''}
            onChange={(e) => onWhatsappMessageChange(latestInvoice.id, e.target.value)}
            rows={3}
            className="w-full glass-panel border border-mistara-brown/15 rounded-xl p-3 text-sm text-mistara-espresso focus:border-mistara-gold focus:outline-none resize-y"
            placeholder="اكتب رسالة الواتساب..."
          />
          <button
            type="button"
            onClick={() => onSendWhatsApp(latestInvoice.customer_phone ?? '', latestInvoice.id)}
            className="w-full bg-mistara-gold-dark hover:bg-mistara-gold text-mistara-cream font-bold text-base py-3.5 rounded-xl flex items-center justify-center gap-2 shadow-lg transition-all"
          >
            <span>💬 إرسال عبر واتساب</span>
          </button>
        </div>
      </div>

      {customerInvoices.length > 1 && (
        <div className="space-y-3 pt-2">
          <h3 className="text-sm text-mistara-brown/80 font-bold">الفواتير السابقة (الأرشيف)</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            {customerInvoices.slice(1).map((inv, subIndex) => {
              const actualIndex = subIndex + 1;
              const invoiceNumber = customerInvoices.length - actualIndex;

              return (
                <div key={inv.id} className="glass-panel border border-mistara-brown/15 rounded-2xl p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-mistara-gold font-bold">
                      فاتورة #<span className="tnum">{invoiceNumber}</span>
                    </span>
                    <span className="text-xs text-mistara-brown/60 font-bold font-mono tnum" dir="ltr">
                      {formatInvoiceDate(inv.created_at ?? '')}
                    </span>
                  </div>

                  <div className="flex gap-3">
                    <div
                      onClick={() => onOpenImage(actualIndex)}
                      className="w-24 h-32 shrink-0 rounded-xl overflow-hidden bg-mistara-cream border border-mistara-brown/15 cursor-pointer relative flex items-center justify-center"
                    >
                      <InvoiceThumbnail src={inv.image_url} alt="Old Invoice" className="w-full h-full object-contain" />
                    </div>

                    <div className="flex-1 min-w-0 space-y-2">
                      <textarea
                        value={whatsappMessages[inv.id] || ''}
                        onChange={(e) => onWhatsappMessageChange(inv.id, e.target.value)}
                        rows={2}
                        className="w-full bg-mistara-cream border border-mistara-brown/15 rounded-xl p-2 text-sm text-mistara-espresso focus:border-mistara-gold focus:outline-none resize-y"
                      />
                      <div className="flex gap-1.5">
                        <button
                          type="button"
                          onClick={() => onSendWhatsApp(inv.customer_phone ?? '', inv.id)}
                          className="flex-1 bg-mistara-gold/15 text-mistara-gold-dark border border-mistara-gold-dark/30 text-xs sm:text-sm font-bold py-2.5 rounded-xl flex items-center justify-center gap-1.5"
                        >
                          <span>💬 واتساب</span>
                        </button>
                        <button
                          type="button"
                          disabled={exportingPdfId === inv.id}
                          onClick={() => onDownloadPdf(inv, invoiceNumber)}
                          className="flex-1 bg-primary/10 text-primary-dark border border-primary/30 text-xs sm:text-sm font-bold py-2.5 rounded-xl flex items-center justify-center gap-1.5 disabled:opacity-50"
                        >
                          {exportingPdfId === inv.id ? (
                            <span>...</span>
                          ) : (
                            <>
                              <DocumentStackIcon className="h-3.5 w-3.5 shrink-0" />
                              <span>PDF</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
