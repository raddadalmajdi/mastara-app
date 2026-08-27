import { collection, addDoc, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import { getDownloadURL, ref } from 'firebase/storage';
import { getCached, invalidateCachePrefix, setCached } from '@/lib/client-cache';
import { isFirestoreMissingIndexError, sortByCreatedAtDesc } from '@/lib/firestore-query-utils';
import {
  rollbackStorageObjects,
  uploadBlobResumable,
} from '@/lib/firebase-storage-upload';
import { getFirebaseFirestoreClient, getFirebaseStorageClient, isFirebaseConfigured } from '@/lib/firebase';
import { assertAuthenticatedUserId, assertOrganizationScope } from '@/lib/tenant-guard';
import { normalizeStoredPhone, upsertTailorCustomer } from '@/lib/tailor-customers';
import {
  prepareInvoiceBlobsForUpload,
  toUploadUserMessage,
} from '@/lib/upload-blob-utils';

const STORAGE_BUCKET_PATH = 'invoices-images';
const INVOICE_LIST_CACHE_TTL_MS = 45_000;
const INVOICE_QUERY_LIMIT = 80;
const INVOICE_UPLOAD_TIMEOUT_MS = 180_000;

const INVOICE_FILE_METADATA = {
  pdf: {
    contentType: 'application/pdf',
    cacheControl: 'public, max-age=31536000, immutable',
  },
  jpeg: {
    contentType: 'image/jpeg',
    cacheControl: 'public, max-age=31536000, immutable',
  },
} as const;

async function assertSessionMatchesUser(userId: string): Promise<void> {
  await assertAuthenticatedUserId(userId);
}

function mapInvoiceDoc(docSnap: { id: string; data: () => Record<string, unknown> }): InvoiceRecord {
  const data = docSnap.data();
  const customerNameRaw = data.customer_name ?? data.name;
  return {
    id: docSnap.id,
    user_id: String(data.user_id),
    organization_id: data.organization_id != null ? String(data.organization_id) : undefined,
    customer_phone: String(data.customer_phone),
    customer_name:
      typeof customerNameRaw === 'string' && customerNameRaw.trim()
        ? customerNameRaw.trim()
        : '',
    image_url: String(data.image_url),
    pdf_url: String(data.pdf_url),
    created_at: String(data.created_at ?? new Date().toISOString()),
  };
}

function sanitizeFirestoreRecord(record: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (value !== undefined) {
      out[key] = value;
    }
  }
  return out;
}

function buildInvoiceWritePayload(payload: InvoiceInsertPayload): Record<string, unknown> {
  const userId = payload.user_id.trim();
  const customerPhone = normalizeStoredPhone(payload.customer_phone);
  const customerName = payload.customer_name.trim();
  const imageUrl = payload.image_url.trim();
  const pdfUrl = payload.pdf_url.trim();
  const orgId = payload.organization_id?.trim() || null;

  if (!userId) throw new Error('معرّف التاجر غير صالح.');
  if (!customerPhone) throw new Error('رقم جوال العميل غير صالح.');
  if (!customerName) throw new Error('اسم العميل مطلوب قبل حفظ الفاتورة.');
  if (!imageUrl) throw new Error('رابط صورة الفاتورة مفقود.');
  if (!pdfUrl) throw new Error('رابط PDF الفاتورة مفقود.');

  return sanitizeFirestoreRecord({
    user_id: userId,
    organization_id: orgId,
    customer_phone: customerPhone,
    customer_name: customerName,
    name: customerName,
    image_url: imageUrl,
    pdf_url: pdfUrl,
    created_at: new Date().toISOString(),
  });
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
  input: ScannedUploadInput,
  options?: ScannedUploadOptions
): Promise<ScannedUploadResult> {
  await assertSessionMatchesUser(userId);

  const { jpegBlob, pdfBlob } = await prepareInvoiceBlobsForUpload(input);

  const safeLabel = options?.label?.replace(/[^\d+a-zA-Z_-]/g, '') ?? '';
  const storagePath = safeLabel ? `${userId}/${safeLabel}_${Date.now()}` : `${userId}/${Date.now()}`;
  const pdfObjectPath = `${STORAGE_BUCKET_PATH}/${storagePath}.pdf`;
  const jpegObjectPath = `${STORAGE_BUCKET_PATH}/${storagePath}.jpg`;

  const storage = getFirebaseStorageClient();
  const uploadedPaths: string[] = [];

  try {
    await uploadBlobResumable(
      ref(storage, pdfObjectPath),
      pdfBlob,
      INVOICE_FILE_METADATA.pdf,
      { timeoutMs: INVOICE_UPLOAD_TIMEOUT_MS }
    );
    uploadedPaths.push(pdfObjectPath);

    await uploadBlobResumable(
      ref(storage, jpegObjectPath),
      jpegBlob,
      INVOICE_FILE_METADATA.jpeg,
      { timeoutMs: INVOICE_UPLOAD_TIMEOUT_MS }
    );
    uploadedPaths.push(jpegObjectPath);

    const pdfUrl = await getDownloadURL(ref(storage, pdfObjectPath));
    const imageUrl = await getDownloadURL(ref(storage, jpegObjectPath));
    return { pdfUrl, imageUrl, storagePath };
  } catch (error) {
    await rollbackStorageObjects(storage, uploadedPaths);
    const message = toUploadUserMessage(error);
    if (uploadedPaths.length === 0) {
      throw new Error(`تعذّر رفع PDF: ${message}`);
    }
    if (uploadedPaths.length === 1) {
      throw new Error(`تعذّر رفع صورة المعاينة: ${message}`);
    }
    throw new Error(`تعذّر إتمام الرفع: ${message}`);
  }
}

export type InvoiceInsertPayload = {
  user_id: string;
  organization_id?: string | null;
  customer_phone: string;
  customer_name: string;
  image_url: string;
  pdf_url: string;
};

export type InvoiceRecord = InvoiceInsertPayload & {
  id: string;
  created_at: string;
};

export type InvoiceWriteOptions = {
  /** من سياق المنظمة الموثوق (OrganizationProvider) — يمنع تمرير organization_id لمحل آخر. */
  allowedOrganizationId?: string | null;
};

export async function insertInvoiceRecord(
  payload: InvoiceInsertPayload,
  options?: InvoiceWriteOptions
): Promise<string> {
  await assertSessionMatchesUser(payload.user_id);
  assertOrganizationScope(payload.organization_id, options?.allowedOrganizationId);

  const db = getFirebaseFirestoreClient();
  const writePayload = buildInvoiceWritePayload(payload);

  try {
    const docRef = await addDoc(collection(db, 'invoices'), writePayload);

    invalidateCachePrefix(`inv:${payload.user_id}:`);
    const orgId = payload.organization_id?.trim();
    if (orgId) {
      invalidateCachePrefix(`inv:org:${orgId}:`);
    }

    return docRef.id;
  } catch (error) {
    throw new Error(`تعذّر حفظ سجل الفاتورة: ${toUploadUserMessage(error)}`);
  }
}

export type SaveScannedInvoiceInput = {
  userId: string;
  customerPhone: string;
  customerName: string;
  organizationId?: string | null;
  allowedOrganizationId?: string | null;
  jpegBlob: Blob;
  pdfBlob: Blob;
};

/** يحفظ/يحدّث الزبون في tailor_customers أولاً، ثم يرفع الملفات ويُنشئ سجل الفاتورة. */
export async function saveScannedInvoiceWithCustomer(
  input: SaveScannedInvoiceInput
): Promise<{ invoiceId: string; customerId: string }> {
  const userId = input.userId.trim();
  const customerPhone = normalizeStoredPhone(input.customerPhone);
  const customerName = input.customerName.trim();

  if (!userId) throw new Error('يجب تسجيل الدخول لحفظ الفاتورة.');
  if (!customerPhone) throw new Error('رقم جوال العميل غير صالح.');
  if (!customerName) throw new Error('اسم العميل مطلوب قبل حفظ الفاتورة.');

  const customer = await upsertTailorCustomer(
    userId,
    customerPhone,
    customerName,
    input.organizationId
  );

  const { imageUrl, pdfUrl } = await uploadScannedInvoiceFiles(
    userId,
    { jpegBlob: input.jpegBlob, pdfBlob: input.pdfBlob },
    { label: customerPhone }
  );

  const invoiceId = await insertInvoiceRecord(
    {
      user_id: userId,
      organization_id: input.organizationId?.trim() || null,
      customer_phone: customerPhone,
      customer_name: customerName,
      image_url: imageUrl,
      pdf_url: pdfUrl,
    },
    { allowedOrganizationId: input.allowedOrganizationId }
  );

  return { invoiceId, customerId: customer.id };
}

/** استعلام مفهرس بالبريد/الجوال — أسرع من جلب كل الفواتير ثم التصفية في الذاكرة. */
export async function fetchInvoicesByCustomerPhone(params: {
  userId: string;
  customerPhone: string;
  organizationId?: string | null;
  allowedOrganizationId?: string | null;
}): Promise<InvoiceRecord[]> {
  if (!isFirebaseConfigured()) return [];

  await assertAuthenticatedUserId(params.userId);
  assertOrganizationScope(params.organizationId, params.allowedOrganizationId);

  const normalizedPhone = normalizeStoredPhone(params.customerPhone);
  if (!normalizedPhone) return [];

  const cacheKey = params.organizationId
    ? `inv:org:${params.organizationId}:${normalizedPhone}`
    : `inv:${params.userId}:${normalizedPhone}`;

  const cached = getCached<InvoiceRecord[]>(cacheKey);
  if (cached) return cached;

  const db = getFirebaseFirestoreClient();
  const invoicesRef = collection(db, 'invoices');

  const orgQuery = params.organizationId
    ? query(
        invoicesRef,
        where('organization_id', '==', params.organizationId),
        where('customer_phone', '==', normalizedPhone),
        orderBy('created_at', 'desc'),
        limit(INVOICE_QUERY_LIMIT)
      )
    : null;

  const userQuery = query(
    invoicesRef,
    where('user_id', '==', params.userId),
    where('customer_phone', '==', normalizedPhone),
    orderBy('created_at', 'desc'),
    limit(INVOICE_QUERY_LIMIT)
  );

  try {
    const snap = orgQuery ? await getDocs(orgQuery) : await getDocs(userQuery);
    const records = snap.docs.map(mapInvoiceDoc);
    setCached(cacheKey, records, INVOICE_LIST_CACHE_TTL_MS);
    return records;
  } catch (error) {
    if (orgQuery) {
      try {
        const snap = await getDocs(userQuery);
        const records = snap.docs.map(mapInvoiceDoc);
        setCached(cacheKey, records, INVOICE_LIST_CACHE_TTL_MS);
        return records;
      } catch (userQueryError) {
        if (!isFirestoreMissingIndexError(userQueryError)) throw userQueryError;
      }
    } else if (!isFirestoreMissingIndexError(error)) {
      throw error;
    }

    const fallbackQuery = params.organizationId
      ? query(
          invoicesRef,
          where('organization_id', '==', params.organizationId),
          limit(INVOICE_QUERY_LIMIT * 3)
        )
      : query(invoicesRef, where('user_id', '==', params.userId), limit(INVOICE_QUERY_LIMIT * 3));

    const snap = await getDocs(fallbackQuery);
    const records = sortByCreatedAtDesc(
      snap.docs
        .map(mapInvoiceDoc)
        .filter((inv) => normalizeStoredPhone(inv.customer_phone) === normalizedPhone)
    ).slice(0, INVOICE_QUERY_LIMIT);

    setCached(cacheKey, records, INVOICE_LIST_CACHE_TTL_MS);
    return records;
  }
}

export async function fetchInvoicesForUser(params: {
  userId: string;
  organizationId?: string | null;
  allowedOrganizationId?: string | null;
}): Promise<InvoiceRecord[]> {
  if (!isFirebaseConfigured()) return [];

  await assertAuthenticatedUserId(params.userId);
  assertOrganizationScope(params.organizationId, params.allowedOrganizationId);

  const cacheKey = params.organizationId
    ? `inv:org:${params.organizationId}:all`
    : `inv:${params.userId}:all`;

  const cached = getCached<InvoiceRecord[]>(cacheKey);
  if (cached) return cached;

  const db = getFirebaseFirestoreClient();
  const invoicesRef = collection(db, 'invoices');

  const q = params.organizationId
    ? query(
        invoicesRef,
        where('organization_id', '==', params.organizationId),
        orderBy('created_at', 'desc'),
        limit(INVOICE_QUERY_LIMIT)
      )
    : query(
        invoicesRef,
        where('user_id', '==', params.userId),
        orderBy('created_at', 'desc'),
        limit(INVOICE_QUERY_LIMIT)
      );

  try {
    const snap = await getDocs(q);
    const records = snap.docs.map(mapInvoiceDoc);
    setCached(cacheKey, records, INVOICE_LIST_CACHE_TTL_MS);
    return records;
  } catch (error) {
    if (!isFirestoreMissingIndexError(error)) throw error;

    const fallbackQuery = params.organizationId
      ? query(
          invoicesRef,
          where('organization_id', '==', params.organizationId),
          limit(INVOICE_QUERY_LIMIT * 2)
        )
      : query(invoicesRef, where('user_id', '==', params.userId), limit(INVOICE_QUERY_LIMIT * 2));

    const snap = await getDocs(fallbackQuery);
    const records = sortByCreatedAtDesc(snap.docs.map(mapInvoiceDoc)).slice(0, INVOICE_QUERY_LIMIT);
    setCached(cacheKey, records, INVOICE_LIST_CACHE_TTL_MS);
    return records;
  }
}

export function invoiceShareDocumentUrl(invoice: { pdf_url?: string | null; image_url: string }): string {
  return invoice.pdf_url?.trim() || invoice.image_url;
}
