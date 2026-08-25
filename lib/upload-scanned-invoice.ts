import { collection, addDoc, getDocs, orderBy, query, where } from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { getFirebaseAuthClient, getFirebaseFirestoreClient, getFirebaseStorageClient, isFirebaseConfigured } from '@/lib/firebase';
import {
  assertBlobWithinLimit,
  compressJpegBlobIfNeeded,
  MAX_INVOICE_JPEG_BYTES,
  MAX_INVOICE_PDF_BYTES,
  toUploadUserMessage,
} from '@/lib/upload-blob-utils';

const STORAGE_BUCKET_PATH = 'invoices-images';

async function assertSessionMatchesUser(userId: string): Promise<void> {
  const auth = getFirebaseAuthClient();
  const user = auth.currentUser;
  if (!user) {
    throw new Error('يجب تسجيل الدخول لرفع أو حفظ المستندات.');
  }
  if (user.uid !== userId) {
    throw new Error('لا يمكن حفظ المستند إلا في حساب المحل الحالي.');
  }
  // يجدّد التوكن قبل الرفع — يمنع storage/unauthenticated بعد جلسة طويلة.
  await user.getIdToken(true);
}

export type ScannedUploadInput = {
  jpegBlob: Blob;
  pdfBlob: Blob;
};

export type ScannedUploadResult = {
  imageUrl: string;
  pdfUrl: string;
  storagePath: string;
};

export type ScannedUploadOptions = {
  label?: string;
};

export async function uploadScannedInvoiceFiles(
  userId: string,
  { jpegBlob, pdfBlob }: ScannedUploadInput,
  options?: ScannedUploadOptions
): Promise<ScannedUploadResult> {
  await assertSessionMatchesUser(userId);

  assertBlobWithinLimit(pdfBlob, 'ملف PDF', MAX_INVOICE_PDF_BYTES);
  const jpegForUpload = await compressJpegBlobIfNeeded(jpegBlob, MAX_INVOICE_JPEG_BYTES);
  assertBlobWithinLimit(jpegForUpload, 'صورة المعاينة', MAX_INVOICE_JPEG_BYTES);

  const safeLabel = options?.label?.replace(/[^\d+a-zA-Z_-]/g, '') ?? '';
  const storagePath = safeLabel ? `${userId}/${safeLabel}_${Date.now()}` : `${userId}/${Date.now()}`;
  const pdfObjectPath = `${STORAGE_BUCKET_PATH}/${storagePath}.pdf`;
  const jpegObjectPath = `${STORAGE_BUCKET_PATH}/${storagePath}.jpg`;

  const storage = getFirebaseStorageClient();

  try {
    await uploadBytes(ref(storage, pdfObjectPath), pdfBlob, {
      contentType: 'application/pdf',
      customMetadata: { cacheControl: '3600' },
    });
  } catch (error) {
    throw new Error(`تعذّر رفع PDF: ${toUploadUserMessage(error)}`);
  }

  try {
    await uploadBytes(ref(storage, jpegObjectPath), jpegForUpload, {
      contentType: 'image/jpeg',
      customMetadata: { cacheControl: '3600' },
    });
  } catch (error) {
    throw new Error(`تعذّر رفع صورة المعاينة: ${toUploadUserMessage(error)}`);
  }

  try {
    const pdfUrl = await getDownloadURL(ref(storage, pdfObjectPath));
    const imageUrl = await getDownloadURL(ref(storage, jpegObjectPath));
    return { pdfUrl, imageUrl, storagePath };
  } catch (error) {
    throw new Error(`تعذّر الحصول على روابط الملف: ${toUploadUserMessage(error)}`);
  }
}

export type InvoiceInsertPayload = {
  user_id: string;
  organization_id?: string;
  customer_phone: string;
  image_url: string;
  pdf_url: string;
};

export type InvoiceRecord = InvoiceInsertPayload & {
  id: string;
  created_at: string;
};

export async function insertInvoiceRecord(payload: InvoiceInsertPayload): Promise<string> {
  await assertSessionMatchesUser(payload.user_id);

  const db = getFirebaseFirestoreClient();
  try {
    const docRef = await addDoc(collection(db, 'invoices'), {
      user_id: payload.user_id,
      organization_id: payload.organization_id ?? null,
      customer_phone: payload.customer_phone,
      image_url: payload.image_url,
      pdf_url: payload.pdf_url,
      created_at: new Date().toISOString(),
    });
    return docRef.id;
  } catch (error) {
    throw new Error(`تعذّر حفظ سجل الفاتورة: ${toUploadUserMessage(error)}`);
  }
}

export async function fetchInvoicesForUser(params: {
  userId: string;
  organizationId?: string | null;
}): Promise<InvoiceRecord[]> {
  if (!isFirebaseConfigured()) return [];

  const db = getFirebaseFirestoreClient();
  let q;

  if (params.organizationId) {
    q = query(
      collection(db, 'invoices'),
      where('organization_id', '==', params.organizationId),
      orderBy('created_at', 'desc')
    );
  } else {
    q = query(
      collection(db, 'invoices'),
      where('user_id', '==', params.userId),
      orderBy('created_at', 'desc')
    );
  }

  const snap = await getDocs(q).catch(async () => {
    const fallback = query(
      collection(db, 'invoices'),
      where('user_id', '==', params.userId)
    );
    return getDocs(fallback);
  });

  return snap.docs.map((docSnap) => {
    const data = docSnap.data();
    return {
      id: docSnap.id,
      user_id: String(data.user_id),
      organization_id: data.organization_id != null ? String(data.organization_id) : undefined,
      customer_phone: String(data.customer_phone),
      image_url: String(data.image_url),
      pdf_url: String(data.pdf_url),
      created_at: String(data.created_at ?? new Date().toISOString()),
    };
  });
}

export function invoiceShareDocumentUrl(invoice: { pdf_url?: string | null; image_url: string }): string {
  return invoice.pdf_url?.trim() || invoice.image_url;
}
