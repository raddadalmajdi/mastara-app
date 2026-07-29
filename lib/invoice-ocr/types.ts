/** حقول مستخرجة من OCR/تحليل نص الفاتورة — قابلة للتعديل قبل الحفظ. */
export type InvoiceExtractedFields = {
  supplierName?: string;
  documentDate?: string;
  amount?: string;
  amountValue?: number;
  currency?: string;
  invoiceNumber?: string;
  customerPhoneLocal?: string;
  confidence?: 'low' | 'medium' | 'high';
};

export type InvoiceOcrResult = {
  rawText: string;
  fields: InvoiceExtractedFields;
};

export type DocumentScanResult = {
  jpegBlob: Blob;
  pdfBlob: Blob;
  extracted?: InvoiceExtractedFields;
};
