'use client';

/**
 * تحسين بسيط لمظهر المستند بعد تصحيح المنظور: رفع تباين خفيف + توازن سطوع
 * لإعطاء انطباع "ماسح ضوئي" نظيف وواضح (بدون تحويله للأبيض والأسود، حفاظاً
 * على شعارات/ألوان الفاتورة الأصلية).
 */
export function enhanceDocumentCanvas(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const { width, height } = canvas;
  if (!width || !height) return;

  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;

  const contrast = 1.16;
  const brightness = 6;
  const intercept = 128 * (1 - contrast) + brightness;

  for (let i = 0; i < data.length; i += 4) {
    data[i] = clamp255(data[i] * contrast + intercept);
    data[i + 1] = clamp255(data[i + 1] * contrast + intercept);
    data[i + 2] = clamp255(data[i + 2] * contrast + intercept);
  }

  ctx.putImageData(imageData, 0, 0);
}

function clamp255(value: number): number {
  return value < 0 ? 0 : value > 255 ? 255 : value;
}
