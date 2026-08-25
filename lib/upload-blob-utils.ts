'use client';

import { PDF_FALLBACK_JPEG_QUALITY, SCAN_JPEG_QUALITY } from '@/lib/document-scanner/constants';

/** أبعاد/أحجام مستهدفة للتخزين — توازن بين الوضوح وتكلفة Firebase Storage. */
export const STORAGE_JPEG_MAX_DIMENSION = 1600;
export const STORAGE_JPEG_TARGET_BYTES = 420_000;
export const STORAGE_PDF_TARGET_BYTES = 1_800_000;

/** حدود قصوى (رفض) للرفع المباشر إلى Firebase Storage. */
export const MAX_INVOICE_PDF_BYTES = 8 * 1024 * 1024;
export const MAX_INVOICE_JPEG_BYTES = 900_000;

export function formatByteSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function assertBlobWithinLimit(blob: Blob, label: string, maxBytes: number): void {
  if (blob.size <= maxBytes) return;
  throw new Error(
    `${label} كبير جداً (${formatByteSize(blob.size)}). الحد الأقصى ${formatByteSize(maxBytes)} — جرّب إعادة المسح أو تقريب الكاميرا.`
  );
}

/** يترجم أخطاء Firebase Storage / الشبكة إلى رسائل عربية واضحة. */
export function toUploadUserMessage(error: unknown): string {
  if (error && typeof error === 'object') {
    const code = 'code' in error ? String((error as { code?: string }).code) : '';
    switch (code) {
      case 'storage/unauthorized':
        return 'لا صلاحية لرفع الملف. تأكد من تسجيل الدخول ثم أعد المحاولة.';
      case 'storage/unauthenticated':
        return 'انتهت جلسة الدخول. سجّل الدخول مجدداً ثم ارفع المستند.';
      case 'storage/canceled':
        return 'تم إلغاء الرفع.';
      case 'storage/quota-exceeded':
        return 'مساحة التخزين ممتلئة. تواصل مع الدعم.';
      case 'storage/retry-limit-exceeded':
        return 'فشل الرفع بعد عدة محاولات. تحقق من الإنترنت وحاول مجدداً.';
      case 'storage/invalid-checksum':
        return 'تلف الملف أثناء الرفع. أعد المسح وحاول مجدداً.';
      default:
        break;
    }
  }

  const message = error instanceof Error ? error.message : String(error ?? '');
  if (/load failed|failed to fetch|networkerror|network error/i.test(message)) {
    return 'فشل الاتصال بالتخزين السحابي (Load failed). تحقق من الإنترنت وحاول مجدداً.';
  }
  if (/quota exceeded|quotaexceeded/i.test(message)) {
    return 'مساحة التخزين المحلية ممتلئة. سجّل الدخول للحفظ السحابي.';
  }

  return message || 'تعذّر رفع المستند. حاول مجدداً.';
}

function canvasToJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('تعذّر ضغط JPEG.'))),
      'image/jpeg',
      quality
    );
  });
}

async function blobToOptimizedCanvas(
  blob: Blob,
  maxDimension: number
): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(blob);
  let { width, height } = bitmap;
  const longest = Math.max(width, height);
  if (longest > maxDimension) {
    const scale = maxDimension / longest;
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close();
    throw new Error('تعذّر ضغط صورة المعاينة.');
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  return canvas;
}

/**
 * ضغط ذكي للمعاينة — يُصغّر الأبعاد ويخفض الجودة تدريجياً حتى الحجم المستهدف
 * مع الحفاظ على قابلية قراءة النص.
 */
export async function optimizeJpegForStorage(
  blob: Blob,
  options?: {
    maxBytes?: number;
    maxDimension?: number;
    targetBytes?: number;
  }
): Promise<Blob> {
  const maxBytes = options?.maxBytes ?? MAX_INVOICE_JPEG_BYTES;
  const maxDimension = options?.maxDimension ?? STORAGE_JPEG_MAX_DIMENSION;
  const targetBytes = options?.targetBytes ?? STORAGE_JPEG_TARGET_BYTES;

  const canvas = await blobToOptimizedCanvas(blob, maxDimension);
  const qualities = [SCAN_JPEG_QUALITY, 0.86, 0.8, PDF_FALLBACK_JPEG_QUALITY, 0.72, 0.65, 0.58];

  let best: Blob | null = null;
  for (const quality of qualities) {
    const compressed = await canvasToJpeg(canvas, quality);
    best = compressed;
    if (compressed.size <= targetBytes) return compressed;
    if (compressed.size <= maxBytes) continue;
  }

  if (best && best.size <= maxBytes) return best;

  throw new Error(
    `صورة المعاينة كبيرة جداً (${formatByteSize(blob.size)}). أعد المسح من مسافة أقرب.`
  );
}

/** @deprecated استخدم optimizeJpegForStorage */
export async function compressJpegBlobIfNeeded(
  blob: Blob,
  maxBytes: number,
  maxDimension = STORAGE_JPEG_MAX_DIMENSION
): Promise<Blob> {
  return optimizeJpegForStorage(blob, { maxBytes, maxDimension });
}

/** يعيد بناء PDF مضغوط من JPEG إذا تجاوز PDF الأصلي الحجم المستهدف. */
export async function optimizePdfForStorage(pdfBlob: Blob, jpegBlob: Blob): Promise<Blob> {
  if (pdfBlob.size <= STORAGE_PDF_TARGET_BYTES) return pdfBlob;

  if (typeof window === 'undefined') return pdfBlob;

  const { jsPDF } = await import('jspdf');
  const bitmap = await createImageBitmap(jpegBlob);
  const widthPx = bitmap.width;
  const heightPx = bitmap.height;
  bitmap.close();

  const orientation = widthPx >= heightPx ? 'landscape' : 'portrait';
  const PX_PER_MM = 200 / 25.4;
  const widthMm = widthPx / PX_PER_MM;
  const heightMm = heightPx / PX_PER_MM;

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('تعذّر قراءة JPEG لضغط PDF.'));
    reader.readAsDataURL(jpegBlob);
  });

  const doc = new jsPDF({ orientation, unit: 'mm', format: [widthMm, heightMm], compress: true });
  doc.addImage(dataUrl, 'JPEG', 0, 0, widthMm, heightMm, undefined, 'FAST');
  const rebuilt = doc.output('blob');

  if (rebuilt.size < pdfBlob.size) return rebuilt;
  return pdfBlob.size <= MAX_INVOICE_PDF_BYTES ? pdfBlob : rebuilt;
}

/** يحدّ أبعاد الكانفاس قبل إنشاء PDF/JPEG لتقليل حجم الملفات. */
export function scaleCanvasToMaxDimension(
  canvas: HTMLCanvasElement,
  maxDimension: number
): HTMLCanvasElement {
  const w = canvas.width;
  const h = canvas.height;
  const longest = Math.max(w, h);
  if (longest <= maxDimension) return canvas;

  const scale = maxDimension / longest;
  const next = document.createElement('canvas');
  next.width = Math.round(w * scale);
  next.height = Math.round(h * scale);
  const ctx = next.getContext('2d');
  if (!ctx) throw new Error('تعذّر تصغير المستند.');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(canvas, 0, 0, next.width, next.height);
  return next;
}

/** تحضير JPEG+PDF قبل الرفع — ضغط موحّد من جهة العميل. */
export async function prepareInvoiceBlobsForUpload(input: {
  jpegBlob: Blob;
  pdfBlob: Blob;
}): Promise<{ jpegBlob: Blob; pdfBlob: Blob }> {
  const jpegBlob = await optimizeJpegForStorage(input.jpegBlob);
  assertBlobWithinLimit(jpegBlob, 'صورة المعاينة', MAX_INVOICE_JPEG_BYTES);

  const pdfBlob = await optimizePdfForStorage(input.pdfBlob, jpegBlob);
  assertBlobWithinLimit(pdfBlob, 'ملف PDF', MAX_INVOICE_PDF_BYTES);

  return { jpegBlob, pdfBlob };
}
