'use client';

/** استضافة ذاتية — أولوية لتجنّب CORS وانقطاع CDN. */
const LOCAL_OPENCV_SCRIPT = '/libs/opencv.js';
const LOCAL_OPENCV_BASE = '/libs/';

/** بدائل شبكية إذا فشل الملف المحلي. */
const REMOTE_OPENCV_SCRIPTS = [
  'https://docs.opencv.org/4.9.0/opencv.js',
  'https://cdn.jsdelivr.net/npm/@techstark/opencv-js@4.10.0-release.1/dist/opencv.js',
] as const;

/** مهلة تحميل السكربت + تهيئة WASM (الملف ~10MB). */
export const OPENCV_LOAD_TIMEOUT_MS = 45_000;
/** بعد هذه المدة نُظهر تنبيهاً بأن التحميل يستغرق وقتاً. */
export const OPENCV_SLOW_HINT_MS = 10_000;

declare global {
  interface Window {
    cv?: {
      getBuildInformation?: () => string;
      onRuntimeInitialized?: () => void;
      [key: string]: unknown;
    };
    Module?: {
      locateFile?: (path: string, scriptDirectory?: string) => string;
      onRuntimeInitialized?: () => void;
      [key: string]: unknown;
    };
  }
}

let loadPromise: Promise<void> | null = null;

function isOpenCvReady(): boolean {
  return Boolean(window.cv?.getBuildInformation);
}

function clearInjectedScripts(): void {
  document.querySelectorAll('script[data-opencv-loader]').forEach((node) => node.remove());
}

function resetOpenCvLoadState(): void {
  loadPromise = null;
  clearInjectedScripts();
}

function configureModuleBase(baseUrl: string): void {
  window.Module = {
    ...window.Module,
    locateFile: (path: string) => `${baseUrl}${path}`,
  };
}

function waitForOpenCvRuntime(timeoutMs: number): Promise<void> {
  if (isOpenCvReady()) {
    return Promise.resolve();
  }

  return new Promise<void>((resolve, reject) => {
    let settled = false;

    const finish = () => {
      if (settled) return;
      if (!isOpenCvReady()) return;
      settled = true;
      window.clearTimeout(timer);
      resolve();
    };

    const fail = (message: string) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      reject(new Error(message));
    };

    const timer = window.setTimeout(() => {
      fail('استغرق تحميل OpenCV.js وقتاً طويلاً. تحقق من الاتصال وحاول مجدداً.');
    }, timeoutMs);

    if (window.cv) {
      window.cv.onRuntimeInitialized = finish;
    }

    window.Module = {
      ...window.Module,
      onRuntimeInitialized: finish,
    };

    const poll = window.setInterval(() => {
      if (isOpenCvReady()) {
        window.clearInterval(poll);
        finish();
      }
    }, 120);

    window.setTimeout(() => window.clearInterval(poll), timeoutMs + 50);
  });
}

function injectOpenCvScript(src: string, isLocal: boolean): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[data-opencv-loader][src="${src}"]`);
    if (existing) {
      void waitForOpenCvRuntime(OPENCV_LOAD_TIMEOUT_MS).then(resolve).catch(reject);
      return;
    }

    if (isLocal) {
      configureModuleBase(LOCAL_OPENCV_BASE);
    } else {
      try {
        const remoteBase = src.slice(0, src.lastIndexOf('/') + 1);
        configureModuleBase(remoteBase);
      } catch {
        /* ignore malformed URL */
      }
    }

    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.setAttribute('data-opencv-loader', '1');
    script.onload = () => {
      void waitForOpenCvRuntime(OPENCV_LOAD_TIMEOUT_MS).then(resolve).catch(reject);
    };
    script.onerror = () => {
      reject(
        new Error(
          isLocal
            ? 'تعذّر تحميل OpenCV.js من الخادم المحلي.'
            : 'تعذّر تحميل OpenCV.js من الشبكة.'
        )
      );
    };
    document.head.appendChild(script);
  });
}

async function loadFromSources(): Promise<void> {
  const sources = [LOCAL_OPENCV_SCRIPT, ...REMOTE_OPENCV_SCRIPTS];
  const errors: string[] = [];

  for (const src of sources) {
    clearInjectedScripts();
    try {
      await injectOpenCvScript(src, src.startsWith('/'));
      if (isOpenCvReady()) {
        return;
      }
      await waitForOpenCvRuntime(5_000);
      if (isOpenCvReady()) {
        return;
      }
      errors.push('تعذّر تهيئة OpenCV.js بعد التحميل.');
    } catch (error) {
      errors.push(error instanceof Error ? error.message : 'تعذّر تحميل OpenCV.js');
    }
  }

  throw new Error(errors[errors.length - 1] ?? 'تعذّر تحميل OpenCV.js');
}

export type LoadOpenCvOptions = {
  force?: boolean;
};

/** يحمّل OpenCV.js مرة واحدة في المتصفح (لا يُستدعى أثناء SSR). */
export function loadOpenCv(options?: LoadOpenCvOptions): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('OpenCV.js متاح فقط في المتصفح.'));
  }

  if (isOpenCvReady() && !options?.force) {
    return Promise.resolve();
  }

  if (options?.force) {
    resetOpenCvLoadState();
  }

  if (!loadPromise) {
    loadPromise = loadFromSources().catch((error) => {
      loadPromise = null;
      throw error;
    });
  }

  return loadPromise;
}

/** إعادة محاولة التحميل بعد فشل سابق — يُستخدم من زر «إعادة المحاولة». */
export function retryLoadOpenCv(): Promise<void> {
  return loadOpenCv({ force: true });
}

export function getOpenCv(): NonNullable<Window['cv']> {
  if (!isOpenCvReady()) {
    throw new Error('OpenCV.js غير جاهز بعد.');
  }
  return window.cv!;
}

/** واجهة OpenCV.js الديناميكية — للاستخدام في مكوّنات الماسح فقط. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getOpenCvRuntime(): any {
  return getOpenCv();
}
