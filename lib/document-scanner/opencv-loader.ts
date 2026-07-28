'use client';

/**
 * محمّل كسول (Lazy Loader) لمحرّك رؤية حاسوبية حقيقي — OpenCV.js (WebAssembly).
 *
 * لماذا حَقن وسم `<script>` كلاسيكي بدل استيراد حزمة npm عبر الحزمة
 * (Bundler)؟ ملف opencv.js ضخم جداً (~10 ميجابايت JS+WASM) ومكتوب بصيغة UMD
 * تفترض بيئة متصفح تقليدية (فروع `require('fs')`/`require('crypto')` تُستخدم
 * فقط في بيئة Node ولا تُستدعى إطلاقاً في المتصفح، لكنها قد تُربك محلِّلات
 * الحزم الحديثة). حَقن الملف كوسم Script من `public/opencv/opencv.js`
 * (مُستضاف ذاتياً، لا CDN خارجي، لضمان الموثوقية في الإنتاج) يتجاوز هذه
 * المشاكل كلياً، ويسمح بتحميله **فقط عند فتح الماسح الضوئي فعلياً** — لا
 * ضمن حزمة JavaScript الأساسية للتطبيق — فلا يؤثر إطلاقاً على سرعة تحميل
 * بقية الصفحات.
 *
 * كل استخدام فعلي لواجهة OpenCV.js داخل المشروع مُغلَّف في دوال موثَّقة
 * (`cv-detect.ts`, `cv-warp.ts`, ودوال `*Cv` في `enhance.ts`)، وكل واحدة منها
 * تتحقق أولاً من `isOpenCvReady()` وتتراجع بأمان لتطبيقنا اليدوي الأصلي
 * (Canvas 2D خالص) عند عدم التوفر — فلا يتعطل الماسح الضوئي أبداً حتى لو
 * تعذّر تحميل OpenCV.js لأي سبب (شبكة بطيئة جداً، متصفح قديم...).
 */

// واجهة عوّامة عمداً: سطح واجهة OpenCV.js الكامل ضخم جداً وغير مستقر تماماً
// بين الإصدارات ليُكتب له تعريف TypeScript شامل هنا؛ الاستخدام الفعلي داخل
// هذا المشروع مُغلَّف بدوال موثَّقة بأنواع دقيقة عند الحدود الخارجية لكودنا.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type OpenCvNamespace = any;

declare global {
  interface Window {
    cv?: OpenCvNamespace;
  }
}

const OPENCV_SCRIPT_SRC = '/opencv/opencv.js';
const LOAD_TIMEOUT_MS = 15000;

let loadPromise: Promise<OpenCvNamespace | null> | null = null;

function isRuntimeReady(cv: OpenCvNamespace | undefined): boolean {
  return Boolean(cv && typeof cv.Mat === 'function');
}

/**
 * يبدأ (أو يعيد استخدام) تحميل وتهيئة OpenCV.js، ويُرجع كائن `cv` الجاهز
 * للاستخدام فوراً، أو `null` عند الفشل/انتهاء المهلة — بدل رمي استثناء
 * يوقف تدفّق الماسح الضوئي بأكمله. يُنصح باستدعائها فوراً عند فتح الماسح
 * (fire-and-forget) كي يكون المحرّك جاهزاً غالباً بحلول لحظة الالتقاط الفعلي.
 */
export function ensureOpenCvLoaded(): Promise<OpenCvNamespace | null> {
  if (typeof window === 'undefined') return Promise.resolve(null);
  if (isRuntimeReady(window.cv)) return Promise.resolve(window.cv);

  if (!loadPromise) {
    loadPromise = new Promise<OpenCvNamespace | null>((resolve) => {
      let settled = false;
      const timeoutId = window.setTimeout(() => {
        if (settled) return;
        settled = true;
        console.warn('[scanner] انتهت مهلة تحميل OpenCV.js — سيُستخدم الاكتشاف والتحسين الاحتياطي (Canvas 2D).');
        // إعادة تعيين الـ Promise المخزَّن كي تُتاح محاولة جديدة كاملة في
        // المرة القادمة (مثلاً عند إعادة فتح الماسح) بدل تعطيل OpenCV.js
        // نهائياً لبقية الجلسة بسبب بطء شبكة مؤقت.
        loadPromise = null;
        resolve(null);
      }, LOAD_TIMEOUT_MS);

      const finish = (cv: OpenCvNamespace | null) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeoutId);
        resolve(cv);
      };

      const onRuntimeReady = () => finish(isRuntimeReady(window.cv) ? window.cv : null);

      const script = document.createElement('script');
      script.src = OPENCV_SCRIPT_SRC;
      script.async = true;
      script.onerror = () => {
        console.error('[scanner] تعذّر تحميل ملف OpenCV.js من', OPENCV_SCRIPT_SRC);
        finish(null);
      };
      script.onload = () => {
        // بعد تنفيذ كود opencv.js، يصبح `window.cv` موجوداً ككائن "Module"
        // فوراً لكن قبل اكتمال تجميع/تهيئة WASM فعلياً؛ الجاهزية الحقيقية
        // تُعلَن عبر استدعاء `onRuntimeInitialized` — النمط الرسمي الموثَّق
        // من مشروع OpenCV.js نفسه.
        if (isRuntimeReady(window.cv)) {
          finish(window.cv);
        } else if (window.cv) {
          window.cv.onRuntimeInitialized = onRuntimeReady;
        } else {
          finish(null);
        }
      };

      document.head.appendChild(script);
    });
  }

  return loadPromise;
}

/** فحص متزامن فوري: هل OpenCV.js جاهز للاستخدام الآن (بلا انتظار أو بدء تحميل)؟ */
export function isOpenCvReady(): boolean {
  return typeof window !== 'undefined' && isRuntimeReady(window.cv);
}

/** يُرجع كائن `cv` إن كان جاهزاً بالفعل، وإلا `null` (لا يبدأ أي تحميل — استخدم `ensureOpenCvLoaded` لذلك). */
export function getOpenCv(): OpenCvNamespace | null {
  return isOpenCvReady() ? window.cv : null;
}
