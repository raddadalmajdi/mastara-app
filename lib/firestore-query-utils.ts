/** True when Firestore needs a composite index that is not built yet. */
export function isFirestoreMissingIndexError(error: unknown): boolean {
  const code =
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof (error as { code?: unknown }).code === 'string'
      ? (error as { code: string }).code
      : '';

  if (code === 'failed-precondition') return true;

  const message = error instanceof Error ? error.message : String(error ?? '');
  return /requires an index/i.test(message);
}

export function sortByCreatedAtDesc<T extends { created_at: string }>(records: T[]): T[] {
  return [...records].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}
