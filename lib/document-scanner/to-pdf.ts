'use client';

import { PDF_FALLBACK_JPEG_QUALITY, MAX_OUTPUT_DIMENSION } from './constants';
import { assertBlobWithinLimit, MAX_INVOICE_PDF_BYTES, scaleCanvasToMaxDimension } from '@/lib/upload-blob-utils';

export type PdfExportOptions = {
  /**
   * استخدم PNG (ضغط Deflate بلا فقد بيانات) بدل JPEG لتضمين الصورة داخل
   * الـ PDF. الأنسب حصراً للمستندات التي حُوِّلت فعلياً لأبيض/أسود عالي
   * التباين (بعد `enhanceDocumentCanvas`): مناطق
   * واسعة مسطّحة بيضاء/سوداء تضغط ممتازاً جداً بلا فقد عبر PNG (غالباً أصغر
   * حجماً بكثير من JPEG لنفس المحتوى)، وتتجنّب تماماً تشويش/تمويه الحواف
   * (Ringing Artifacts) الذي يُنتجه ضغط JPEG (بخسارة معلومات) حول حواف
   * الحروف الحادة — فتبقى النصوص أوضح وأحدّ رغم صغر حجم الملف.
   */
  preferPng?: boolean;
  /** دقة أعلى لصفحة PDF (~200ppi بدل ~150ppi) — مناسب لمسح المستندات. */
  highQuality?: boolean;
};

/**
 * يحوّل كانفاس المستند الممسوح (بعد تصحيح المنظور والتحسين) مباشرة إلى ملف
 * PDF (Blob) داخل المتصفح — بحجم صفحة مطابق لأبعاد المستند نفسه (وليس A4
 * ثابتاً) لتفادي أي هوامش بيضاء زائدة حول المستند الممسوح، مع تفعيل ضغط
 * jsPDF الداخلي (`compress: true`) لتقليل حجم الملف النهائي إلى أدنى حدّ.
 */
export async function canvasToDocumentPdfBlob(canvas: HTMLCanvasElement, options?: PdfExportOptions): Promise<Blob> {
  if (typeof window === 'undefined') {
    throw new Error('تحويل المستند إلى PDF متاح فقط من المتصفح.');
  }

  const { jsPDF } = await import('jspdf');

  const scaled = scaleCanvasToMaxDimension(canvas, MAX_OUTPUT_DIMENSION);

  const widthPx = scaled.width;
  const heightPx = scaled.height;
  const orientation = widthPx >= heightPx ? 'landscape' : 'portrait';

  const ppi = options?.highQuality ? 200 : 150;
  const PX_PER_MM = ppi / 25.4;
  const widthMm = widthPx / PX_PER_MM;
  const heightMm = heightPx / PX_PER_MM;

  const doc = new jsPDF({ orientation, unit: 'mm', format: [widthMm, heightMm], compress: true });

  if (options?.preferPng) {
    const dataUrl = scaled.toDataURL('image/png');
    doc.addImage(dataUrl, 'PNG', 0, 0, widthMm, heightMm, undefined, 'FAST');
  } else {
    const dataUrl = scaled.toDataURL('image/jpeg', PDF_FALLBACK_JPEG_QUALITY);
    doc.addImage(dataUrl, 'JPEG', 0, 0, widthMm, heightMm, undefined, 'FAST');
  }

  const blob = doc.output('blob');
  assertBlobWithinLimit(blob, 'ملف PDF', MAX_INVOICE_PDF_BYTES);
  return blob;
}
