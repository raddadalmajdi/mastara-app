/**
 * اكتشاف حواف مستند/ورقة داخل إطار كاميرا أو صورة ثابتة، بدون أي مكتبة رؤية
 * حاسوبية خارجية (لا OpenCV.js ولا أي حزمة إضافية) — فقط Canvas 2D عادي:
 *
 *   1) تصغير الإطار لكانفاس عمل صغير (أداء أسرع بكثير من معالجة الدقة الكاملة).
 *   2) تحويل إلى تدرج رمادي.
 *   3) عتبة Otsu تلقائية لفصل "الورقة" الساطعة عن الخلفية (والعكس احتياطاً
 *      لحالة ورقة داكنة على خلفية فاتحة).
 *   4) أكبر منطقة متصلة (Flood Fill تكراري بدون Recursion) تُعامَل كالمستند.
 *   5) تقريب حوافها الأربع عبر أقصى/أدنى قيم (x+y) و(x-y) — حيلة كلاسيكية
 *      خفيفة الحساب لتقدير شبه منحرف محدِّب من مجموعة نقاط دون تتبّع Contour
 *      كامل.
 *
 * النتيجة: شبه منحرف من 4 نقاط (Quad) بإحداثيات المصدر الأصلي (وليس الكانفاس
 * المصغّر)، جاهز لتصحيح المنظور في geometry.ts.
 */

import type { Point, Quad } from './geometry';
import {
  DETECTION_SAMPLE_WIDTH,
  MAX_COVERAGE_RATIO,
  MIN_COVERAGE_RATIO,
} from './constants';

export type DetectedQuad = {
  points: Quad;
  /** نسبة مساحة المستند المكتشف من مساحة الإطار الكلية (0..1) — مفيدة للتشخيص/الواجهة. */
  coverage: number;
};

function toGrayscale(data: Uint8ClampedArray, pixelCount: number): Uint8ClampedArray {
  const gray = new Uint8ClampedArray(pixelCount);
  for (let i = 0, p = 0; p < pixelCount; i += 4, p++) {
    gray[p] = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) | 0;
  }
  return gray;
}

/** عتبة Otsu الكلاسيكية لفصل مستويين (خلفية/مقدّمة) تلقائياً من الهيستوغرام. */
function otsuThreshold(gray: Uint8ClampedArray): number {
  const hist = new Array<number>(256).fill(0);
  for (let i = 0; i < gray.length; i++) hist[gray[i]]++;

  const total = gray.length;
  let sum = 0;
  for (let t = 0; t < 256; t++) sum += t * hist[t];

  let sumB = 0;
  let wB = 0;
  let maxVariance = 0;
  let threshold = 127;

  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;

    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const variance = wB * wF * (mB - mF) * (mB - mF);

    if (variance > maxVariance) {
      maxVariance = variance;
      threshold = t;
    }
  }

  return threshold;
}

type BlobCorners = {
  count: number;
  minSum: Point;
  maxSum: Point;
  minDiff: Point;
  maxDiff: Point;
};

/**
 * يبحث عن أكبر منطقة متصلة من البكسلات "الساطعة" (أعلى من العتبة) عبر
 * Flood Fill تكراري (مصفوفة Stack يدوية بدل استدعاء دوال متداخلة لتفادي
 * حدود عمق التكرار)، ويتتبّع أثناء الزحف 4 نقاط متطرفة تقارب زوايا شبه
 * منحرف محدِّب يحيط بالمنطقة (بدل تتبّع Contour كامل الأثقل حسابياً).
 */
function findLargestBrightBlob(gray: Uint8ClampedArray, width: number, height: number, threshold: number): BlobCorners | null {
  const total = width * height;
  const visited = new Uint8Array(total);
  const stack = new Int32Array(total);
  const isForeground = (idx: number) => gray[idx] > threshold;

  let best: BlobCorners | null = null;

  for (let start = 0; start < total; start++) {
    if (visited[start] || !isForeground(start)) continue;

    let sp = 0;
    stack[sp++] = start;
    visited[start] = 1;

    let count = 0;
    let minSum = Infinity;
    let maxSum = -Infinity;
    let minDiff = Infinity;
    let maxDiff = -Infinity;
    let minSumPt: Point = { x: 0, y: 0 };
    let maxSumPt: Point = { x: 0, y: 0 };
    let minDiffPt: Point = { x: 0, y: 0 };
    let maxDiffPt: Point = { x: 0, y: 0 };

    while (sp > 0) {
      const idx = stack[--sp];
      count++;
      const x = idx % width;
      const y = (idx / width) | 0;
      const s = x + y;
      const d = x - y;

      if (s < minSum) {
        minSum = s;
        minSumPt = { x, y };
      }
      if (s > maxSum) {
        maxSum = s;
        maxSumPt = { x, y };
      }
      if (d < minDiff) {
        minDiff = d;
        minDiffPt = { x, y };
      }
      if (d > maxDiff) {
        maxDiff = d;
        maxDiffPt = { x, y };
      }

      if (x > 0 && !visited[idx - 1] && isForeground(idx - 1)) {
        visited[idx - 1] = 1;
        stack[sp++] = idx - 1;
      }
      if (x < width - 1 && !visited[idx + 1] && isForeground(idx + 1)) {
        visited[idx + 1] = 1;
        stack[sp++] = idx + 1;
      }
      if (y > 0 && !visited[idx - width] && isForeground(idx - width)) {
        visited[idx - width] = 1;
        stack[sp++] = idx - width;
      }
      if (y < height - 1 && !visited[idx + width] && isForeground(idx + width)) {
        visited[idx + width] = 1;
        stack[sp++] = idx + width;
      }
    }

    if (!best || count > best.count) {
      best = { count, minSum: minSumPt, maxSum: maxSumPt, minDiff: minDiffPt, maxDiff: maxDiffPt };
    }
  }

  return best;
}

function blobToQuad(blob: BlobCorners, totalPixels: number): DetectedQuad | null {
  const coverage = blob.count / totalPixels;
  if (coverage < MIN_COVERAGE_RATIO || coverage > MAX_COVERAGE_RATIO) return null;

  // minSum=أعلى-يسار (أصغر x+y) | maxDiff=أعلى-يمين (أكبر x-y) | maxSum=أسفل-يمين | minDiff=أسفل-يسار
  return {
    points: [blob.minSum, blob.maxDiff, blob.maxSum, blob.minDiff],
    coverage,
  };
}

/**
 * يكتشف حواف مستند داخل مصدر مرئي (فيديو كاميرا حي، أو كانفاس/صورة ثابتة).
 * يعيد `null` إن لم يُعثر على مستند بثقة معقولة (بدل تخمين خاطئ).
 */
export function detectDocumentQuad(
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  workCanvas: HTMLCanvasElement
): DetectedQuad | null {
  if (!sourceWidth || !sourceHeight) return null;

  const scale = DETECTION_SAMPLE_WIDTH / sourceWidth;
  const w = DETECTION_SAMPLE_WIDTH;
  const h = Math.max(1, Math.round(sourceHeight * scale));

  workCanvas.width = w;
  workCanvas.height = h;
  const ctx = workCanvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;

  ctx.drawImage(source, 0, 0, w, h);

  let imageData;
  try {
    imageData = ctx.getImageData(0, 0, w, h);
  } catch {
    // قد يفشل هذا إن كان المصدر "ملوّثاً" (Tainted Canvas) لأسباب CORS نادرة
    return null;
  }

  const gray = toGrayscale(imageData.data, w * h);
  const threshold = otsuThreshold(gray);

  // الحالة الشائعة: ورقة فاتحة على خلفية أغمق (طاولة/يد/أرضية)
  const brightBlob = findLargestBrightBlob(gray, w, h, threshold);
  let chosen = brightBlob ? blobToQuad(brightBlob, w * h) : null;

  // احتياط: مستند/خلفية معكوسة (نادر لكن وارد) — نعكس التدرج الرمادي ونكرر
  if (!chosen) {
    const inverted = gray.map((v) => 255 - v);
    const darkBlob = findLargestBrightBlob(inverted, w, h, 255 - threshold);
    chosen = darkBlob ? blobToQuad(darkBlob, w * h) : null;
  }

  if (!chosen) return null;

  const invScale = 1 / scale;
  const scaled = chosen.points.map((p) => ({ x: p.x * invScale, y: p.y * invScale })) as Quad;

  return { points: scaled, coverage: chosen.coverage };
}

/** يقارن شبهي منحرف من إطارين متتاليين للتحقق من "ثبات" الاكتشاف (لأغراض الالتقاط التلقائي). */
export function quadsAreClose(a: Quad, b: Quad, toleranceOfMinSide: number): boolean {
  for (let i = 0; i < 4; i++) {
    const dx = a[i].x - b[i].x;
    const dy = a[i].y - b[i].y;
    if (Math.hypot(dx, dy) > toleranceOfMinSide) return false;
  }
  return true;
}
