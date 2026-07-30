'use client';

import { enhanceDocumentCanvas } from './enhance';
import { computeOutputSize, warpPerspective, type Quad } from './geometry';
import { MAX_OUTPUT_DIMENSION } from './constants';

/** قصّ منظور + تحسين ألوان المستند (Magic Color) — يُعيد كانفاس جاهز للمعاينة/PDF. */
export function processDocumentCanvas(rawCanvas: HTMLCanvasElement, quad: Quad): HTMLCanvasElement {
  const { width, height } = computeOutputSize(quad);
  const scaleDown = Math.min(1, MAX_OUTPUT_DIMENSION / Math.max(width, height));
  const outW = Math.max(1, Math.round(width * scaleDown));
  const outH = Math.max(1, Math.round(height * scaleDown));

  const corrected = warpPerspective(rawCanvas, quad, outW, outH);
  enhanceDocumentCanvas(corrected);
  return corrected;
}
