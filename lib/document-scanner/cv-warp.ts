'use client';

/**
 * تصحيح منظور حقيقي (Perspective Transform / Homography) عبر OpenCV.js
 * (`getPerspectiveTransform` + `warpPerspective`) — يحاكي رياضياً وضع
 * المستند تحت جهاز مسح ضوئي مسطّح (Flatbed Scanner): يُسقط شبه المنحرف
 * المكتشف (4 زوايا، ولو مائلاً بزاوية واضحة) إلى مستطيل مسطّح تماماً
 * بالأبعاد المطلوبة، عبر معالجة WASM مُحسَّنة (أسرع وأدق من حلقة JS يدوية
 * بكسلاً-بكسل عند دقات الإخراج الكبيرة).
 *
 * يعيد `null` عند تعذّر OpenCV.js أو أي خطأ، كي يتراجع المستدعي بأمان تام
 * إلى `warpPerspective` اليدوي في `geometry.ts`.
 */

import type { Quad } from './geometry';
import { getOpenCv, isOpenCvReady, type OpenCvNamespace } from './opencv-loader';

function deleteAll(mats: Array<{ delete: () => void } | undefined | null>): void {
  for (const m of mats) {
    try {
      m?.delete();
    } catch {
      // تجاهل: قد يكون الكائن محذوفاً بالفعل في مسار خطأ جزئي.
    }
  }
}

export function warpPerspectiveCv(source: HTMLCanvasElement, quad: Quad, outWidth: number, outHeight: number): HTMLCanvasElement | null {
  if (!isOpenCvReady()) return null;
  const cv: OpenCvNamespace = getOpenCv();
  if (!cv) return null;

  let src, srcPoints, dstPoints, transform, warped;
  try {
    src = cv.imread(source);

    srcPoints = cv.matFromArray(4, 1, cv.CV_32FC2, [
      quad[0].x,
      quad[0].y,
      quad[1].x,
      quad[1].y,
      quad[2].x,
      quad[2].y,
      quad[3].x,
      quad[3].y,
    ]);
    dstPoints = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, outWidth, 0, outWidth, outHeight, 0, outHeight]);

    transform = cv.getPerspectiveTransform(srcPoints, dstPoints);
    warped = new cv.Mat();
    // نملأ أي منطقة خارج حدود المصدر بالأبيض (BORDER_CONSTANT بلون أبيض) لمظهر "ورقة" نظيف بدل حواف سوداء.
    cv.warpPerspective(
      src,
      warped,
      transform,
      new cv.Size(outWidth, outHeight),
      cv.INTER_LINEAR,
      cv.BORDER_CONSTANT,
      new cv.Scalar(255, 255, 255, 255)
    );

    const out = document.createElement('canvas');
    out.width = outWidth;
    out.height = outHeight;
    cv.imshow(out, warped);
    return out;
  } catch (err) {
    console.error('[scanner] فشل تصحيح المنظور عبر OpenCV.js', err);
    return null;
  } finally {
    deleteAll([src, srcPoints, dstPoints, transform, warped]);
  }
}
