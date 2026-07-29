/** نتيجة الماسح: صورة JPEG للمعاينة + PDF للمستند. */
export type DocumentScanResult = {
  jpegBlob: Blob;
  pdfBlob: Blob;
};
