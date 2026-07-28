'use client';

import {
  CV_ADAPTIVE_BLOCK_SIZE_MAX,
  CV_ADAPTIVE_BLOCK_SIZE_MIN,
  CV_ADAPTIVE_BLOCK_SIZE_RATIO,
  CV_ADAPTIVE_THRESHOLD_C,
  SCAN_CONTRAST_STEEPNESS,
  SCAN_DESPECKLE_MAX_SIZE,
  SCAN_DESPECKLE_MIN_SIZE,
  SCAN_DESPECKLE_SIZE_RATIO,
  SCAN_INK_BIAS,
} from './constants';
import { getOpenCv, isOpenCvReady, type OpenCvNamespace } from './opencv-loader';

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

  // 3) عتبة Otsu تلقائية على الناتج المُطبَّع (تتكيّف مع كل مستند على حدة)، مع
  // إزاحتها نحو الأسفل (INK_BIAS): هذا يجعل تصنيف بكسل كـ"حبر أسود" أكثر
  // صرامة (يتطلب دكانة أوضح)، بينما يصبح تصنيفه كـ"ورقة بيضاء" أكثر تسامحاً
  // — فيقلّ "الضجيج الأسود" الناتج عن تسرّب خلفية أو تشويش كاميرا بدل تنظيف
  // الخلفية فعلياً إلى الأبيض النقي المطلوب.
  const threshold = otsuThreshold(normalized) - SCAN_INK_BIAS;

  // 4) منحنى تباين حاد (Sigmoid) حول العتبة المُعدَّلة: خلفية بيضاء نقية،
  // نص أسود داكن، مع إبقاء درجة تنعيم بسيطة عند الحواف بدل تسطيح صارم يبدو مسنَّناً.
  const scanGray = new Uint8ClampedArray(pixelCount);
  for (let p = 0; p < pixelCount; p++) {
    const x = (normalized[p] - threshold) * SCAN_CONTRAST_STEEPNESS;
    const sigmoid = 1 / (1 + Math.exp(-x));
    scanGray[p] = clamp255(Math.round(sigmoid * 255));
  }

  // 5) تنظيف نهائي: محو أي بقع سوداء صغيرة معزولة (ضجيج/بقايا خلفية) وتحويلها
  // لأبيض نقي، دون المساس بالنصوص الحقيقية (أكبر بكثير من حجم البقعة الواحدة).
  const minSpeckleSize = Math.min(
    SCAN_DESPECKLE_MAX_SIZE,
    Math.max(SCAN_DESPECKLE_MIN_SIZE, Math.round(pixelCount * SCAN_DESPECKLE_SIZE_RATIO))
  );
  despeckleDarkNoise(scanGray, width, height, minSpeckleSize);

  for (let p = 0, i = 0; p < pixelCount; p++, i += 4) {
    const value = scanGray[p];
    data[i] = value;
    data[i + 1] = value;
    data[i + 2] = value;
    data[i + 3] = 255;
  }

  ctx.putImageData(imageData, 0, 0);
}

function deleteAll(mats: Array<{ delete: () => void } | undefined | null>): void {
  for (const m of mats) {
    try {
      m?.delete();
    } catch {
      // تجاهل: قد يكون الكائن محذوفاً بالفعل في مسار خطأ جزئي.
    }
  }
}

function oddClamp(value: number, min: number, max: number): number {
  let v = Math.max(min, Math.min(max, Math.round(value)));
  if (v % 2 === 0) v += 1;
  return v;
}

/**
 * تحسين "ذكي" (Smart Binarization) عبر OpenCV.js: عتبة تكيّفية محلية حقيقية
 * (`adaptiveThreshold` بنمط `ADAPTIVE_THRESH_GAUSSIAN_C`) — تُحسَب عتبة
 * مختلفة تلقائياً لكل منطقة صغيرة من الصورة بناءً على متوسط جيرانها، فتحافظ
 * على حبر الكتابة أسود داكناً حتى في مناطق فيها تفاوت إضاءة متبقٍّ، بينما
 * تدفع الخلفية نحو أبيض نقي — هذا هو الأسلوب المعياري المستخدم فعلياً في
 * تطبيقات المسح الضوئي الاحترافية. يليها فتح مورفولوجي خفيف (`MORPH_OPEN`)
 * لمحو أي بقع "ملح وفلفل" معزولة دون المساس بضربات الحروف الحقيقية.
 *
 * يُرجع `true` عند النجاح (ونتيجته مكتوبة مباشرة في الكانفاس)، أو `false`
 * فوراً بلا أي تعديل إن لم يكن OpenCV.js جاهزاً بعد أو حدث خطأ — كي يتراجع
 * المستدعي بأمان تام إلى `enhanceDocumentCanvas` اليدوي أدناه.
 */
export function enhanceDocumentCanvasCv(canvas: HTMLCanvasElement): boolean {
  if (!isOpenCvReady()) return false;
  const cv: OpenCvNamespace = getOpenCv();
  if (!cv) return false;

  const { width, height } = canvas;
  if (!width || !height) return false;

  let src, gray, blurred, binary, kernel, cleaned;
  try {
    src = cv.imread(canvas);
    gray = new cv.Mat();
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

    blurred = new cv.Mat();
    cv.GaussianBlur(gray, blurred, new cv.Size(3, 3), 0);

    const blockSize = oddClamp(
      Math.min(width, height) * CV_ADAPTIVE_BLOCK_SIZE_RATIO,
      CV_ADAPTIVE_BLOCK_SIZE_MIN,
      CV_ADAPTIVE_BLOCK_SIZE_MAX
    );

    binary = new cv.Mat();
    cv.adaptiveThreshold(
      blurred,
      binary,
      255,
      cv.ADAPTIVE_THRESH_GAUSSIAN_C,
      cv.THRESH_BINARY,
      blockSize,
      CV_ADAPTIVE_THRESHOLD_C
    );

    kernel = cv.Mat.ones(2, 2, cv.CV_8U);
    cleaned = new cv.Mat();
    cv.morphologyEx(binary, cleaned, cv.MORPH_OPEN, kernel);

    cv.imshow(canvas, cleaned);
    return true;
  } catch (err) {
    console.error('[scanner] فشل التحسين الذكي عبر OpenCV.js', err);
    return false;
  } finally {
    deleteAll([src, gray, blurred, binary, kernel, cleaned]);
  }
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
