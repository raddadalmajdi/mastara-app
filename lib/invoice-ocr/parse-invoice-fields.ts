import type { InvoiceExtractedFields, InvoiceOcrResult } from './types';
import { normalizeDigits, normalizeOcrText } from './normalize-text';

const DATE_PATTERNS = [
  /\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})\b/g,
  /\b(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})\b/g,
];

const AMOUNT_KEYWORDS =
  /(?:total|amount|subtotal|balance|due|paid|المجموع|الإجمالي|الاجمالي|المبلغ|المدفوع|المستحق|صافي|قيمة|kd|kwd|د\.?\s?ك|دينار)/i;

const SUPPLIER_SKIP =
  /^(invoice|receipt|tax|vat|tel|phone|mobile|email|date|فاتورة|إيصال|تاريخ|هاتف|جوال|رقم|tax|qr)/i;

function parseAmountToken(token: string): { display: string; value: number; currency?: string } | null {
  const cleaned = token.replace(/[^\d.,]/g, '').replace(/,/g, '');
  if (!cleaned || !/\d/.test(cleaned)) return null;
  const value = Number.parseFloat(cleaned);
  if (!Number.isFinite(value) || value <= 0) return null;
  const display = value % 1 === 0 ? value.toFixed(0) : value.toFixed(3).replace(/\.?0+$/, '');
  let currency: string | undefined;
  if (/د\.?\s?ك|kwd|kd/i.test(token)) currency = 'KWD';
  return { display, value, currency };
}

function extractDate(text: string): string | undefined {
  for (const pattern of DATE_PATTERNS) {
    pattern.lastIndex = 0;
    const match = pattern.exec(text);
    if (!match) continue;
    if (match[0].length >= 8) return match[0];
  }
  return undefined;
}

function extractAmount(text: string): { amount?: string; amountValue?: number; currency?: string } {
  const lines = text.split('\n');
  let best: { display: string; value: number; currency?: string; score: number } | null = null;

  for (const line of lines) {
    const keywordHit = AMOUNT_KEYWORDS.test(line);
    const numbers = line.match(/[\d,.]+(?:\s?(?:KD|KWD|د\.?\s?ك))?/gi) ?? [];
    for (const num of numbers) {
      const parsed = parseAmountToken(num);
      if (!parsed) continue;
      let score = parsed.value;
      if (keywordHit) score += 10_000;
      if (line.length < 48) score += 50;
      if (!best || score > best.score) {
        best = { ...parsed, score };
      }
    }
  }

  if (!best) {
    const globalNums = text.match(/\b[\d]{1,3}(?:,\d{3})*(?:\.\d{1,3})?\b/g) ?? [];
    for (const num of globalNums) {
      const parsed = parseAmountToken(num);
      if (!parsed || parsed.value < 0.05) continue;
      if (!best || parsed.value > best.value) {
        best = { ...parsed, score: parsed.value };
      }
    }
  }

  if (!best) return {};
  return { amount: best.display, amountValue: best.value, currency: best.currency ?? 'KWD' };
}

function extractSupplierName(lines: string[]): string | undefined {
  for (const rawLine of lines.slice(0, 12)) {
    const line = rawLine.replace(/[^\p{L}\p{N}\s&.-]/gu, '').trim();
    if (line.length < 3 || line.length > 80) continue;
    if (SUPPLIER_SKIP.test(line)) continue;
    if (/^\d+$/.test(line.replace(/\s/g, ''))) continue;
    const letterRatio = (line.match(/\p{L}/gu) ?? []).length / line.length;
    if (letterRatio < 0.35) continue;
    return line;
  }
  return undefined;
}

function extractInvoiceNumber(text: string): string | undefined {
  const patterns = [
    /(?:invoice|inv|فاتورة|رقم\s*الفاتورة)\s*[#:：]?\s*([A-Za-z0-9-]+)/i,
    /\b(?:no|#)\s*[:：]?\s*(\d{3,})\b/i,
  ];
  for (const p of patterns) {
    const m = p.exec(text);
    if (m?.[1]) return m[1].trim();
  }
  return undefined;
}

/** يستخرج رقم جوال محلي كويتي (8 أرقام) إن وُجد في النص. */
function extractKuwaitLocalPhone(text: string): string | undefined {
  const normalized = normalizeDigits(text);
  const m =
    normalized.match(/(?:\+965|00965|965)[\s-]?(\d{8})\b/) ??
    normalized.match(/\b([569]\d{7})\b/);
  return m?.[1];
}

function scoreConfidence(fields: InvoiceExtractedFields): InvoiceExtractedFields['confidence'] {
  let score = 0;
  if (fields.supplierName) score += 1;
  if (fields.documentDate) score += 1;
  if (fields.amountValue) score += 1;
  if (fields.invoiceNumber) score += 1;
  if (score >= 3) return 'high';
  if (score >= 2) return 'medium';
  return 'low';
}

/** يحلّل نص OCR خام ويستخرج حقول الفاتورة الأساسية (عربي/إنجليزي). */
export function parseInvoiceFieldsFromText(rawText: string): InvoiceOcrResult {
  const text = normalizeOcrText(rawText);
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

  const amountPart = extractAmount(text);
  const fields: InvoiceExtractedFields = {
    supplierName: extractSupplierName(lines),
    documentDate: extractDate(text),
    amount: amountPart.amount,
    amountValue: amountPart.amountValue,
    currency: amountPart.currency,
    invoiceNumber: extractInvoiceNumber(text),
    customerPhoneLocal: extractKuwaitLocalPhone(text),
  };
  fields.confidence = scoreConfidence(fields);

  return { rawText: text, fields };
}
