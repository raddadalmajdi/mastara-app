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

const LEGACY_LOCAL_CUSTOMERS_KEY = 'mistarh_local_customers';
const GUEST_TAILOR_ID = 'guest-local-user';

type LocalCustomer = {
  phone: string;
  customer_name: string;
  tailor_user_id?: string;
  organization_id?: string | null;
};

function localCustomersKey(tailorUserId: string): string {
  return `esalak_tailor_customers_${tailorUserId}`;
}

function readLocalCustomers(tailorUserId: string): LocalCustomer[] {
  if (typeof window === 'undefined') return [];
  try {
    const scoped = JSON.parse(localStorage.getItem(localCustomersKey(tailorUserId)) || '[]') as LocalCustomer[];
    if (Array.isArray(scoped) && scoped.length > 0) return scoped;
    const legacy = JSON.parse(localStorage.getItem(LEGACY_LOCAL_CUSTOMERS_KEY) || '[]') as LocalCustomer[];
    return Array.isArray(legacy) ? legacy : [];
  } catch {
    return [];
  }
}

function writeLocalCustomers(tailorUserId: string, list: LocalCustomer[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(localCustomersKey(tailorUserId), JSON.stringify(list.slice(0, 400)));
}

function cacheLocalCustomer(
  tailorUserId: string,
  phone: string,
  customerName: string,
  organizationId?: string | null
): void {
  const name = customerName.trim();
  const normalized = normalizeStoredPhone(phone);
  if (!normalized || !name) return;
  const list = readLocalCustomers(tailorUserId).filter((c) => !phonesMatch(c.phone, normalized));
  list.unshift({
    phone: normalized,
    customer_name: name,
    tailor_user_id: tailorUserId,
    organization_id: organizationId ?? null,
  });
  writeLocalCustomers(tailorUserId, list);
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

function customerNameFromData(data: Record<string, unknown> | undefined): string {
  if (!data) return '';
  const raw = data.customer_name ?? data.name ?? data.customerName ?? data.client_name;
  return typeof raw === 'string' ? raw.trim() : '';
}

function recordFromData(
  id: string,
  data: Record<string, unknown>,
  fallbackTailorId: string,
  fallbackOrg?: string | null
): TailorCustomerRecord | null {
  const customer_name = customerNameFromData(data);
  if (!customer_name) return null;
  return {
    id,
    tailor_user_id: String(data.tailor_user_id || fallbackTailorId),
    organization_id:
      data.organization_id != null && String(data.organization_id).trim()
        ? String(data.organization_id)
        : fallbackOrg ?? null,
    phone: normalizeStoredPhone(String(data.phone || '')),
    customer_name,
  };
}

function findLocalCustomer(
  tailorUserId: string,
  fullPhone: string,
  organizationId?: string | null
): TailorCustomerRecord | null {
  const hit = readLocalCustomers(tailorUserId).find((c) => phonesMatch(c.phone, fullPhone));
  if (!hit?.customer_name?.trim()) return null;
  return {
    id: `local-${normalizeStoredPhone(hit.phone)}`,
    tailor_user_id: tailorUserId,
    organization_id: organizationId ?? hit.organization_id ?? null,
    phone: hit.phone,
    customer_name: hit.customer_name.trim(),
  };
}

function isGuestTailor(tailorUserId: string): boolean {
  return !tailorUserId || tailorUserId === GUEST_TAILOR_ID;
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

  const localHit = findLocalCustomer(tailorUserId, normalized, organizationId);

  if (!isFirebaseConfigured() || isGuestTailor(tailorUserId)) {
    return localHit;
  }

  try {
    await assertAuthenticatedUserId(tailorUserId);
  } catch {
    return localHit;
  }

  const db = getFirebaseFirestoreClient();
  const variants = Array.from(
    new Set([normalized, ...phoneMatchVariants('', normalized)].map((v) => normalizeStoredPhone(v) || v))
  ).filter(Boolean);

  for (const variant of variants) {
    const digits = normalizeStoredPhone(variant);
    if (!digits) continue;
    const directSnap = await getDoc(doc(db, 'tailor_customers', customerDocId(tailorUserId, digits, organizationId)));
    if (directSnap.exists()) {
      const record = recordFromData(directSnap.id, directSnap.data() as Record<string, unknown>, tailorUserId, organizationId);
      if (record) {
        cacheLocalCustomer(tailorUserId, record.phone, record.customer_name, record.organization_id);
        return record;
      }
    }
  }

  for (const variant of variants) {
    const snap = await getDocs(
      query(
        collection(db, 'tailor_customers'),
        where('tailor_user_id', '==', tailorUserId),
        where('phone', '==', variant),
        limit(5)
      )
    );
    for (const docSnap of snap.docs) {
      const record = recordFromData(docSnap.id, docSnap.data() as Record<string, unknown>, tailorUserId, organizationId);
      if (record && phonesMatch(record.phone, normalized)) {
        cacheLocalCustomer(tailorUserId, record.phone, record.customer_name, record.organization_id);
        return record;
      }
    }
  }

  const wideSnap = await getDocs(
    query(collection(db, 'tailor_customers'), where('tailor_user_id', '==', tailorUserId), limit(80))
  );
  for (const docSnap of wideSnap.docs) {
    const record = recordFromData(docSnap.id, docSnap.data() as Record<string, unknown>, tailorUserId, organizationId);
    if (record && phonesMatch(record.phone, normalized)) {
      cacheLocalCustomer(tailorUserId, record.phone, record.customer_name, record.organization_id);
      return record;
    }
  }

  return localHit;
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

  cacheLocalCustomer(tailorUserId, phone, name, organizationId);

  if (!isFirebaseConfigured() || isGuestTailor(tailorUserId)) {
    return;
  }

  await assertAuthenticatedUserId(tailorUserId);

  const db = getFirebaseFirestoreClient();
  const docId = customerDocId(tailorUserId, phone, organizationId);
  const existing = await getDoc(doc(db, 'tailor_customers', docId));
  const payload: Record<string, unknown> = {
    tailor_user_id: tailorUserId,
    phone,
    customer_name: name,
    name,
    organization_id: organizationId ?? null,
    updated_at: new Date().toISOString(),
  };
  if (!existing.exists()) {
    payload.created_at = new Date().toISOString();
  }

  await setDoc(doc(db, 'tailor_customers', docId), payload, { merge: true });
}
