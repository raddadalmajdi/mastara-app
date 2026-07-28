'use client';

import { SCAN_JPEG_QUALITY } from './constants';

/**
 * يحوّل كانفاس المستند الممسوح (بعد تصحيح المنظور والتحسين) مباشرة إلى ملف
 * PDF (Blob) داخل المتصفح — بحجم صفحة مطابق لأبعاد المستند نفسه (وليس A4
 * ثابتاً) لتفادي أي هوامش بيضاء زائدة حول المستند الممسوح.
 */
export async function canvasToDocumentPdfBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  if (typeof window === 'undefined') {
    throw new Error('تحويل المستند إلى PDF متاح فقط من المتصفح.');
  }

  const { jsPDF } = await import('jspdf');

  const widthPx = canvas.width;
  const heightPx = canvas.height;
  const orientation = widthPx >= heightPx ? 'landscape' : 'portrait';

  // تحويل بكسل → مم بافتراض دقة ~150ppi لحفظ نسبة أبعاد المستند الممسوح كما هي
  const PX_PER_MM = 150 / 25.4;
  const widthMm = widthPx / PX_PER_MM;
  const heightMm = heightPx / PX_PER_MM;

  const doc = new jsPDF({ orientation, unit: 'mm', format: [widthMm, heightMm] });
  const dataUrl = canvas.toDataURL('image/jpeg', SCAN_JPEG_QUALITY);
  doc.addImage(dataUrl, 'JPEG', 0, 0, widthMm, heightMm, undefined, 'FAST');

  return doc.output('blob');
}
