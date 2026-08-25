export class AsyncTimeoutError extends Error {
  readonly timeoutMs: number;
  readonly label: string;

  constructor(label: string, timeoutMs: number) {
    super(
      `انتهت مهلة «${label}» (${Math.round(timeoutMs / 1000)} ثانية). تحقق من الشبكة أو إعدادات Firebase/Resend وحاول مجدداً.`
    );
    this.name = 'AsyncTimeoutError';
    this.label = label;
    this.timeoutMs = timeoutMs;
  }
}

export function isAsyncTimeoutError(error: unknown): error is AsyncTimeoutError {
  return error instanceof AsyncTimeoutError;
}

/** ينفّذ وعداً مع رفض بعد ms. */
export function withTimeout<T>(
  promise: PromiseLike<T>,
  timeoutMs: number,
  label: string
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new AsyncTimeoutError(label, timeoutMs));
    }, timeoutMs);

    Promise.resolve(promise)
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

const DEFAULT_FETCH_TIMEOUT_MS = 45_000;

export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit & { timeoutMs?: number } = {}
): Promise<Response> {
  const { timeoutMs = DEFAULT_FETCH_TIMEOUT_MS, ...fetchInit } = init;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, { ...fetchInit, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new AsyncTimeoutError('طلب التسجيل (/api/auth/sign-up)', timeoutMs);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

/** تسجيل مرحلة في التطوير (server أو client). */
export function logAuthFlowStep(scope: string, step: string, extra?: Record<string, unknown>): void {
  if (process.env.NODE_ENV !== 'development') return;
  const payload = extra ? ` ${JSON.stringify(extra)}` : '';
  console.log(`[auth-flow:${scope}] ${step}${payload}`);
}
