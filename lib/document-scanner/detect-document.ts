/**
 * اكتشاف حواف مستند/ورقة داخل إطار كاميرا أو صورة ثابتة، بدون أي مكتبة رؤية
 * حاسوبية خارجية (لا OpenCV.js ولا أي حزمة إضافية) — فقط Canvas 2D عادي:
 *
 *   1) تصغير الإطار لكانفاس عمل صغير (أداء أسرع بكثير من معالجة الدقة الكاملة).
 *   2) تحويل إلى تدرج رمادي.
 *   3) **تنعيم أولي خفيف جداً** (تمويه شبيه بـ Gaussian بنصف قطر صغير جداً)
 *      لإزالة الضجيج الرقمي (Sensor Noise) من بث الكاميرا قبل أي تحليل.
 *   4) **تحسين تباين محلي**: تطبيع كل بكسل بالنسبة لإضاءة محيطه المباشر
 *      (تمويه صندوقي أكبر نطاقاً يُقدِّر الإضاءة المحلية، ثم القسمة عليه) —
 *      يجعل حواف الورقة البيضاء أوضح وأكثر تمايزاً عن الخلفية مهما كانت
 *      الإضاءة غير متساوية.
 *   5) عتبة Otsu تلقائية على الناتج المُطبَّع لفصل "الورقة" عن الخلفية.
 *   6) (اختياري لحظة الالتقاط فقط) إغلاق ثم فتح مورفولوجي (Close → Open)
 *      على القناع الثنائي: الإغلاق يسدّ الثغرات الصغيرة داخل الورقة، والفتح
 *      يُزيل بقع الضجيج الصغيرة المتناثرة في الخلفية — يرفع دقة الحواف
 *      بوضوح مقابل تكلفة حسابية إضافية بسيطة مقبولة (تُشغَّل مرّة واحدة فقط).
 *   7) البحث عن **كل** الكتل المتصلة الكبيرة بما فيه الكفاية (لا كتلة واحدة
 *      فقط)، ثم اختيار الأفضل بينها بناءً على معيارين معاً: الحجم، و"نسبة
 *      الامتلاء" (مدى قرب شكلها من مستطيل صلب مقابل بقعة ضجيج متناثرة) —
 *      هذا يمنع اختيار بقعة ضجيج كبيرة عرضاً بدل الورقة الفعلية.
 *   8) تقريب حواف الكتلة المختارة الأربع عبر أقصى/أدنى قيم (x+y) و(x-y) —
 *      حيلة كلاسيكية خفيفة الحساب لتقدير شبه منحرف محدِّب دون تتبّع Contour
 *      كامل.
 *
 * النتيجة: شبه منحرف من 4 نقاط (Quad) بإحداثيات المصدر الأصلي (وليس الكانفاس
 * المصغّر)، جاهز لتصحيح المنظور في geometry.ts.
 */

import type { Point, Quad } from './geometry';
import {
  DETECTION_SAMPLE_WIDTH,
  MAX_COVERAGE_RATIO,
  MAX_INTERIOR_TEXTURE,
  MIN_BLOB_FILL_RATIO,
  MIN_CANDIDATE_BLOB_RATIO,
  MIN_COVERAGE_RATIO,
} from './constants';

export type DetectedQuad = {
  points: Quad;
  /** نسبة مساحة المستند المكتشف من مساحة الإطار الكلية (0..1) — مفيدة للتشخيص/الواجهة. */
  coverage: number;
};

export type DetectDocumentOptions = {
  /** عرض كانفاس العمل المصغّر (كلما زاد، ارتفعت الدقة وزادت التكلفة الحسابية). */
  sampleWidth?: number;
  /**
   * تفعيل إغلاق ثم فتح مورفولوجي (Close → Open) لتنظيف القناع الثنائي.
   * يُنصح بتفعيلها فقط عند الالتقاط الفعلي (مرة واحدة) لا في حلقة الاكتشاف
   * الحي المتكررة (أداء أفضل، والتنظيف الإضافي أقل أهمية للمعاينة المؤقتة).
   */
  denoise?: boolean;
};

function clampByte(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

function toGrayscale(data: Uint8ClampedArray, pixelCount: number): Float32Array {
  const gray = new Float32Array(pixelCount);
  for (let i = 0, p = 0; p < pixelCount; i += 4, p++) {
    gray[p] = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
  }
  return gray;
}

function clampIndex(i: number, len: number): number {
  if (i < 0) return 0;
  if (i >= len) return len - 1;
  return i;
}

/** تمويه صندوقي أحادي البعد بنافذة منزلقة (تكلفة O(n) بغضّ النظر عن نصف القطر). */
function boxBlur1D(src: Float32Array, width: number, height: number, radius: number, horizontal: boolean): Float32Array {
  if (radius <= 0) return src;
  const out = new Float32Array(src.length);
  const windowSize = radius * 2 + 1;

  if (horizontal) {
    for (let y = 0; y < height; y++) {
      const row = y * width;
      let sum = 0;
      for (let x = -radius; x <= radius; x++) sum += src[row + clampIndex(x, width)];
      for (let x = 0; x < width; x++) {
        out[row + x] = sum / windowSize;
        sum += src[row + clampIndex(x + radius + 1, width)] - src[row + clampIndex(x - radius, width)];
      }
    }
  } else {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      for (let y = -radius; y <= radius; y++) sum += src[clampIndex(y, height) * width + x];
      for (let y = 0; y < height; y++) {
        out[y * width + x] = sum / windowSize;
        sum += src[clampIndex(y + radius + 1, height) * width + x] - src[clampIndex(y - radius, height) * width + x];
      }
    }
  }

  return out;
}

function boxBlur2D(src: Float32Array, width: number, height: number, radius: number): Float32Array {
  if (radius <= 0) return src;
  return boxBlur1D(boxBlur1D(src, width, height, radius, true), width, height, radius, false);
}

/** عتبة Otsu الكلاسيكية لفصل مستويين (خلفية/مقدّمة) تلقائياً من الهيستوغرام. */
function otsuThreshold(values: Float32Array): number {
  const hist = new Array<number>(256).fill(0);
  for (let i = 0; i < values.length; i++) hist[clampByte(values[i]) | 0]++;

  const total = values.length;
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

function buildMask(values: Float32Array, threshold: number): Uint8Array {
  const mask = new Uint8Array(values.length);
  for (let i = 0; i < values.length; i++) mask[i] = values[i] > threshold ? 1 : 0;
  return mask;
}

function invertMask(mask: Uint8Array): Uint8Array {
  const out = new Uint8Array(mask.length);
  for (let i = 0; i < mask.length; i++) out[i] = mask[i] ? 0 : 1;
  return out;
}

function dilate(mask: Uint8Array, width: number, height: number): Uint8Array {
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (mask[idx]) {
        out[idx] = 1;
        continue;
      }
      let hasNeighbor = false;
      for (let dy = -1; dy <= 1 && !hasNeighbor; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= width) continue;
          if (mask[ny * width + nx]) {
            hasNeighbor = true;
            break;
          }
        }
      }
      out[idx] = hasNeighbor ? 1 : 0;
    }
  }
  return out;
}

function erode(mask: Uint8Array, width: number, height: number): Uint8Array {
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (!mask[idx]) {
        out[idx] = 0;
        continue;
      }
      let allSet = true;
      for (let dy = -1; dy <= 1 && allSet; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) {
          allSet = false;
          break;
        }
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= width || !mask[ny * width + nx]) {
            allSet = false;
            break;
          }
        }
      }
      out[idx] = allSet ? 1 : 0;
    }
  }
  return out;
}

/** إغلاق مورفولوجي (Dilate ثم Erode): يسدّ الثغرات الصغيرة داخل منطقة الورقة. */
function closeMask(mask: Uint8Array, width: number, height: number): Uint8Array {
  return erode(dilate(mask, width, height), width, height);
}

/** فتح مورفولوجي (Erode ثم Dilate): يُزيل بقع الضجيج الصغيرة المتناثرة خارج الورقة. */
function openMask(mask: Uint8Array, width: number, height: number): Uint8Array {
  return dilate(erode(mask, width, height), width, height);
}

type BlobCorners = {
  count: number;
  minSum: Point;
  maxSum: Point;
  minDiff: Point;
  maxDiff: Point;
};

/**
 * يبحث عن **كل** الكتل المتصلة الكبيرة بما يكفي (لا كتلة واحدة فقط) داخل
 * قناع ثنائي عبر Flood Fill تكراري (مصفوفة Stack يدوية بدل استدعاء دوال
 * متداخلة لتفادي حدود عمق التكرار)، ويتتبّع أثناء الزحف 4 نقاط متطرفة
 * تقارب زوايا شبه منحرف محدِّب يحيط بكل كتلة (بدل تتبّع Contour كامل الأثقل
 * حسابياً). الكتل الأصغر من `minCountRatio` من مساحة الإطار تُتجاهَل باكراً.
 */
function findCandidateBlobs(mask: Uint8Array, width: number, height: number, minCountRatio: number): BlobCorners[] {
  const total = width * height;
  const visited = new Uint8Array(total);
  const stack = new Int32Array(total);
  const minCount = Math.max(4, Math.round(total * minCountRatio));
  const blobs: BlobCorners[] = [];

  for (let start = 0; start < total; start++) {
    if (visited[start] || !mask[start]) continue;

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

      if (x > 0 && !visited[idx - 1] && mask[idx - 1]) {
        visited[idx - 1] = 1;
        stack[sp++] = idx - 1;
      }
      if (x < width - 1 && !visited[idx + 1] && mask[idx + 1]) {
        visited[idx + 1] = 1;
        stack[sp++] = idx + 1;
      }
      if (y > 0 && !visited[idx - width] && mask[idx - width]) {
        visited[idx - width] = 1;
        stack[sp++] = idx - width;
      }
      if (y < height - 1 && !visited[idx + width] && mask[idx + width]) {
        visited[idx + width] = 1;
        stack[sp++] = idx + width;
      }
    }

    if (count >= minCount) {
      blobs.push({ count, minSum: minSumPt, maxSum: maxSumPt, minDiff: minDiffPt, maxDiff: maxDiffPt });
    }
  }

  return blobs;
}

function cornersToQuad(blob: BlobCorners): Quad {
  // minSum=أعلى-يسار (أصغر x+y) | maxDiff=أعلى-يمين (أكبر x-y) | maxSum=أسفل-يمين | minDiff=أسفل-يسار
  return [blob.minSum, blob.maxDiff, blob.maxSum, blob.minDiff];
}

/** مساحة شبه المنحرف عبر صيغة الحذاء (Shoelace Formula). */
function quadArea(quad: Quad): number {
  let area = 0;
  for (let i = 0; i < 4; i++) {
    const a = quad[i];
    const b = quad[(i + 1) % 4];
    area += a.x * b.y - b.x * a.y;
  }
  return Math.abs(area) / 2;
}

/** يحسب خارطة "قوة التدرّج" (Sobel Gradient Magnitude) لكل بكسل — تُستخدم لتمييز سطح ورقة مسطّح عن خلفية مليئة بالنقوش/الفواصل. */
function computeGradientMagnitude(gray: Float32Array, width: number, height: number): Float32Array {
  const mag = new Float32Array(gray.length);
  for (let y = 1; y < height - 1; y++) {
    const row = y * width;
    for (let x = 1; x < width - 1; x++) {
      const idx = row + x;
      const gx =
        -gray[idx - width - 1] +
        gray[idx - width + 1] -
        2 * gray[idx - 1] +
        2 * gray[idx + 1] -
        gray[idx + width - 1] +
        gray[idx + width + 1];
      const gy =
        -gray[idx - width - 1] -
        2 * gray[idx - width] -
        gray[idx - width + 1] +
        gray[idx + width - 1] +
        2 * gray[idx + width] +
        gray[idx + width + 1];
      mag[idx] = Math.sqrt(gx * gx + gy * gy);
    }
  }
  return mag;
}

/**
 * يُقدِّر متوسط "نسيج" منطقة داخل شبه منحرف عبر أخذ عينات من شبكة نقاط في
 * صندوقه المحيط (Bounding Box) بعد تصغيره للداخل بهامش (لتفادي حواف المستند
 * نفسها التي تحمل تدرّجاً حاداً طبيعياً وليست جزءاً من "نسيج" السطح الداخلي).
 */
function meanInteriorTexture(mag: Float32Array, width: number, height: number, quad: Quad): number {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of quad) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }

  const insetX = (maxX - minX) * 0.15;
  const insetY = (maxY - minY) * 0.15;
  const x0 = Math.max(1, Math.round(minX + insetX));
  const x1 = Math.min(width - 2, Math.round(maxX - insetX));
  const y0 = Math.max(1, Math.round(minY + insetY));
  const y1 = Math.min(height - 2, Math.round(maxY - insetY));
  if (x1 <= x0 || y1 <= y0) return 0;

  const steps = 12;
  let sum = 0;
  let count = 0;
  for (let iy = 0; iy < steps; iy++) {
    const y = Math.round(y0 + ((y1 - y0) * iy) / (steps - 1));
    for (let ix = 0; ix < steps; ix++) {
      const x = Math.round(x0 + ((x1 - x0) * ix) / (steps - 1));
      sum += mag[y * width + x];
      count++;
    }
  }
  return count > 0 ? sum / count : 0;
}

/**
 * يختار أفضل كتلة مرشَّحة لتمثيل "الورقة" من بين عدة كتل: يُفضِّل الكتل ذات
 * "نسبة امتلاء" عالية (قريبة الشكل من مستطيل صلب لا بقعة ضجيج متناثرة)، ثم
 * الأكبر حجماً بينها. إن لم تجتز أي كتلة معيار الامتلاء، يتراجع للأكبر حجماً
 * على إطلاقه (تدهور تدريجي بدل الفشل الكامل).
 */
function pickBestDocumentBlob(blobs: BlobCorners[], totalPixels: number): DetectedQuad | null {
  const candidates = blobs
    .map((blob) => {
      const quad = cornersToQuad(blob);
      const area = Math.max(1, quadArea(quad));
      return { blob, quad, coverage: blob.count / totalPixels, fillRatio: blob.count / area };
    })
    .filter((c) => c.coverage >= MIN_COVERAGE_RATIO && c.coverage <= MAX_COVERAGE_RATIO);

  if (candidates.length === 0) return null;

  const solid = candidates.filter((c) => c.fillRatio >= MIN_BLOB_FILL_RATIO);
  const pool = solid.length > 0 ? solid : candidates;
  pool.sort((a, b) => b.blob.count - a.blob.count);

  const best = pool[0];
  return { points: best.quad, coverage: best.coverage };
}

/**
 * يكتشف حواف مستند داخل مصدر مرئي (فيديو كاميرا حي، أو كانفاس/صورة ثابتة).
 * يعيد `null` إن لم يُعثر على مستند بثقة معقولة (بدل تخمين خاطئ).
 */
export function detectDocumentQuad(
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  workCanvas: HTMLCanvasElement,
  options?: DetectDocumentOptions
): DetectedQuad | null {
  if (!sourceWidth || !sourceHeight) return null;

  const sampleWidth = options?.sampleWidth ?? DETECTION_SAMPLE_WIDTH;
  const denoise = options?.denoise ?? false;

  const scale = sampleWidth / sourceWidth;
  const w = sampleWidth;
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

  const rawGray = toGrayscale(imageData.data, w * h);

  // 1) تنعيم أولي خفيف جداً (شبيه بـ Gaussian بنصف قطر 1) لإزالة ضجيج الكاميرا الرقمي
  const denoisedGray = boxBlur2D(rawGray, w, h, 1);

  // 2) تحسين تباين محلي: تطبيع كل بكسل بالنسبة لإضاءة محيطه المباشر (يُبرز حواف الورقة البيضاء عن الخلفية)
  const contrastRadius = Math.max(6, Math.round(Math.min(w, h) / 6));
  const localMean = boxBlur2D(denoisedGray, w, h, contrastRadius);
  const normalized = new Float32Array(w * h);
  for (let p = 0; p < normalized.length; p++) {
    const localBackground = localMean[p] > 1 ? localMean[p] : 1;
    normalized[p] = clampByte((denoisedGray[p] / localBackground) * 255);
  }

  const threshold = otsuThreshold(normalized);

  // خط دفاع أخير: عند دمج الورقة والخلفية في كتلة واحدة (خلفية فاتحة قريبة
  // من لون الورقة، كأرضية بلاط)، نرفض الكتلة إن كان "نسيج" منتصفها مرتفعاً
  // (فواصل/نقوش خلفية حقيقية) بدل قبولها كمستند نظيف خطأً.
  let gradMag: Float32Array | null = null;
  const passesTextureCheck = (quad: Quad): boolean => {
    if (!gradMag) gradMag = computeGradientMagnitude(normalized, w, h);
    return meanInteriorTexture(gradMag, w, h, quad) <= MAX_INTERIOR_TEXTURE;
  };

  // الحالة الشائعة: ورقة فاتحة على خلفية أغمق (طاولة/يد/أرضية)
  let brightMask = buildMask(normalized, threshold);
  if (denoise) brightMask = openMask(closeMask(brightMask, w, h), w, h);
  const brightBlobs = findCandidateBlobs(brightMask, w, h, MIN_CANDIDATE_BLOB_RATIO);
  let chosen = pickBestDocumentBlob(brightBlobs, w * h);
  if (chosen && !passesTextureCheck(chosen.points)) chosen = null;

  // احتياط: مستند/خلفية معكوسة (نادر لكن وارد)
  if (!chosen) {
    let darkMask = invertMask(brightMask);
    if (denoise) darkMask = openMask(closeMask(darkMask, w, h), w, h);
    const darkBlobs = findCandidateBlobs(darkMask, w, h, MIN_CANDIDATE_BLOB_RATIO);
    chosen = pickBestDocumentBlob(darkBlobs, w * h);
    if (chosen && !passesTextureCheck(chosen.points)) chosen = null;
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
