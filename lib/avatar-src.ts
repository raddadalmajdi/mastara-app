const INVALID_LITERALS = new Set(['null', 'undefined', 'none', 'nan']);

/** يُرجع رابطاً صالحاً للعرض أو سلسلة فارغة. */
export function normalizeAvatarSrc(src: string | null | undefined): string {
  const trimmed = src?.trim() ?? '';
  if (!trimmed || INVALID_LITERALS.has(trimmed.toLowerCase())) return '';
  if (trimmed.startsWith('data:image/')) return trimmed;
  if (trimmed.startsWith('blob:')) return trimmed;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return '';
}

export function isDataAvatarSrc(src: string): boolean {
  return src.startsWith('data:image/');
}

export function hasDisplayAvatar(src: string | null | undefined): boolean {
  return normalizeAvatarSrc(src).length > 0;
}
