'use client';

import type { InvoiceOcrResult } from './types';
import { parseInvoiceFieldsFromText } from './parse-invoice-fields';

const OCR_MAX_EDGE = 1600;
const OCR_TIMEOUT_MS = 55_000;

type OcrWorker = Awaited<ReturnType<(typeof import('tesseract.js'))['createWorker']>>;

let sharedWorkerPromise: Promise<OcrWorker> | null = null;

function canvasForOcr(source: HTMLCanvasElement): HTMLCanvasElement {
  const maxEdge = Math.max(source.width, source.height);
  if (maxEdge <= OCR_MAX_EDGE) return source;

  const scale = OCR_MAX_EDGE / maxEdge;
  const w = Math.max(1, Math.round(source.width * scale));
  const h = Math.max(1, Math.round(source.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return source;
  ctx.drawImage(source, 0, 0, w, h);
  return canvas;
}

async function getSharedWorker(): Promise<OcrWorker> {
  if (!sharedWorkerPromise) {
    sharedWorkerPromise = (async () => {
      const { createWorker } = await import('tesseract.js');
      const worker = await createWorker('ara+eng', undefined, {
        workerPath: 'https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/worker.min.js',
        langPath: 'https://tessdata.projectnaptha.com/4.0.0',
        corePath: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.0/tesseract-core.wasm.js',
        logger: () => undefined,
      });
      return worker;
    })().catch((err) => {
      sharedWorkerPromise = null;
      throw err;
    });
  }
  return sharedWorkerPromise;
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = window.setTimeout(() => reject(new Error(message)), ms);
    promise
      .then((v) => {
        window.clearTimeout(id);
        resolve(v);
      })
      .catch((e) => {
        window.clearTimeout(id);
        reject(e);
      });
  });
}

/**
 * OCR في المتصفح (Tesseract.js — عربي + إنجليزي) على كانفاس المستند المُحسَّن.
 * يُحمَّل العامل (Worker) مرة واحدة ويُعاد استخدامه. يُفضَّل استدعاؤه على
 * الصورة بعد معالجة الماسح (أبيض/أسود) لدقة أعلى.
 */
export async function recognizeInvoiceFromCanvas(canvas: HTMLCanvasElement): Promise<InvoiceOcrResult> {
  if (typeof window === 'undefined') {
    throw new Error('OCR متاح فقط في المتصفح.');
  }

  const ocrCanvas = canvasForOcr(canvas);
  const worker = await getSharedWorker();

  const { data } = await withTimeout(
    worker.recognize(ocrCanvas),
    OCR_TIMEOUT_MS,
    'انتهت مهلة قراءة النص من المستند.'
  );

  return parseInvoiceFieldsFromText(data.text ?? '');
}

/** يحرّر عامل Tesseract المشترك (اختياري — عند إغلاق التطبيق). */
export async function terminateInvoiceOcrWorker(): Promise<void> {
  if (!sharedWorkerPromise) return;
  try {
    const worker = await sharedWorkerPromise;
    await worker.terminate();
  } finally {
    sharedWorkerPromise = null;
  }
}
