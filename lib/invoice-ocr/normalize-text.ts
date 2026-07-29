/** يحوّل الأرقام العربية/الفارسية إلى أرقام لاتينية لتسهيل regex. */
export function normalizeDigits(input: string): string {
  const arabicIndic = '٠١٢٣٤٥٦٧٨٩';
  const easternArabic = '۰۱۲۳۴۵۶۷۸۹';
  let out = '';
  for (const ch of input) {
    const a = arabicIndic.indexOf(ch);
    if (a >= 0) {
      out += String(a);
      continue;
    }
    const e = easternArabic.indexOf(ch);
    if (e >= 0) {
      out += String(e);
      continue;
    }
    out += ch;
  }
  return out;
}

/** يُنظّف النص الخام من OCR (مسافات زائدة، أسطر فارغة). */
export function normalizeOcrText(raw: string): string {
  return normalizeDigits(raw)
    .replace(/\r/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
