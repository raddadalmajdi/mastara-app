import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  setDoc,
  where,
} from 'firebase/firestore';
import { getFirebaseFirestoreClient, isFirebaseConfigured } from '@/lib/firebase';
import { assertAuthenticatedUserId } from '@/lib/tenant-guard';

export type TailorCustomerRecord = {
  id: string;
  tailor_user_id: string;
  organization_id: string | null;
  phone: string;
  customer_name: string;
};

const LOCAL_CUSTOMERS_KEY = 'mistarh_local_customers';

type LocalCustomer = { phone: string; customer_name: string };

function readLocalCustomers(): LocalCustomer[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(LOCAL_CUSTOMERS_KEY) || '[]') as LocalCustomer[];
  } catch {
    return [];
  }
}

function writeLocalCustomers(list: LocalCustomer[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(LOCAL_CUSTOMERS_KEY, JSON.stringify(list));
}

export function normalizeStoredPhone(fullPhone: string): string {
  return fullPhone.replace(/\D/g, '');
}

export const MIN_CUSTOMER_PHONE_SEARCH_LENGTH = 4;

export function isCustomerPhoneSearchable(localPhone: string): boolean {
  return localPhone.replace(/\D/g, '').length >= MIN_CUSTOMER_PHONE_SEARCH_LENGTH;
}

export function phoneMatchVariants(countryCode: string, localPhone: string): string[] {
  const local = localPhone.replace(/\D/g, '');
  const cc = countryCode.replace(/\D/g, '');
  const full = `${cc}${local}`;
  const variants = new Set<string>();
  if (local) variants.add(local);
  if (full) variants.add(full);
  if (cc && local) variants.add(`${cc}${local}`);
  if (cc && local) variants.add(`+${cc}${local}`);
  return [...variants];
}

export function phonesMatch(a: string, b: string): boolean {
  const da = normalizeStoredPhone(a);
  const db = normalizeStoredPhone(b);
  if (!da || !db) return false;
  if (da === db) return true;
  if (da.endsWith(db) || db.endsWith(da)) return true;
  return false;
}

function assertTailorOwnsSession(tailorUserId: string): void {
  void assertAuthenticatedUserId(tailorUserId);
}

function customerDocId(tailorUserId: string, phone: string, organizationId?: string | null): string {
  const orgPart = organizationId?.trim() || 'personal';
  return `${tailorUserId}_${orgPart}_${phone}`.replace(/[^a-zA-Z0-9_-]/g, '_');
}

export async function lookupTailorCustomerByPhone(
  tailorUserId: string,
  fullPhone: string,
  organizationId?: string | null
): Promise<TailorCustomerRecord | null> {
  const normalized = normalizeStoredPhone(fullPhone);
  if (!normalized) return null;

  if (!isFirebaseConfigured()) {
    const hit = readLocalCustomers().find((c) => normalizeStoredPhone(c.phone) === normalized);
    return hit
      ? {
          id: `local-${normalized}`,
          tailor_user_id: tailorUserId,
          organization_id: organizationId ?? null,
          phone: hit.phone,
          customer_name: hit.customer_name,
        }
      : null;
  }

  await assertAuthenticatedUserId(tailorUserId);

  const db = getFirebaseFirestoreClient();
  const docId = customerDocId(tailorUserId, normalized, organizationId);
  const directSnap = await getDoc(doc(db, 'tailor_customers', docId));

  if (directSnap.exists()) {
    const data = directSnap.data();
    return {
      id: directSnap.id,
      tailor_user_id: String(data.tailor_user_id),
      organization_id: data.organization_id != null ? String(data.organization_id) : null,
      phone: String(data.phone),
      customer_name: String(data.customer_name),
    };
  }

  const snap = await getDocs(
    query(
      collection(db, 'tailor_customers'),
      where('tailor_user_id', '==', tailorUserId),
      where('phone', '==', normalized),
      limit(1)
    )
  );
  if (snap.empty) return null;

  const docSnap = snap.docs[0]!;
  const data = docSnap.data();
  return {
    id: docSnap.id,
    tailor_user_id: String(data.tailor_user_id),
    organization_id: data.organization_id != null ? String(data.organization_id) : null,
    phone: String(data.phone),
    customer_name: String(data.customer_name),
  };
}

export async function upsertTailorCustomer(
  tailorUserId: string,
  fullPhone: string,
  customerName: string,
  organizationId?: string | null
): Promise<void> {
  const phone = normalizeStoredPhone(fullPhone);
  const name = customerName.trim();
  if (!phone || !name) return;

  if (!isFirebaseConfigured()) {
    const list = readLocalCustomers().filter((c) => normalizeStoredPhone(c.phone) !== phone);
    list.unshift({ phone, customer_name: name });
    writeLocalCustomers(list);
    return;
  }

  await assertAuthenticatedUserId(tailorUserId);

  const db = getFirebaseFirestoreClient();
  const docId = customerDocId(tailorUserId, phone, organizationId);
  await setDoc(
    doc(db, 'tailor_customers', docId),
    {
      tailor_user_id: tailorUserId,
      phone,
      customer_name: name,
      organization_id: organizationId ?? null,
      updated_at: new Date().toISOString(),
    },
    { merge: true }
  );
}
