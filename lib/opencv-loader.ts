'use client';

const OPENCV_URL = 'https://docs.opencv.org/4.10.0/opencv.js';

declare global {
  interface Window {
    cv?: {
      getBuildInformation?: () => string;
      onRuntimeInitialized?: () => void;
      [key: string]: unknown;
    };
  }
}

let loadPromise: Promise<void> | null = null;

/** يحمّل OpenCV.js مرة واحدة في المتصفح فقط (لا يُستدعى أثناء SSR). */
export function loadOpenCv(): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('OpenCV.js متاح فقط في المتصفح.'));
  }

  if (window.cv?.getBuildInformation) {
    return Promise.resolve();
  }

  if (loadPromise) return loadPromise;

  loadPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${OPENCV_URL}"]`);
    if (existing) {
      if (window.cv?.getBuildInformation) {
        resolve();
        return;
      }
      existing.addEventListener('load', () => {
        if (window.cv?.getBuildInformation) resolve();
        else if (window.cv) window.cv.onRuntimeInitialized = () => resolve();
      });
      return;
    }

    const script = document.createElement('script');
    script.src = OPENCV_URL;
    script.async = true;
    script.onload = () => {
      if (window.cv?.getBuildInformation) {
        resolve();
        return;
      }
      if (window.cv) {
        window.cv.onRuntimeInitialized = () => resolve();
      } else {
        reject(new Error('تعذّر تهيئة OpenCV.js'));
      }
    };
    script.onerror = () => reject(new Error('تعذّر تحميل OpenCV.js'));
    document.body.appendChild(script);
  });

  return loadPromise;
}

export function getOpenCv(): NonNullable<Window['cv']> {
  if (!window.cv?.getBuildInformation) {
    throw new Error('OpenCV.js غير جاهز بعد.');
  }
  return window.cv;
}

/** واجهة OpenCV.js الديناميكية — للاستخدام في مكوّنات الماسح فقط. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getOpenCvRuntime(): any {
  return getOpenCv();
}
