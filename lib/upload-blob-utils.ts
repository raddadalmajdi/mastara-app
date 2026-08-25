'use client';

import { PDF_FALLBACK_JPEG_QUALITY, SCAN_JPEG_QUALITY } from '@/lib/document-scanner/constants';

/** حدود آمنة للرفع المباشر إلى Firebase Storage (بدون API route). */
export const MAX_INVOICE_PDF_BYTES = 12 * 1024 * 1024;
export const MAX_INVOICE_JPEG_BYTES = 6 * 1024 * 1024;

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

/** يصغّر JPEG إذا تجاوز الحد — عبر خفض الجودة ثم التصغير الهندسي. */
export async function compressJpegBlobIfNeeded(
  blob: Blob,
  maxBytes: number,
  maxDimension = 2000
): Promise<Blob> {
  if (blob.size <= maxBytes) return blob;

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
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  for (const quality of [SCAN_JPEG_QUALITY, 0.82, PDF_FALLBACK_JPEG_QUALITY, 0.72, 0.62]) {
    const compressed = await canvasToJpeg(canvas, quality);
    if (compressed.size <= maxBytes) return compressed;
  }

  throw new Error(
    `صورة المعاينة كبيرة جداً (${formatByteSize(blob.size)}). أعد المسح من مسافة أقرب.`
  );
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
  ctx.drawImage(canvas, 0, 0, next.width, next.height);
  return next;
}
