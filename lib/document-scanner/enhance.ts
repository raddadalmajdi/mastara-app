'use client';

import {
  FINAL_SHARPEN_AMOUNT,
  PRE_THRESHOLD_SHARPEN_AMOUNT,
  PRE_THRESHOLD_SHARPEN_RADIUS,
  SAUVOLA_K,
  SAUVOLA_R,
  SAUVOLA_WINDOW_RADIUS_MAX,
  SAUVOLA_WINDOW_RADIUS_MIN,
  SAUVOLA_WINDOW_RADIUS_RATIO,
  SCAN_CONTRAST_STEEPNESS,
  SCAN_DESPECKLE_MAX_SIZE,
  SCAN_DESPECKLE_MIN_SIZE,
  SCAN_DESPECKLE_SIZE_RATIO,
} from './constants';

/**
 * "تأثير الماسح الضوئي الحقيقي" (Scan Effect): يحوّل صورة المستند الملتقطة
 * (بألوانها، ظلالها، وإضاءتها غير المتساوية/الصفراء) إلى مستند أبيض/أسود
 * عالي التباين يحاكي مخرجات ماسح ضوئي احترافي أو تطبيقات مثل CamScanner/Adobe
 * Scan — كل ذلك بمعالجة Canvas 2D خالصة بدون أي مكتبة خارجية:
 *
 *   1) تحويل إلى تدرج رمادي — يُزيل تلقائياً أي بصمة لونية/إضاءة صفراء لأن
 *      الناتج النهائي رمادي بحت (R=G=B).
 *   2) تقدير "الإضاءة المحلية" عبر تمويه صندوقي كبير النطاق (Box Blur منفصل
 *      أفقياً/رأسياً بنافذة منزلقة — تكلفة O(n) ثابتة بغضّ النظر عن نصف
 *      القطر) ثم قسمة كل بكسل على إضاءته المحلية. هذا يُزيل الظلال والتفاوت
 *      في الإضاءة عبر الصفحة (ضوء جانبي، ظل يد...) ويُوحّد الخلفية نحو
 *      الأبيض في كل مكان بدل نغمة رمادية/صفراء متفاوتة.
 *   3) **شحذ خفيف قبل العتبة** (Unsharp Mask بنصف قطر صغير جداً): يرفع
 *      تباين ضربات الحروف الباهتة/الرفيعة فعلياً قبل اتخاذ قرار "حبر أم
 *      ورقة"، فتتجاوز عتبة التصنيف بثقة أكبر بدل أن تتآكل أو تختفي أجزاء
 *      منها في الخطوة التالية.
 *   4) **عتبة Sauvola تكيّفية محلية** (لا Otsu عامة واحدة): تُحسَب عتبة
 *      مختلفة لكل بكسل بناءً على متوسط والانحراف المعياري لمحيطه المباشر
 *      فقط — تحافظ على استمرارية الحروف حتى في مناطق فيها تفاوت إضاءة
 *      طفيف متبقٍّ، بينما تُبقي الخلفية المسطّحة (تباين محلي منخفض) بيضاء
 *      نقية تلقائياً دون الحاجة لإزاحة عتبة قسرية واحدة تُضعف كل الحروف
 *      الباهتة معاً.
 *   5) منحنى تباين حاد (Sigmoid) حول تلك العتبة المحلية يدفع الخلفية نحو
 *      أبيض نقي (255) والنص نحو أسود داكن تماماً (0)، مع الإبقاء على درجة
 *      رمادية خفيفة عند الحواف (Anti-aliasing بسيط) بدل تسطيح ثنائي القيمة
 *      صارم يبدو مسنَّناً كصورة فاكس قديمة.
 *   6) تنظيف نهائي (Despeckle): محو أي بقع سوداء صغيرة معزولة (ضجيج) لأبيض
 *      نقي دون المساس بالحروف الحقيقية.
 *   7) **شحذ نهائي بنواة كلاسيكية 3×3** (Sharpening Kernel) على الناتج بعد
 *      التنظيف: يزيد حِدّة حواف الحروف والخطوط لتبدو الصفحة كأنها مطبوعة
 *      فعلياً أو ممسوحة بماسح ضوئي احترافي، بدل حواف ناعمة مموّهة قليلاً.
 */

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

function clamp255(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

/**
 * شحذ (Unsharp Mask) عائم على مصفوفة Float32: يقارن كل بكسل بنسخة مموَّهة
 * بنصف قطر صغير جداً منه، ويُضخّم الفرق (التفاصيل الدقيقة/الحواف) بمقدار
 * `amount`. يُستخدم هنا لرفع تباين ضربات الحروف قبل اتخاذ قرار العتبة.
 */
function applyUnsharpMask(values: Float32Array, width: number, height: number, radius: number, amount: number): Float32Array {
  if (amount <= 0) return values;
  const blurred = boxBlur2D(values, width, height, radius);
  const out = new Float32Array(values.length);
  for (let p = 0; p < values.length; p++) {
    out[p] = clamp255(values[p] + (values[p] - blurred[p]) * amount);
  }
  return out;
}

/**
 * نواة شحذ (Sharpening Kernel) كلاسيكية 3×3 (لابلاسيان 4-جيران) تُطبَّق على
 * صورة رمادية 8-bit نهائية، بمزج قابل للتحكّم بين الأصل والنسخة المشحوذة
 * بالكامل لتفادي التشويش (Ringing) المفرط عند amount مرتفعة جداً.
 */
function applySharpenKernel(gray: Uint8ClampedArray, width: number, height: number, amount: number): Uint8ClampedArray {
  if (amount <= 0) return gray;
  const out = new Uint8ClampedArray(gray.length);
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      const idx = row + x;
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) {
        out[idx] = gray[idx];
        continue;
      }
      const center = gray[idx];
      const neighborSum = gray[idx - 1] + gray[idx + 1] + gray[idx - width] + gray[idx + width];
      // نواة [[0,-1,0],[-1,5,-1],[0,-1,0]] مطبَّقة مباشرة: center*5 - neighborSum.
      const sharpened = center * 5 - neighborSum;
      out[idx] = clamp255(center + (sharpened - center) * amount);
    }
  }
  return out;
}

/**
 * يُزيل بقع "الضجيج الأسود" الصغيرة المتناثرة (بكسلات داكنة معزولة نتجت عن
 * تشويش الكاميرا أو بقايا خلفية تسرّبت من قصّ غير مثالي للحواف) عبر تحويلها
 * إلى أبيض نقي، دون المساس بالنص الحقيقي (الذي يُشكِّل كتلاً متصلة أكبر
 * بكثير من حجم البقعة الواحدة). يعمل عبر Flood Fill بسيط على البكسلات
 * الداكنة (قيمة < 128): أي كتلة متصلة أصغر من `minComponentSize` تُعتبر
 * ضجيجاً فتُمحى.
 */
function despeckleDarkNoise(gray: Uint8ClampedArray, width: number, height: number, minComponentSize: number): void {
  const total = width * height;
  const isDark = new Uint8Array(total);
  for (let i = 0; i < total; i++) isDark[i] = gray[i] < 128 ? 1 : 0;

  const visited = new Uint8Array(total);
  const stack = new Int32Array(total);

  for (let start = 0; start < total; start++) {
    if (visited[start] || !isDark[start]) continue;

    let sp = 0;
    stack[sp++] = start;
    visited[start] = 1;
    const members: number[] = [start];

    while (sp > 0) {
      const idx = stack[--sp];
      const x = idx % width;
      const y = (idx / width) | 0;

      if (x > 0 && !visited[idx - 1] && isDark[idx - 1]) {
        visited[idx - 1] = 1;
        stack[sp++] = idx - 1;
        members.push(idx - 1);
      }
      if (x < width - 1 && !visited[idx + 1] && isDark[idx + 1]) {
        visited[idx + 1] = 1;
        stack[sp++] = idx + 1;
        members.push(idx + 1);
      }
      if (y > 0 && !visited[idx - width] && isDark[idx - width]) {
        visited[idx - width] = 1;
        stack[sp++] = idx - width;
        members.push(idx - width);
      }
      if (y < height - 1 && !visited[idx + width] && isDark[idx + width]) {
        visited[idx + width] = 1;
        stack[sp++] = idx + width;
        members.push(idx + width);
      }
    }

    if (members.length < minComponentSize) {
      for (const idx of members) gray[idx] = 255;
    }
  }
}

/**
 * يحسب عتبة Sauvola التكيّفية المحلية لكل بكسل: عتبة مبنية على متوسط
 * والانحراف المعياري المحليَّين (عبر تمويه صندوقي للقيم ولمربعاتها — حيلة
 * الفَرْق (Variance = E[X²] − E[X]²) القياسية لتفادي حساب انحراف حقيقي
 * لكل نافذة على حدة، فتبقى التكلفة O(n)).
 */
function computeSauvolaThresholdMap(values: Float32Array, width: number, height: number, radius: number): Float32Array {
  const localMean = boxBlur2D(values, width, height, radius);

  const squared = new Float32Array(values.length);
  for (let p = 0; p < values.length; p++) squared[p] = values[p] * values[p];
  const localMeanSq = boxBlur2D(squared, width, height, radius);

  const thresholdMap = new Float32Array(values.length);
  for (let p = 0; p < values.length; p++) {
    const mean = localMean[p];
    const variance = Math.max(0, localMeanSq[p] - mean * mean);
    const stdDev = Math.sqrt(variance);
    thresholdMap[p] = mean * (1 + SAUVOLA_K * (stdDev / SAUVOLA_R - 1));
  }
  return thresholdMap;
}

/**
 * يحوّل كانفاس المستند إلى "مستند ممسوح ضوئياً" أبيض/أسود عالي التباين
 * حقيقي (خلفية بيضاء نقية + نص أسود داكن وحادّ الحواف، بلا ظلال أو إضاءة
 * صفراء) — يستبدل بيانات الكانفاس في مكانه مباشرة.
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
  const illuminationRadius = Math.max(18, Math.round(Math.min(width, height) / 9));
  const localMean = boxBlur2D(gray, width, height, illuminationRadius);

  const normalized = new Float32Array(pixelCount);
  for (let p = 0; p < pixelCount; p++) {
    const localBackground = localMean[p] > 1 ? localMean[p] : 1;
    normalized[p] = clamp255((gray[p] / localBackground) * 255);
  }

  // 3) شحذ خفيف قبل العتبة: يرفع تباين ضربات الحروف الباهتة/الرفيعة فعلياً
  // قبل اتخاذ قرار "حبر أم ورقة"، فتتجاوز العتبة بثقة أكبر بدل أن تتآكل.
  const sharpenedForThreshold = applyUnsharpMask(
    normalized,
    width,
    height,
    PRE_THRESHOLD_SHARPEN_RADIUS,
    PRE_THRESHOLD_SHARPEN_AMOUNT
  );

  // 4) عتبة Sauvola تكيّفية محلية (بدل Otsu عامة واحدة + إزاحة قسرية): تحافظ
  // على استمرارية الحروف الباهتة محلياً بينما تُبقي الخلفية المسطّحة بيضاء.
  const sauvolaRadius = Math.min(
    SAUVOLA_WINDOW_RADIUS_MAX,
    Math.max(SAUVOLA_WINDOW_RADIUS_MIN, Math.round(Math.min(width, height) * SAUVOLA_WINDOW_RADIUS_RATIO))
  );
  const thresholdMap = computeSauvolaThresholdMap(sharpenedForThreshold, width, height, sauvolaRadius);

  // 5) منحنى تباين حاد (Sigmoid) حول العتبة المحلية لكل بكسل: خلفية بيضاء
  // نقية، نص أسود داكن، مع إبقاء درجة تنعيم بسيطة عند الحواف بدل تسطيح صارم.
  let scanGray = new Uint8ClampedArray(pixelCount);
  for (let p = 0; p < pixelCount; p++) {
    const x = (sharpenedForThreshold[p] - thresholdMap[p]) * SCAN_CONTRAST_STEEPNESS;
    const sigmoid = 1 / (1 + Math.exp(-x));
    scanGray[p] = clamp255(Math.round(sigmoid * 255));
  }

  // 6) تنظيف نهائي: محو أي بقع سوداء صغيرة معزولة (ضجيج/بقايا خلفية) وتحويلها
  // لأبيض نقي، دون المساس بالنصوص الحقيقية (أكبر بكثير من حجم البقعة الواحدة).
  const minSpeckleSize = Math.min(
    SCAN_DESPECKLE_MAX_SIZE,
    Math.max(SCAN_DESPECKLE_MIN_SIZE, Math.round(pixelCount * SCAN_DESPECKLE_SIZE_RATIO))
  );
  despeckleDarkNoise(scanGray, width, height, minSpeckleSize);

  // 7) شحذ نهائي بنواة كلاسيكية 3×3: حواف حروف أحدّ وأوضح، أقرب لصفحة مطبوعة/ممسوحة احترافياً.
  scanGray = new Uint8ClampedArray(applySharpenKernel(scanGray, width, height, FINAL_SHARPEN_AMOUNT));

  for (let p = 0, i = 0; p < pixelCount; p++, i += 4) {
    const value = scanGray[p];
    data[i] = value;
    data[i + 1] = value;
    data[i + 2] = value;
    data[i + 3] = 255;
  }

  ctx.putImageData(imageData, 0, 0);
}

/**
 * تحسين "لطيف" فقط (تباين/سطوع بسيطان مع الحفاظ على الألوان) — بلا أي
 * تحويل ثنائي (أبيض/أسود) قاسٍ. يُستخدم حصراً حين لا نثق بأن القصّ يحتوي
 * على ورقة فعلية فقط (مثلاً تعذّر اكتشاف الحواف فتراجعنا لإطار مركزي
 * احترازي قد لا يزال يحوي خلفية حقيقية كأرضية/طاولة). تطبيق التحويل الثنائي
 * الحاد على خلفية طبيعية غير مستوية اللون دائماً يُنتج "ضجيجاً" كثيفاً يشبه
 * التشويش (كما في الصور الملتقطة فوق أرضية بلاط فاتحة) لأن هذا التحويل
 * مصمَّم أصلاً لصفحة بيضاء مسطّحة، لا لمشهد واقعي كامل — لذا نتفادى تطبيقه
 * كلياً في حالة عدم اليقين، ونكتفي بتحسين بسيط وآمن للوضوح.
 */
export function softEnhanceCanvas(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const { width, height } = canvas;
  if (!width || !height) return;

  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;

  const contrast = 1.12;
  const brightness = 6;
  const midpoint = 128;

  for (let i = 0; i < data.length; i += 4) {
    data[i] = clamp255((data[i] - midpoint) * contrast + midpoint + brightness);
    data[i + 1] = clamp255((data[i + 1] - midpoint) * contrast + midpoint + brightness);
    data[i + 2] = clamp255((data[i + 2] - midpoint) * contrast + midpoint + brightness);
  }

  ctx.putImageData(imageData, 0, 0);
}
