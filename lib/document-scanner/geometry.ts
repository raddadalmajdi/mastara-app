/**
 * أدوات هندسية عامة (مصفوفات 3×3 وتحويل منظور/Homography) تُستخدم لتصحيح
 * منظور المستند الممسوح (Perspective Correction) بدون أي مكتبة رؤية حاسوبية
 * خارجية — حسابات مصفوفية بسيطة بلغة TypeScript خالصة.
 */

export type Point = { x: number; y: number };

/** زوايا مستطيل/شبه منحرف مرتّبة دائماً: [أعلى-يسار، أعلى-يمين، أسفل-يمين، أسفل-يسار] */
export type Quad = [Point, Point, Point, Point];

/** مصفوفة 3×3 محفوظة كمصفوفة مسطّحة بترتيب الصفوف (طولها 9). */
export type Mat3 = number[];

export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * يرتّب أي 4 نقاط (بأي ترتيب) إلى [أعلى-يسار، أعلى-يمين، أسفل-يمين، أسفل-يسار]
 * باستخدام خاصية أن (x+y) أصغر ما يكون عند الزاوية العلوية اليسرى وأكبر ما
 * يكون عند السفلية اليمنى، بينما (x-y) أكبر ما يكون أعلى اليمين وأصغر ما
 * يكون أسفل اليسار.
 */
export function orderCorners(points: Point[]): Quad {
  const bySum = [...points].sort((a, b) => a.x + a.y - (b.x + b.y));
  const tl = bySum[0];
  const br = bySum[bySum.length - 1];

  const byDiff = [...points].sort((a, b) => a.x - a.y - (b.x - b.y));
  const bl = byDiff[0];
  const tr = byDiff[byDiff.length - 1];

  return [tl, tr, br, bl];
}

/** يحسب أبعاد المستطيل الناتج (بالبكسل) من شبه منحرف الحواف المكتشف. */
export function computeOutputSize(quad: Quad): { width: number; height: number } {
  const [tl, tr, br, bl] = quad;
  const widthTop = distance(tl, tr);
  const widthBottom = distance(bl, br);
  const heightLeft = distance(tl, bl);
  const heightRight = distance(tr, br);

  return {
    width: Math.max(1, Math.round(Math.max(widthTop, widthBottom))),
    height: Math.max(1, Math.round(Math.max(heightLeft, heightRight))),
  };
}

/** حل نظام معادلات خطية Ax=b بطريقة الحذف الغاوسي (Gaussian Elimination) مع محور جزئي. */
function solveLinearSystem(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);

  for (let col = 0; col < n; col++) {
    let pivotRow = col;
    let maxAbs = Math.abs(M[col][col]);
    for (let r = col + 1; r < n; r++) {
      const abs = Math.abs(M[r][col]);
      if (abs > maxAbs) {
        maxAbs = abs;
        pivotRow = r;
      }
    }
    if (pivotRow !== col) {
      const tmp = M[col];
      M[col] = M[pivotRow];
      M[pivotRow] = tmp;
    }

    const pivot = M[col][col] || 1e-10;
    for (let c = col; c <= n; c++) M[col][c] /= pivot;

    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const factor = M[r][col];
      if (!factor) continue;
      for (let c = col; c <= n; c++) M[r][c] -= factor * M[col][c];
    }
  }

  return M.map((row) => row[n]);
}

/**
 * يحسب مصفوفة تحويل المنظور (Homography) التي تُسقط 4 نقاط مصدر إلى 4 نقاط
 * هدف مطابقة (Direct Linear Transform لأربع نقاط بالضبط، h33 مُثبَّتة = 1).
 */
export function computeHomography(src: Quad, dst: Quad): Mat3 {
  const A: number[][] = [];
  const b: number[] = [];

  for (let i = 0; i < 4; i++) {
    const { x, y } = src[i];
    const { x: X, y: Y } = dst[i];
    A.push([x, y, 1, 0, 0, 0, -x * X, -y * X]);
    b.push(X);
    A.push([0, 0, 0, x, y, 1, -x * Y, -y * Y]);
    b.push(Y);
  }

  const h = solveLinearSystem(A, b);
  return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
}

/** معكوس مصفوفة 3×3 (طريقة الملحق الجبري/Adjugate). */
export function invertMat3(m: Mat3): Mat3 {
  const [a, b, c, d, e, f, g, h, i] = m;

  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const D = -(b * i - c * h);
  const E = a * i - c * g;
  const F = -(a * h - b * g);
  const G = b * f - c * e;
  const H = -(a * f - c * d);
  const I = a * e - b * d;

  const det = a * A + b * B + c * C;
  const invDet = 1 / (det || 1e-10);

  return [A * invDet, D * invDet, G * invDet, B * invDet, E * invDet, H * invDet, C * invDet, F * invDet, I * invDet];
}

/** يطبّق مصفوفة 3×3 (إحداثيات متجانسة) على نقطة 2D مع قسمة المنظور. */
export function applyMat3(m: Mat3, p: Point): Point {
  const [a, b, c, d, e, f, g, h, i] = m;
  const w = g * p.x + h * p.y + i;
  const safeW = w === 0 ? 1e-10 : w;
  return { x: (a * p.x + b * p.y + c) / safeW, y: (d * p.x + e * p.y + f) / safeW };
}

/**
 * يصحّح منظور شبه منحرف الحواف المكتشف داخل كانفاس المصدر إلى مستطيل مسطّح
 * نظيف بالأبعاد المطلوبة (Perspective Correction / Auto-Cropping)، عبر
 * تعيين معكوس (Homography) وأخذ عيّنة ثنائية الخطية (Bilinear) من المصدر
 * لكل بكسل هدف.
 */
export function warpPerspective(source: HTMLCanvasElement, srcQuad: Quad, outWidth: number, outHeight: number): HTMLCanvasElement {
  const dstQuad: Quad = [
    { x: 0, y: 0 },
    { x: outWidth, y: 0 },
    { x: outWidth, y: outHeight },
    { x: 0, y: outHeight },
  ];

  const forward = computeHomography(srcQuad, dstQuad);
  const inverse = invertMat3(forward);

  const srcCtx = source.getContext('2d', { willReadFrequently: true });
  const out = document.createElement('canvas');
  out.width = outWidth;
  out.height = outHeight;
  const outCtx = out.getContext('2d');

  if (!srcCtx || !outCtx) return out;

  const sw = source.width;
  const sh = source.height;
  const srcData = srcCtx.getImageData(0, 0, sw, sh);
  const sPix = srcData.data;

  const outData = outCtx.createImageData(outWidth, outHeight);
  const oPix = outData.data;

  for (let y = 0; y < outHeight; y++) {
    for (let x = 0; x < outWidth; x++) {
      const sp = applyMat3(inverse, { x: x + 0.5, y: y + 0.5 });
      const oi = (y * outWidth + x) * 4;

      if (sp.x < 0 || sp.y < 0 || sp.x >= sw - 1 || sp.y >= sh - 1) {
        // خارج حدود المصدر: نملأ بالأبيض بدلاً من الأسود لمظهر "ورقة" نظيف
        oPix[oi] = 255;
        oPix[oi + 1] = 255;
        oPix[oi + 2] = 255;
        oPix[oi + 3] = 255;
        continue;
      }

      const x0 = Math.floor(sp.x);
      const y0 = Math.floor(sp.y);
      const x1 = x0 + 1;
      const y1 = y0 + 1;
      const fx = sp.x - x0;
      const fy = sp.y - y0;

      for (let c = 0; c < 4; c++) {
        const p00 = sPix[(y0 * sw + x0) * 4 + c];
        const p10 = sPix[(y0 * sw + x1) * 4 + c];
        const p01 = sPix[(y1 * sw + x0) * 4 + c];
        const p11 = sPix[(y1 * sw + x1) * 4 + c];
        const top = p00 + (p10 - p00) * fx;
        const bottom = p01 + (p11 - p01) * fx;
        oPix[oi + c] = top + (bottom - top) * fy;
      }
    }
  }

  outCtx.putImageData(outData, 0, 0);
  return out;
}
