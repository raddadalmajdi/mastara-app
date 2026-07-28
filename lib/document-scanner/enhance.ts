'use client';

/**
 * "تأثير الماسح الضوئي الحقيقي" (Scan Effect): يحوّل صورة المستند الملتقطة
 * (بألوانها، ظلالها، وإضاءتها غير المتساوية/الصفراء) إلى مستند أبيض/أسود
 * عالي التباين يحاكي مخرجات ماسح ضوئي حقيقي أو تطبيقات مثل CamScanner/Adobe
 * Scan — كل ذلك بمعالجة Canvas 2D خالصة بدون أي مكتبة خارجية:
 *
 *   1) تحويل إلى تدرج رمادي — يُزيل تلقائياً أي بصمة لونية/إضاءة صفراء لأن
 *      الناتج النهائي رمادي بحت (R=G=B).
 *   2) تقدير "الإضاءة المحلية" عبر تمويه صندوقي كبير النطاق (Box Blur
 *      منفصل أفقياً/رأسياً بنافذة منزلقة — تكلفة O(n) ثابتة بغضّ النظر عن
 *      نصف القطر) ثم قسمة كل بكسل على إضاءته المحلية. هذا يُزيل الظلال
 *      والتفاوت في الإضاءة عبر الصفحة (ضوء جانبي، ظل يد ...) ويُوحّد
 *      الخلفية نحو الأبيض في كل مكان بدل نغمة رمادية/صفراء متفاوتة.
 *   3) عتبة Otsu تلقائية على الناتج المُطبَّع لتحديد نقطة الفصل المثلى بين
 *      "الحبر" و"الورقة" لهذه الصورة تحديداً (تتكيّف تلقائياً مع كل مستند).
 *   4) منحنى تباين حاد (Sigmoid) حول تلك العتبة يدفع الخلفية نحو أبيض نقي
 *      (255) والنص نحو أسود داكن تماماً (0)، مع الإبقاء على درجة رمادية
 *      خفيفة عند الحواف (Anti-aliasing بسيط) بدل تسطيح ثنائي القيمة صارم
 *      يبدو مسنَّناً كصورة فاكس قديمة.
 */

function clampIndex(i: number, len: number): number {
  if (i < 0) return 0;
  if (i >= len) return len - 1;
  return i;
}

/** تمويه صندوقي أحادي البعد بنافذة منزلقة (تكلفة O(n) بغضّ النظر عن نصف القطر). */
function boxBlur1D(src: Float32Array, width: number, height: number, radius: number, horizontal: boolean): Float32Array {
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
  return boxBlur1D(boxBlur1D(src, width, height, radius, true), width, height, radius, false);
}

function clamp255(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

/** عتبة Otsu الكلاسيكية، مطبَّقة على مصفوفة قيم رمادية عائمة (0..255). */
function otsuThreshold(values: Float32Array): number {
  const hist = new Array<number>(256).fill(0);
  for (let i = 0; i < values.length; i++) hist[clamp255(values[i]) | 0]++;

  const total = values.length;
  let sum = 0;
  for (let t = 0; t < 256; t++) sum += t * hist[t];

  let sumB = 0;
  let wB = 0;
  let maxVariance = 0;
  let threshold = 190;

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

/**
 * يحوّل كانفاس المستند إلى "مستند ممسوح ضوئياً" أبيض/أسود عالي التباين
 * حقيقي (خلفية بيضاء نقية + نص أسود داكن، بلا ظلال أو إضاءة صفراء) —
 * يستبدل بيانات الكانفاس في مكانه مباشرة.
 */
export function enhanceDocumentCanvas(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const { width, height } = canvas;
  if (!width || !height) return;

  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  const pixelCount = width * height;

  // 1) تدرج رمادي
  const gray = new Float32Array(pixelCount);
  for (let i = 0, p = 0; p < pixelCount; i += 4, p++) {
    gray[p] = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
  }

  // 2) تطبيع الإضاءة المحلية (يُزيل الظلال والتفاوت في الإضاءة/الإضاءة الصفراء عبر الصفحة)
  const blurRadius = Math.max(18, Math.round(Math.min(width, height) / 9));
  const localMean = boxBlur2D(gray, width, height, blurRadius);

  const normalized = new Float32Array(pixelCount);
  for (let p = 0; p < pixelCount; p++) {
    const localBackground = localMean[p] > 1 ? localMean[p] : 1;
    normalized[p] = clamp255((gray[p] / localBackground) * 255);
  }

  // 3) عتبة Otsu تلقائية على الناتج المُطبَّع (تتكيّف مع كل مستند على حدة)
  const threshold = otsuThreshold(normalized);

  // 4) منحنى تباين حاد (Sigmoid) حول العتبة: خلفية بيضاء نقية، نص أسود داكن
  const steepness = 0.3;
  for (let p = 0, i = 0; p < pixelCount; p++, i += 4) {
    const x = (normalized[p] - threshold) * steepness;
    const sigmoid = 1 / (1 + Math.exp(-x));
    const value = clamp255(Math.round(sigmoid * 255));
    data[i] = value;
    data[i + 1] = value;
    data[i + 2] = value;
    data[i + 3] = 255;
  }

  ctx.putImageData(imageData, 0, 0);
}
