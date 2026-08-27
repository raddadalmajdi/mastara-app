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
const GCC_COUNTRY_CODES = ['965', '966', '971', '974', '973', '968'];
const PHONE_CORE_LEN = 8;

type LocalCustomer = {
  phone: string;
  customer_name: string;
  tailor_user_id?: string;
  organization_id?: string | null;
};

const memoryCustomers = new Map<string, LocalCustomer[]>();

function localCustomersKey(tailorUserId: string): string {
  return `esalak_tailor_customers_${tailorUserId}`;
}

export function normalizeStoredPhone(fullPhone: string): string {
  const mapped = String(fullPhone || '')
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
  return mapped.replace(/\D/g, '');
}

export function phoneSuffix(phone: string, length = PHONE_CORE_LEN): string {
  const digits = normalizeStoredPhone(phone);
  if (!digits) return '';
  return digits.length <= length ? digits : digits.slice(-length);
}

function stripKnownCountryCode(digits: string): string {
  for (const cc of GCC_COUNTRY_CODES) {
    if (digits.startsWith(cc) && digits.length - cc.length >= 7) {
      return digits.slice(cc.length);
    }
  }
  if (digits.startsWith('00') && digits.length > 9) {
    return stripKnownCountryCode(digits.slice(2));
  }
  return digits;
}

export function expandPhoneLookupKeys(fullPhone: string): string[] {
  const raw = normalizeStoredPhone(fullPhone);
  const keys = new Set<string>();
  if (!raw) return [];
  keys.add(raw);
  if (raw.startsWith('00')) keys.add(raw.slice(2));
  const local = stripKnownCountryCode(raw);
  keys.add(local);
  for (const cc of GCC_COUNTRY_CODES) {
    keys.add(`${cc}${local}`);
    keys.add(`+${cc}${local}`);
  }
  keys.add(phoneSuffix(raw, 8));
  keys.add(phoneSuffix(raw, 9));
  keys.add(phoneSuffix(local, 8));
  return [...keys].filter(Boolean);
}

export const MIN_CUSTOMER_PHONE_SEARCH_LENGTH = 4;
export const MIN_CUSTOMER_NAME_LOOKUP_LENGTH = 7;

export function isCustomerPhoneSearchable(localPhone: string): boolean {
  return normalizeStoredPhone(localPhone).length >= MIN_CUSTOMER_PHONE_SEARCH_LENGTH;
}

export function isCustomerNameLookupReady(localPhone: string): boolean {
  return normalizeStoredPhone(localPhone).length >= MIN_CUSTOMER_NAME_LOOKUP_LENGTH;
}

export function phoneMatchVariants(countryCode: string, localPhone: string): string[] {
  const local = normalizeStoredPhone(localPhone);
  const cc = normalizeStoredPhone(countryCode);
  return expandPhoneLookupKeys(cc ? `${cc}${local}` : local);
}

export function phonesMatch(a: string, b: string): boolean {
  const da = normalizeStoredPhone(a);
  const db = normalizeStoredPhone(b);
  if (!da || !db) return false;
  if (da === db) return true;

  const localA = stripKnownCountryCode(da);
  const localB = stripKnownCountryCode(db);
  if (localA && localB && localA === localB) return true;

  const coreLen = Math.min(PHONE_CORE_LEN, da.length, db.length);
  if (coreLen >= 7 && da.slice(-coreLen) === db.slice(-coreLen)) return true;
  if (da.length >= 8 && db.length >= 8 && da.slice(-8) === db.slice(-8)) return true;
  if (da.length >= 9 && db.length >= 9 && da.slice(-9) === db.slice(-9)) return true;

  return false;
}

function customerNameFromData(data: Record<string, unknown> | undefined): string {
  if (!data) return '';
  const raw = data.customer_name ?? data.name ?? data.customerName ?? data.client_name;
  return typeof raw === 'string' ? raw.trim() : '';
}

function phoneFromData(id: string, data: Record<string, unknown>): string {
  const raw = data.phone ?? data.customer_phone ?? data.mobile ?? data.phoneNumber;
  const fromFields = normalizeStoredPhone(String(raw ?? ''));
  if (fromFields) return fromFields;
  const trailing = String(id).match(/(\d{7,15})$/);
  return trailing ? trailing[1] : '';
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
    phone: phoneFromData(id, data),
    customer_name,
  };
}

function readStoredList(key: string): LocalCustomer[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || '[]') as LocalCustomer[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function mergeCustomerLists(...lists: LocalCustomer[][]): LocalCustomer[] {
  const merged: LocalCustomer[] = [];
  for (const list of lists) {
    for (const item of list) {
      if (!item?.customer_name?.trim() || !item.phone) continue;
      const idx = merged.findIndex((c) => phonesMatch(c.phone, item.phone));
      if (idx >= 0) {
        merged[idx] = { ...merged[idx], ...item, customer_name: item.customer_name.trim() };
      } else {
        merged.push({ ...item, customer_name: item.customer_name.trim() });
      }
    }
  }
  return merged;
}

function readLocalCustomers(tailorUserId: string): LocalCustomer[] {
  const fromMemory = memoryCustomers.get(tailorUserId) || [];
  const scoped = readStoredList(localCustomersKey(tailorUserId));
  const guest = tailorUserId !== GUEST_TAILOR_ID ? readStoredList(localCustomersKey(GUEST_TAILOR_ID)) : [];
  const legacy = readStoredList(LEGACY_LOCAL_CUSTOMERS_KEY);
  return mergeCustomerLists(fromMemory, scoped, guest, legacy);
}

function writeLocalCustomers(tailorUserId: string, list: LocalCustomer[]): void {
  memoryCustomers.set(tailorUserId, list.slice(0, 400));
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(localCustomersKey(tailorUserId), JSON.stringify(list.slice(0, 400)));
  } catch {
    /* private mode / quota */
  }
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

export function lookupTailorCustomerByPhoneSync(
  tailorUserId: string,
  fullPhone: string,
  organizationId?: string | null
): TailorCustomerRecord | null {
  const normalized = normalizeStoredPhone(fullPhone);
  if (!normalized) return null;
  const hit = readLocalCustomers(tailorUserId).find((c) => phonesMatch(c.phone, normalized));
  if (!hit?.customer_name?.trim()) return null;
  return {
    id: `local-${phoneSuffix(hit.phone)}`,
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

  const localHit = lookupTailorCustomerByPhoneSync(tailorUserId, normalized, organizationId);
  if (localHit) return localHit;

  if (!isFirebaseConfigured() || isGuestTailor(tailorUserId)) {
    return null;
  }

  try {
    await assertAuthenticatedUserId(tailorUserId);
  } catch {
    return localHit;
  }

  const db = getFirebaseFirestoreClient();
  const variants = expandPhoneLookupKeys(normalized);
  const orgKeys = Array.from(new Set([organizationId?.trim() || 'personal', 'personal']));

  for (const orgKey of orgKeys) {
    for (const variant of variants) {
      const digits = normalizeStoredPhone(variant);
      if (!digits) continue;
      const directSnap = await getDoc(
        doc(db, 'tailor_customers', customerDocId(tailorUserId, digits, orgKey === 'personal' ? null : orgKey))
      );
      if (directSnap.exists()) {
        const record = recordFromData(
          directSnap.id,
          directSnap.data() as Record<string, unknown>,
          tailorUserId,
          organizationId
        );
        if (record && phonesMatch(record.phone || digits, normalized)) {
          cacheLocalCustomer(tailorUserId, record.phone || digits, record.customer_name, record.organization_id);
          return record;
        }
      }
    }
  }

  const suffix = phoneSuffix(normalized, 8);
  if (suffix.length >= 7) {
    try {
      const suffixSnap = await getDocs(
        query(
          collection(db, 'tailor_customers'),
          where('tailor_user_id', '==', tailorUserId),
          where('phone_suffix', '==', suffix),
          limit(5)
        )
      );
      for (const docSnap of suffixSnap.docs) {
        const record = recordFromData(docSnap.id, docSnap.data() as Record<string, unknown>, tailorUserId, organizationId);
        if (record && phonesMatch(record.phone || suffix, normalized)) {
          cacheLocalCustomer(tailorUserId, record.phone || suffix, record.customer_name, record.organization_id);
          return record;
        }
      }
    } catch {
      /* index may not be deployed yet */
    }
  }

  for (const variant of variants) {
    const equalityValue = variant.startsWith('+') ? variant : normalizeStoredPhone(variant) || variant;
    try {
      const snap = await getDocs(
        query(
          collection(db, 'tailor_customers'),
          where('tailor_user_id', '==', tailorUserId),
          where('phone', '==', equalityValue),
          limit(5)
        )
      );
      for (const docSnap of snap.docs) {
        const record = recordFromData(docSnap.id, docSnap.data() as Record<string, unknown>, tailorUserId, organizationId);
        if (record && phonesMatch(record.phone || equalityValue, normalized)) {
          cacheLocalCustomer(tailorUserId, record.phone || String(equalityValue), record.customer_name, record.organization_id);
          return record;
        }
      }
    } catch {
      /* ignore query variant errors */
    }
  }

  const wideSnap = await getDocs(
    query(collection(db, 'tailor_customers'), where('tailor_user_id', '==', tailorUserId), limit(500))
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

  const localDigits = stripKnownCountryCode(phone);
  const suffix = phoneSuffix(localDigits || phone, 8);

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
    phone_local: localDigits,
    phone_suffix: suffix,
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
