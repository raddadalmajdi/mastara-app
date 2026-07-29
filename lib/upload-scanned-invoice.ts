import type { SupabaseClient } from '@supabase/supabase-js';

const STORAGE_BUCKET = 'invoices-images';

export type ScannedUploadInput = {
  jpegBlob: Blob;
  pdfBlob: Blob;
};

export type ScannedUploadResult = {
  imageUrl: string;
  pdfUrl: string;
  storagePath: string;
};

/**
 * يرفع مستنداً ممسوحاً (PDF إلزامي + JPEG للمعاينة) إلى Supabase Storage
 * ويُرجع روابطه العامة — PDF هو الملف الرسمي المحفوظ في السجل.
 */
export async function uploadScannedInvoiceFiles(
  supabase: SupabaseClient,
  userId: string,
  { jpegBlob, pdfBlob }: ScannedUploadInput
): Promise<ScannedUploadResult> {
  const storagePath = `${userId}/${Date.now()}`;
  const pdfObjectPath = `${storagePath}.pdf`;
  const jpegObjectPath = `${storagePath}.jpg`;

  const { error: pdfError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(pdfObjectPath, pdfBlob, {
      contentType: 'application/pdf',
      upsert: true,
      cacheControl: '3600',
    });

  if (pdfError) {
    throw new Error(`تعذّر رفع ملف PDF: ${pdfError.message}`);
  }

  const { error: jpegError } = await supabase.storage.from(STORAGE_BUCKET).upload(jpegObjectPath, jpegBlob, {
    contentType: 'image/jpeg',
    upsert: true,
    cacheControl: '3600',
  });

  if (jpegError) {
    await supabase.storage.from(STORAGE_BUCKET).remove([pdfObjectPath]).catch(() => undefined);
    throw new Error(`تعذّر رفع صورة المعاينة: ${jpegError.message}`);
  }

  const {
    data: { publicUrl: pdfUrl },
  } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(pdfObjectPath);

  const {
    data: { publicUrl: imageUrl },
  } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(jpegObjectPath);

  return { pdfUrl, imageUrl, storagePath };
}

export type InvoiceInsertPayload = {
  user_id: string;
  customer_phone: string;
  image_url: string;
  pdf_url: string;
};

/**
 * يُدرج سجل فاتورة/مستند في جدول `invoices` مع رابط PDF الرسمي وصورة المعاينة.
 * إن لم يكن عمود `pdf_url` موجوداً بعد في Supabase، يُعاد المحاولة بدون العمود
 * (مع رمي خطأ واضح يطلب تشغيل migration).
 */
export async function insertInvoiceRecord(
  supabase: SupabaseClient,
  payload: InvoiceInsertPayload
): Promise<void> {
  const withPdf = await supabase.from('invoices').insert([
    {
      user_id: payload.user_id,
      customer_phone: payload.customer_phone,
      image_url: payload.image_url,
      pdf_url: payload.pdf_url,
    },
  ]);

  if (!withPdf.error) return;

  const msg = withPdf.error.message ?? '';
  const missingPdfColumn =
    msg.includes('pdf_url') ||
    msg.includes('column') ||
    withPdf.error.code === 'PGRST204';

  if (missingPdfColumn) {
    throw new Error(
      'عمود pdf_url غير موجود في جدول invoices. نفّذ migration من supabase/migrations/20260729140000_add_invoices_pdf_url.sql في Supabase SQL Editor ثم أعد المحاولة.'
    );
  }

  throw new Error(`تعذّر حفظ سجل المستند: ${msg}`);
}

/** رابط المستند المفضّل للمشاركة (PDF إن وُجد). */
export function invoiceShareDocumentUrl(invoice: { pdf_url?: string | null; image_url: string }): string {
  return invoice.pdf_url?.trim() || invoice.image_url;
}
