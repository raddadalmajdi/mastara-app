'use client';

import {
  ENHANCE_CONTRAST,
  ENHANCE_ILLUMINATION_RADIUS_DIV,
  ENHANCE_ILLUMINATION_RADIUS_MIN,
  ENHANCE_MAX_GAIN,
  ENHANCE_MIN_GAIN,
  ENHANCE_PAPER_WHITE_LUM,
  ENHANCE_SATURATION_BOOST,
  ENHANCE_SATURATION_MIN,
} from './constants';

/**
 * "Document Enhance / Magic Color" — مستند بخلفية بيضاء ناصعة وتباين عالٍ
 * مع **الحفاظ على الألوان الأصلية** (أختام، توقيعات، شعارات). لا تحويل
 * إلى رمادي: تُطبَّق تصحيح الإضاءة والتباين على الإضاءة (Luminance) فقط
 * ثم تُعاد نسبة RGB للحفاظ على Chroma.
 */

function clampIndex(i: number, len: number): number {
  if (i < 0) return 0;
  if (i >= len) return len - 1;
  return i;
}

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

/** يحسّن المستند مع الحفاظ على الألوان — يستبدل بيانات الكانفاس في مكانه. */
export function enhanceDocumentCanvas(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const { width, height } = canvas;
  if (!width || !height) return;

  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  const pixelCount = width * height;

  const lum = new Float32Array(pixelCount);
  for (let i = 0, p = 0; p < pixelCount; i += 4, p++) {
    lum[p] = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
  }

  const blurRadius = Math.max(
    ENHANCE_ILLUMINATION_RADIUS_MIN,
    Math.round(Math.min(width, height) / ENHANCE_ILLUMINATION_RADIUS_DIV)
  );
  const localLum = boxBlur2D(lum, width, height, blurRadius);

  for (let p = 0, i = 0; p < pixelCount; p++, i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    const bg = localLum[p] > 1 ? localLum[p] : 1;
    const normLum = clamp255((lum[p] / bg) * 255);

    let gain = 255 / bg;
    gain = Math.max(ENHANCE_MIN_GAIN, Math.min(ENHANCE_MAX_GAIN, gain));

    let r2 = r * gain;
    let g2 = g * gain;
    let b2 = b * gain;

    let l2 = r2 * 0.299 + g2 * 0.587 + b2 * 0.114;
    const lTarget = clamp255((normLum - 128) * ENHANCE_CONTRAST + 128);
    const lumRatio = l2 > 2 ? lTarget / l2 : 1;

    r2 = clamp255(r2 * lumRatio);
    g2 = clamp255(g2 * lumRatio);
    b2 = clamp255(b2 * lumRatio);
    l2 = r2 * 0.299 + g2 * 0.587 + b2 * 0.114;

    const maxC = Math.max(r2, g2, b2);
    const minC = Math.min(r2, g2, b2);
    const sat = maxC - minC;
    if (sat >= ENHANCE_SATURATION_MIN) {
      const boost = ENHANCE_SATURATION_BOOST;
      r2 = clamp255(l2 + (r2 - l2) * boost);
      g2 = clamp255(l2 + (g2 - l2) * boost);
      b2 = clamp255(l2 + (b2 - l2) * boost);
    }

    if (normLum >= ENHANCE_PAPER_WHITE_LUM - 25 && sat < ENHANCE_SATURATION_MIN) {
      const whiteMix = Math.min(1, (normLum - (ENHANCE_PAPER_WHITE_LUM - 25)) / 30);
      r2 = clamp255(r2 + (255 - r2) * whiteMix * 0.85);
      g2 = clamp255(g2 + (255 - g2) * whiteMix * 0.85);
      b2 = clamp255(b2 + (255 - b2) * whiteMix * 0.85);
    }

    data[i] = r2;
    data[i + 1] = g2;
    data[i + 2] = b2;
    data[i + 3] = 255;
  }

  ctx.putImageData(imageData, 0, 0);
}
