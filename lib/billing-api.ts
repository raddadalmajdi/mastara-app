import type { SubscriptionPlan, SubscriptionSummary } from '@/lib/subscription';

async function authHeaders(accessToken: string): Promise<HeadersInit> {
  return {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  };
}

export async function fetchBillingPlans(): Promise<SubscriptionPlan[]> {
  const res = await fetch('/api/billing/plans', { credentials: 'include' });
  const json = (await res.json()) as { ok?: boolean; plans?: SubscriptionPlan[] };
  return json.plans ?? [];
}

export async function fetchOrganizationSubscription(
  accessToken: string,
  organizationId: string
): Promise<SubscriptionSummary | null> {
  const res = await fetch(
    `/api/billing/subscription?organizationId=${encodeURIComponent(organizationId)}`,
    { headers: await authHeaders(accessToken), credentials: 'include' }
  );
  const json = (await res.json()) as { ok?: boolean; summary?: SubscriptionSummary };
  return json.summary ?? null;
}

export async function startBillingCheckout(
  accessToken: string,
  organizationId: string,
  planId: string
): Promise<{ checkoutUrl: string; chargeId: string }> {
  const res = await fetch('/api/billing/checkout', {
    method: 'POST',
    headers: await authHeaders(accessToken),
    credentials: 'include',
    body: JSON.stringify({ organizationId, planId }),
  });
  const json = (await res.json()) as {
    ok?: boolean;
    checkoutUrl?: string;
    chargeId?: string;
    message?: string;
  };
  if (!res.ok || !json.ok || !json.checkoutUrl) {
    throw new Error(json.message ?? 'تعذّر بدء الدفع.');
  }
  return { checkoutUrl: json.checkoutUrl, chargeId: json.chargeId ?? '' };
}

export async function confirmBillingReturn(
  accessToken: string,
  organizationId: string,
  chargeId: string
): Promise<{ ok: boolean; status?: string }> {
  const res = await fetch('/api/billing/confirm', {
    method: 'POST',
    headers: await authHeaders(accessToken),
    credentials: 'include',
    body: JSON.stringify({ organizationId, chargeId }),
  });
  const json = (await res.json()) as { ok?: boolean; status?: string; message?: string };
  if (!res.ok) {
    throw new Error(json.message ?? 'تعذّر تأكيد الدفع.');
  }
  return { ok: Boolean(json.ok), status: json.status };
}
