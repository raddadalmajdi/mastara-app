import { serializeAuthError } from '@/lib/auth-debug';

/** ي serializes أي خطأ/استثناء لعرضه كاملاً في Runtime Logs. */
export function serializeUnknownError(error: unknown): Record<string, unknown> {
  if (error == null) {
    return { kind: 'null' };
  }

  if (typeof error === 'string') {
    return { kind: 'string', message: error };
  }

  if (error instanceof Error) {
    const out: Record<string, unknown> = {
      kind: 'Error',
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
    if (error.cause != null) {
      out.cause = serializeUnknownError(error.cause);
    }
    return out;
  }

  if (typeof error === 'object') {
    const record = error as Record<string, unknown>;
    const snapshot: Record<string, unknown> = {
      kind: 'object',
      message: record.message,
      name: record.name,
      code: record.code,
      status: record.status,
      statusCode: record.statusCode,
    };

    try {
      for (const key of Object.getOwnPropertyNames(error)) {
        const value = record[key];
        if (typeof value !== 'function' && !(key in snapshot)) {
          snapshot[key] = value;
        }
      }
    } catch {
      // ignore accessor errors
    }

    snapshot.authJson = serializeAuthError(error);
    return snapshot;
  }

  return { kind: typeof error, value: String(error) };
}

function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const msg = (error as { message: unknown }).message;
    if (typeof msg === 'string') return msg;
  }
  return String(error);
}

/**
 * يطبع الاستثناء/الخطأ بالكامل في console — للتشخيص في Vercel Runtime Logs.
 * (لا يُعرض للمستخدم — server-only.)
 */
export function logServerException(
  context: string,
  error: unknown,
  meta?: Record<string, unknown>
): void {
  const message = extractErrorMessage(error);
  const serialized = serializeUnknownError(error);

  console.error(`[server-error] ${context}`, {
    ...(meta ?? {}),
    errorMessage: message,
    error: serialized,
  });

  console.error(`[server-error] ${context} — full technical message:\n${message}`);

  if (error instanceof Error && error.stack) {
    console.error(`[server-error] ${context} — stack trace:\n${error.stack}`);
  }

  try {
    console.error(
      `[server-error] ${context} — serialized JSON:\n${JSON.stringify(serialized, null, 2)}`
    );
  } catch {
    console.error(`[server-error] ${context} — could not JSON.stringify error`);
  }
}

/** خطأ Firebase Admin API — تفاصيل كاملة. */
export function logFirebaseAdminError(
  context: string,
  error: unknown,
  meta?: Record<string, unknown>
): void {
  console.error(`[Firebase Admin] ${context}`, meta ?? {});
  console.error(
    `[Firebase Admin] ${context} — auth error JSON:\n${serializeAuthError(error)}`
  );
  logServerException(`Firebase Admin/${context}`, error, meta);
}
