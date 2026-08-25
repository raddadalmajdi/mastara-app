'use client';

/**
 * تصدير/طباعة صور الفواتير بصيغة PDF بدلاً من فتح/تنزيل الصورة الخام مباشرة.
 *
 * ملاحظة عن الخطوط: لا نضمّن خط عربي مخصصاً داخل ملف الـ PDF (jsPDF لا يدعم
 * الحروف العربية بخطوطه الافتراضية دون تضمين خط TTF/OTF عربي كـ base64)،
 * لذا أي نص عنوان داخل الملف نفسه (رقم الفاتورة/التاريخ) يُكتب بأحرف/أرقام
 * لاتينية فقط لضمان ظهوره بشكل صحيح. صورة الفاتورة نفسها (وقد تحتوي نصاً
 * عربياً كصورة) تُدرج كما هي دون أي تغيير.
 */

export type InvoicePdfMeta = {
  /** مثال: "Invoice #3" */
  invoiceLabel?: string;
  /** مثال: "2026-07-27 14:30" */
  dateLabel?: string;
};

function guessImageFormat(src: string): 'PNG' | 'WEBP' | 'JPEG' {
  const lower = src.toLowerCase();
  if (lower.startsWith('data:image/png') || lower.includes('.png')) return 'PNG';
  if (lower.startsWith('data:image/webp') || lower.includes('.webp')) return 'WEBP';
  return 'JPEG';
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    // روابط Firebase Storage العامة (وأي رابط بعيد) تحتاج crossOrigin حتى لا
    // "تُلوَّث" الصورة عند تمريرها لـ jsPDF/Canvas. روابط data: لا تحتاجها.
    if (!src.startsWith('data:')) {
      img.crossOrigin = 'anonymous';
    }
    img.onload = () => resolve(img);
    img.onerror = () =>
      reject(new Error('تعذّر تحميل صورة الفاتورة لإنشاء ملف PDF. تحقق من الاتصال بالإنترنت.'));
    img.src = src;
  });
}

/** يبني مستند jsPDF من صورة فاتورة واحدة، بحجم صفحة A4 مع توسيط الصورة. */
async function buildInvoicePdfDocument(imageSrc: string, meta?: InvoicePdfMeta) {
  if (typeof window === 'undefined') {
    throw new Error('تصدير PDF متاح فقط من المتصفح.');
  }

  const [{ jsPDF }, img] = await Promise.all([import('jspdf'), loadImageElement(imageSrc)]);

  const imgW = img.naturalWidth || img.width || 1;
  const imgH = img.naturalHeight || img.height || 1;
  const orientation = imgW >= imgH ? 'landscape' : 'portrait';

  const doc = new jsPDF({ orientation, unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 10;
  const hasHeader = Boolean(meta?.invoiceLabel || meta?.dateLabel);
  const headerHeight = hasHeader ? 12 : 0;

  const maxW = pageWidth - margin * 2;
  const maxH = pageHeight - margin * 2 - headerHeight;

  let renderW = maxW;
  let renderH = (imgH / imgW) * renderW;
  if (renderH > maxH) {
    renderH = maxH;
    renderW = (imgW / imgH) * renderH;
  }

  const x = (pageWidth - renderW) / 2;
  const y = margin + headerHeight;

  if (hasHeader) {
    const headerText = [meta?.invoiceLabel, meta?.dateLabel].filter(Boolean).join('   |   ');
    doc.setFontSize(10);
    doc.setTextColor(60, 60, 60);
    doc.text(headerText, pageWidth / 2, margin + 5, { align: 'center' });
  }

  doc.addImage(img, guessImageFormat(imageSrc), x, y, renderW, renderH, undefined, 'FAST');

  return doc;
}

function safePdfFileName(name: string): string {
  const trimmed = name.trim().replace(/[\\/:*?"<>|]+/g, '-') || 'invoice';
  return trimmed.endsWith('.pdf') ? trimmed : `${trimmed}.pdf`;
}

/** يُنشئ PDF من صورة الفاتورة ويبدأ تنزيله مباشرةً (بديل تنزيل الصورة الخام). */
export async function downloadInvoiceAsPdf(
  imageSrc: string,
  fileName: string,
  meta?: InvoicePdfMeta
): Promise<void> {
  const doc = await buildInvoicePdfDocument(imageSrc, meta);
  doc.save(safePdfFileName(fileName));
}

/**
 * يفتح PDF الفاتورة في تبويب جديد جاهزاً للمعاينة/الطباعة (بديل "فتح كرابط"
 * الذي كان يفتح الصورة الخام مباشرة).
 *
 * نفتح نافذة فارغة فوراً (بشكل متزامن ضمن نفس حدث النقر) قبل أي `await`
 * لتفادي حظر المتصفح للنوافذ المنبثقة، ثم نملأها برابط الملف بعد إنشائه.
 */
export async function openInvoicePdfForPrint(
  imageSrc: string,
  meta?: InvoicePdfMeta
): Promise<void> {
  const pendingWindow = typeof window !== 'undefined' ? window.open('', '_blank') : null;

  try {
    const doc = await buildInvoicePdfDocument(imageSrc, meta);
    const blobUrl = doc.output('bloburl').toString();

    if (pendingWindow && !pendingWindow.closed) {
      pendingWindow.location.href = blobUrl;
    } else {
      // حُظرت النافذة المنبثقة: نتراجع إلى تنزيل مباشر حتى لا تضيع محاولة المستخدم.
      doc.save(safePdfFileName(meta?.invoiceLabel || 'invoice'));
    }
  } catch (error) {
    pendingWindow?.close();
    throw error;
  }
}

function triggerBlobDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/** تنزيل ملف PDF مخزّن مسبقاً (رابط Firebase Storage مثلاً). */
export async function downloadStoredPdf(pdfUrl: string, fileName: string): Promise<void> {
  const res = await fetch(pdfUrl);
  if (!res.ok) {
    throw new Error('تعذّر تحميل ملف PDF من التخزين.');
  }
  const blob = await res.blob();
  triggerBlobDownload(blob, fileName);
}

/** فتح PDF مخزّن في تبويب للمعاينة/الطباعة. */
export function openStoredPdfForPrint(pdfUrl: string): void {
  window.open(pdfUrl, '_blank', 'noopener,noreferrer');
}
