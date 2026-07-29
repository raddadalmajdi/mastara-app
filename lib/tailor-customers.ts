import type { SupabaseClient } from '@supabase/supabase-js';

export type TailorCustomerRecord = {
  id: string;
  tailor_user_id: string;
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

function normalizeStoredPhone(fullPhone: string): string {
  return fullPhone.replace(/\D/g, '');
}

export async function lookupTailorCustomerByPhone(
  supabase: SupabaseClient | null,
  tailorUserId: string,
  fullPhone: string
): Promise<TailorCustomerRecord | null> {
  const normalized = normalizeStoredPhone(fullPhone);
  if (!normalized) return null;

  if (!supabase) {
    const hit = readLocalCustomers().find((c) => c.phone.replace(/\D/g, '') === normalized);
    return hit
      ? {
          id: `local-${normalized}`,
          tailor_user_id: tailorUserId,
          phone: hit.phone,
          customer_name: hit.customer_name,
        }
      : null;
  }

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
    const list = readLocalCustomers().filter((c) => c.phone.replace(/\D/g, '') !== phone);
    list.unshift({ phone, customer_name: name });
    writeLocalCustomers(list);
    return;
  }

  const { error } = await supabase.from('tailor_customers').upsert(
    {
      tailor_user_id: tailorUserId,
      phone,
      customer_name: name,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'tailor_user_id,phone' }
  );

  if (error) {
    if (error.message.includes('tailor_customers') || error.code === 'PGRST204') {
      throw new Error(
        'جدول tailor_customers غير موجود. نفّذ migration من supabase/migrations/20260729190000_tailor_shop_name_and_customers.sql.'
      );
    }
    throw new Error(error.message);
  }
}
