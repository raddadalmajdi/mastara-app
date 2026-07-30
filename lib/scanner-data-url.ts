'use client';

import { SCAN_JPEG_QUALITY } from '@/lib/document-scanner/constants';

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('تعذّر تحميل صورة المستند.'));
    img.src = src;
  });
}

/** يحوّل data URL إلى كانفاس للمعالجة اللاحقة (JPEG/PDF). */
export async function dataUrlToCanvas(dataUrl: string): Promise<HTMLCanvasElement> {
  const img = await loadImageElement(dataUrl);
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth || img.width;
  canvas.height = img.naturalHeight || img.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('تعذّر إنشاء سياق الرسم.');
  ctx.drawImage(img, 0, 0);
  return canvas;
}

/** يحوّل data URL إلى Blob JPEG بجودة مسح المستندات في المشروع. */
export async function dataUrlToJpegBlob(dataUrl: string): Promise<Blob> {
  const canvas = await dataUrlToCanvas(dataUrl);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('تعذّر إنشاء JPEG.'))),
      'image/jpeg',
      SCAN_JPEG_QUALITY
    );
  });
}
