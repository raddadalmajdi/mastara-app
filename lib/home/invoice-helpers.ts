import type { CustomerInvoice } from '@/lib/home/types';

export function formatInvoiceDate(dateString: string): string {
  if (!dateString) return '';
  const date = new Date(dateString);
  return new Intl.DateTimeFormat('en-GB', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(date);
}

export function buildInvoicePdfLabel(invoice: CustomerInvoice, invoiceNumber: number) {
  return {
    fileName: `invoice-${invoiceNumber}`,
    meta: {
      invoiceLabel: `Invoice #${invoiceNumber}`,
      dateLabel: formatInvoiceDate(invoice.created_at ?? ''),
    },
  };
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error('تعذّر قراءة ملف المستند.'));
    reader.readAsDataURL(blob);
  });
}
