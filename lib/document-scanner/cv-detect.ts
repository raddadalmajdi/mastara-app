'use client';

/**
 * اكتشاف حواف مستند حقيقي عبر OpenCV.js (WebAssembly): بدل التصنيف حسب
 * السطوع فقط (كما في `detect-document.ts` اليدوي)، هذا المسار يعتمد على
 * خط أنابيب رؤية حاسوبية كلاسيكي ومُثبت عالمياً لاكتشاف المستندات:
 *
 *   1) تدرج رمادي + تمويه Gaussian خفيف (إزالة ضجيج قبل كشف الحواف).
 *   2) كشف حواف Canny — يحدّد **حدود/خطوط حقيقية** (تغيّر مفاجئ في التدرج)
 *      بدل الاعتماد على فرق السطوع الإجمالي فقط؛ هذا يجعله أكثر متانة أمام
 *      خلفيات قريبة الإضاءة من الورقة (كأرضية بلاط فاتحة) لأن حافة الورقة
 *      الفعلية غالباً ما تُنتج خطاً حاداً (ولو خفيفاً) حتى مع تشابه السطوع.
 *   3) تمديد (Dilate) خفيف لسدّ أي ثغرات صغيرة في خط الحافة المكتشف.
 *   4) استخراج كل المخططات (Contours) عبر `findContours`، ثم تقريب كل واحد
 *      لمضلّع مبسَّط عبر `approxPolyDP` (خوارزمية Douglas-Peucker القياسية).
 *   5) من بين كل المضلّعات ذات 4 أضلاع بالضبط والمحدَّبة (Convex) وبتغطية
 *      معقولة من الإطار، يُختار الأكبر مساحة — هذا هو "المستطيل الأربعة
 *      زوايا" الحقيقي للمستند، حتى لو كان مائلاً بزاوية واضحة.
 *
 * يعيد `null` فوراً (دون رمي استثناء) إن لم يكن OpenCV.js جاهزاً بعد، أو لم
 * يُعثر على مضلّع رباعي بثقة معقولة — كي يتراجع المستدعي بأمان تام لخط
 * الأنابيب اليدوي الاحتياطي في `detect-document.ts`.
 */

import type { Point, Quad } from './geometry';
import { orderCorners } from './geometry';
import {
  CV_APPROX_POLY_EPSILON_RATIO,
  CV_CANNY_LOWER_THRESHOLD,
  CV_CANNY_UPPER_THRESHOLD,
  CV_DETECTION_SAMPLE_WIDTH,
  MAX_COVERAGE_RATIO,
  MIN_COVERAGE_RATIO,
} from './constants';
import { getOpenCv, isOpenCvReady, type OpenCvNamespace } from './opencv-loader';

export type CvDetectedQuad = {
  points: Quad;
  /** نسبة مساحة المستند المكتشف من مساحة الإطار الكلية (0..1). */
  coverage: number;
};

export type CvDetectOptions = {
  /** عرض كانفاس العمل المصغّر (كلما زاد، ارتفعت الدقة وزادت التكلفة الحسابية). */
  sampleWidth?: number;
};

/** يُحرِّر كل كائنات `cv.Mat`/`cv.MatVector` الممرَّرة، متجاهلاً أي كائن غير معرَّف (لتبسيط الاستدعاء عبر `finally` واحد). */
function deleteAll(mats: Array<{ delete: () => void } | undefined | null>): void {
  for (const m of mats) {
    try {
      m?.delete();
    } catch {
      // تجاهل: قد يكون الكائن محذوفاً بالفعل في مسار خطأ جزئي.
    }
  }
}

export function detectDocumentQuadCv(
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  workCanvas: HTMLCanvasElement,
  options?: CvDetectOptions
): CvDetectedQuad | null {
  if (!sourceWidth || !sourceHeight || !isOpenCvReady()) return null;
  const cv: OpenCvNamespace = getOpenCv();
  if (!cv) return null;

  const sampleWidth = options?.sampleWidth ?? CV_DETECTION_SAMPLE_WIDTH;
  const scale = sampleWidth / sourceWidth;
  const w = sampleWidth;
  const h = Math.max(1, Math.round(sourceHeight * scale));

  workCanvas.width = w;
  workCanvas.height = h;
  const ctx = workCanvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(source, 0, 0, w, h);

  let src, gray, blurred, edges, kernel, dilated, contours, hierarchy;
  try {
    src = cv.imread(workCanvas);
    gray = new cv.Mat();
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

    blurred = new cv.Mat();
    cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);

    edges = new cv.Mat();
    cv.Canny(blurred, edges, CV_CANNY_LOWER_THRESHOLD, CV_CANNY_UPPER_THRESHOLD);

    kernel = cv.Mat.ones(3, 3, cv.CV_8U);
    dilated = new cv.Mat();
    cv.dilate(edges, dilated, kernel, new cv.Point(-1, -1), 1);

    contours = new cv.MatVector();
    hierarchy = new cv.Mat();
    cv.findContours(dilated, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);

    const frameArea = w * h;
    let bestPoints: Point[] | null = null;
    let bestArea = 0;
    let bestCoverage = 0;

    for (let i = 0; i < contours.size(); i++) {
      const contour = contours.get(i);
      const approx = new cv.Mat();
      try {
        const perimeter = cv.arcLength(contour, true);
        cv.approxPolyDP(contour, approx, CV_APPROX_POLY_EPSILON_RATIO * perimeter, true);

        if (approx.rows === 4 && cv.isContourConvex(approx)) {
          const area = Math.abs(cv.contourArea(approx));
          const coverage = area / frameArea;

          if (coverage >= MIN_COVERAGE_RATIO && coverage <= MAX_COVERAGE_RATIO && area > bestArea) {
            const data = approx.data32S as Int32Array;
            const pts: Point[] = [
              { x: data[0], y: data[1] },
              { x: data[2], y: data[3] },
              { x: data[4], y: data[5] },
              { x: data[6], y: data[7] },
            ];
            bestArea = area;
            bestCoverage = coverage;
            bestPoints = pts;
          }
        }
      } finally {
        approx.delete();
        contour.delete();
      }
    }

    if (!bestPoints) return null;

    const invScale = 1 / scale;
    const scaledPoints = bestPoints.map((p) => ({ x: p.x * invScale, y: p.y * invScale }));
    return { points: orderCorners(scaledPoints), coverage: bestCoverage };
  } catch (err) {
    console.error('[scanner] فشل اكتشاف الحواف عبر OpenCV.js', err);
    return null;
  } finally {
    deleteAll([src, gray, blurred, edges, kernel, dilated, contours, hierarchy]);
  }
}
