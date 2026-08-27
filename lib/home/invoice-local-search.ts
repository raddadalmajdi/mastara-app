import { getCached } from '@/lib/client-cache';
import type { CustomerInvoice } from '@/lib/home/types';
import { normalizeStoredPhone, phonesMatch } from '@/lib/tailor-customers';
import type { InvoiceRecord } from '@/lib/upload-scanned-invoice';

function toCustomerInvoice(record: InvoiceRecord | CustomerInvoice): CustomerInvoice {
  return {
    id: record.id,
    customer_phone: record.customer_phone,
    image_url: record.image_url,
    pdf_url: record.pdf_url ?? null,
    created_at: record.created_at,
  };
}

function filterByVariants(invoices: CustomerInvoice[], variants: string[]): CustomerInvoice[] {
  return invoices.filter((inv) =>
    variants.some((variant) => phonesMatch(String(inv.customer_phone ?? ''), variant))
  );
}

function mergeInvoices(into: Map<string, CustomerInvoice>, list: CustomerInvoice[]): void {
  for (const inv of list) {
    if (inv?.id) into.set(inv.id, inv);
  }
}

/** بحث فوري من الذاكرة المحلية وlocalStorage — بلا انتظار شبكة. */
export function searchInvoicesInstant(params: {
  userId: string | null;
  organizationId: string | null;
  variants: string[];
  fullPhone: string;
}): CustomerInvoice[] {
  const merged = new Map<string, CustomerInvoice>();
  const { userId, organizationId, variants } = params;

  if (typeof window !== 'undefined') {
    try {
      const raw = JSON.parse(localStorage.getItem('mistarh_local_invoices') || '[]') as CustomerInvoice[];
      if (Array.isArray(raw)) {
        mergeInvoices(merged, filterByVariants(raw, variants));
      }
    } catch {
      /* ignore corrupt local cache */
    }
  }

  if (userId) {
    const phoneKeys = new Set<string>();
    const normalizedFull = normalizeStoredPhone(params.fullPhone);
    if (normalizedFull) phoneKeys.add(normalizedFull);
    for (const variant of variants) {
      const n = normalizeStoredPhone(variant);
      if (n) phoneKeys.add(n);
    }

    for (const phone of phoneKeys) {
      const scopedKey = organizationId
        ? `inv:org:${organizationId}:${phone}`
        : `inv:${userId}:${phone}`;
      const scopedHit = getCached<InvoiceRecord[]>(scopedKey);
      if (scopedHit?.length) {
        mergeInvoices(merged, scopedHit.map(toCustomerInvoice));
      }
    }

    const allKey = organizationId ? `inv:org:${organizationId}:all` : `inv:${userId}:all`;
    const allHit = getCached<InvoiceRecord[]>(allKey);
    if (allHit?.length) {
      mergeInvoices(merged, filterByVariants(allHit.map(toCustomerInvoice), variants));
    }
  }

  return [...merged.values()].sort(
    (a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime()
  );
}
