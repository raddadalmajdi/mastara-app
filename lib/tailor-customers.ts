import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';

export type TailorCustomerRecord = {
  id: string;
  tailor_user_id: string;
  phone: string;
  customer_name: string;
};

const LOCAL_CUSTOMERS_KEY = 'mistarh_local_customers';

const FORBIDDEN_WRITE_COLUMNS = ['updated_at', 'created_at'] as const;

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

/** الحد الأدنى لأرقام الجوال المحلية قبل البحث في الفواتير أو دفتر العملاء. */
export const MIN_CUSTOMER_PHONE_SEARCH_LENGTH = 1;

export function isCustomerPhoneSearchable(localPhone: string): boolean {
  return localPhone.replace(/\D/g, '').length >= MIN_CUSTOMER_PHONE_SEARCH_LENGTH;
}

/** أشكال محتملة لرقم الجوال في الفواتير والدفتر (96550123456، +965…، 50123456). */
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

function isMissingSchemaColumn(error: PostgrestError, column: string): boolean {
  const msg = (error.message ?? '').toLowerCase();
  const col = column.toLowerCase();
  return msg.includes(col) || (error.code === 'PGRST204' && msg.includes(col));
}

async function assertTailorOwnsSession(
  supabase: SupabaseClient,
  tailorUserId: string
): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.id !== tailorUserId) {
    throw new Error('جهات الاتصال متاحة فقط لصاحب المحل المسجّل دخوله.');
  }
}

export async function lookupTailorCustomerByPhone(
  supabase: SupabaseClient | null,
  tailorUserId: string,
  fullPhone: string
): Promise<TailorCustomerRecord | null> {
  const normalized = normalizeStoredPhone(fullPhone);
  if (!normalized) return null;

  if (!supabase) {
    const hit = readLocalCustomers().find((c) => normalizeStoredPhone(c.phone) === normalized);
    return hit
      ? {
          id: `local-${normalized}`,
          tailor_user_id: tailorUserId,
          phone: hit.phone,
          customer_name: hit.customer_name,
        }
      : null;
  }

  await assertTailorOwnsSession(supabase, tailorUserId);

  const { data, error } = await supabase
    .from('tailor_customers')
    .select('id, tailor_user_id, phone, customer_name')
    .eq('tailor_user_id', tailorUserId)
    .eq('phone', normalized)
    .maybeSingle();

  if (error) {
    if (error.message.includes('tailor_customers') || error.code === 'PGRST204') {
      return null;
    }
    throw new Error(error.message);
  }

  return data as TailorCustomerRecord | null;
}

async function writeTailorCustomerRow(
  supabase: SupabaseClient,
  tailorUserId: string,
  phone: string,
  customerName: string
): Promise<PostgrestError | null> {
  const row = {
    tailor_user_id: tailorUserId,
    phone,
    customer_name: customerName,
  };

  const existing = await supabase
    .from('tailor_customers')
    .select('id')
    .eq('tailor_user_id', tailorUserId)
    .eq('phone', phone)
    .maybeSingle();

  if (existing.error && !isMissingSchemaColumn(existing.error, 'updated_at')) {
    return existing.error;
  }

  if (existing.data?.id) {
    const { error } = await supabase
      .from('tailor_customers')
      .update({ customer_name: customerName })
      .eq('id', existing.data.id);
    return error;
  }

  const { error } = await supabase.from('tailor_customers').insert(row);
  return error;
}

export async function upsertTailorCustomer(
  supabase: SupabaseClient | null,
  tailorUserId: string,
  fullPhone: string,
  customerName: string
): Promise<void> {
  const phone = normalizeStoredPhone(fullPhone);
  const name = customerName.trim();
  if (!phone || !name) return;

  if (!supabase) {
    const list = readLocalCustomers().filter((c) => normalizeStoredPhone(c.phone) !== phone);
    list.unshift({ phone, customer_name: name });
    writeLocalCustomers(list);
    return;
  }

  await assertTailorOwnsSession(supabase, tailorUserId);

  let error = await writeTailorCustomerRow(supabase, tailorUserId, phone, name);

  if (error && FORBIDDEN_WRITE_COLUMNS.some((col) => isMissingSchemaColumn(error!, col))) {
    error = await writeTailorCustomerRow(supabase, tailorUserId, phone, name);
  }

  if (error) {
    if (error.message.includes('tailor_customers') || error.code === 'PGRST204') {
      throw new Error(
        'جدول tailor_customers غير موجود. نفّذ migration من supabase/migrations/20260729190000_tailor_shop_name_and_customers.sql.'
      );
    }
    throw new Error(error.message);
  }
}
