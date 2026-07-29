import type { InvoiceExtractedFields } from './types';

/** يدمج حقول OCR في نموذج الفاتورة — يملأ الحقول الفارغة فقط ما لم يُطلب `overwrite`. */
export function applyExtractedFieldsToForm(
  extracted: InvoiceExtractedFields | undefined,
  current: InvoiceExtractedFields,
  options?: { overwrite?: boolean }
): InvoiceExtractedFields {
  if (!extracted) return current;
  const overwrite = options?.overwrite ?? false;

  const pick = (next?: string, prev?: string) => (overwrite ? next ?? prev : prev || next);

  return {
    supplierName: pick(extracted.supplierName, current.supplierName),
    documentDate: pick(extracted.documentDate, current.documentDate),
    amount: pick(extracted.amount, current.amount),
    amountValue: overwrite ? extracted.amountValue ?? current.amountValue : current.amountValue ?? extracted.amountValue,
    currency: pick(extracted.currency, current.currency),
    invoiceNumber: pick(extracted.invoiceNumber, current.invoiceNumber),
    confidence: extracted.confidence ?? current.confidence,
  };
}

/** رقم جوال محلي من OCR — يُطبَّق على حقل العميل إن كان فارغاً. */
export function suggestedCustomerLocalPhone(
  extracted: InvoiceExtractedFields | undefined,
  currentLocal: string
): string {
  if (currentLocal.trim()) return currentLocal;
  const local = extracted?.customerPhoneLocal?.replace(/\D/g, '');
  return local && local.length >= 7 ? local : currentLocal;
}
