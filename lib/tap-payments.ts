import { createHmac, timingSafeEqual } from 'crypto';
import { getAppPublicUrl } from '@/lib/app-env';

export type TapChargeStatus =
  | 'INITIATED'
  | 'ABANDONED'
  | 'CANCELLED'
  | 'FAILED'
  | 'DECLINED'
  | 'RESTRICTED'
  | 'CAPTURED'
  | 'VOID'
  | 'TIMEDOUT'
  | 'UNKNOWN';

export type TapChargeResponse = {
  id: string;
  status: TapChargeStatus;
  amount: number;
  currency: string;
  transaction?: { url?: string; created?: string | number };
  reference?: { gateway?: string; payment?: string };
  customer?: { id?: string; email?: string; first_name?: string; last_name?: string };
  metadata?: Record<string, string>;
  redirect?: { url?: string; status?: string };
};

export type CreateTapCheckoutParams = {
  amount: number;
  currency: string;
  description: string;
  customer: {
    first_name: string;
    last_name?: string;
    email: string;
    phone?: { country_code: string; number: string };
  };
  metadata: Record<string, string>;
  redirectUrl: string;
  webhookUrl: string;
};

function getTapSecretKey(): string {
  const key = process.env.TAP_SECRET_KEY?.trim();
  if (!key) {
    throw new Error('TAP_SECRET_KEY غير مضبوط على الخادم.');
  }
  return key;
}

export function isTapConfigured(): boolean {
  return Boolean(process.env.TAP_SECRET_KEY?.trim());
}

export function getBillingSiteUrl(): string {
  return getAppPublicUrl();
}

/** SAR/KWD etc. — Tap expects standard decimal places per currency. */
export function formatTapAmount(amount: number, currency: string): number {
  const decimals: Record<string, number> = {
    SAR: 2,
    AED: 2,
    QAR: 2,
    USD: 2,
    EUR: 2,
    GBP: 2,
    EGP: 2,
    KWD: 3,
    BHD: 3,
    OMR: 3,
    JOD: 3,
  };
  const places = decimals[currency.toUpperCase()] ?? 2;
  return Number(amount.toFixed(places));
}

export async function createTapCharge(params: CreateTapCheckoutParams): Promise<TapChargeResponse> {
  const secretKey = getTapSecretKey();
  const amount = formatTapAmount(params.amount, params.currency);

  const body = {
    amount,
    currency: params.currency.toUpperCase(),
    customer_initiated: true,
    threeDSecure: true,
    save_card: false,
    description: params.description,
    metadata: params.metadata,
    customer: {
      first_name: params.customer.first_name,
      last_name: params.customer.last_name ?? '',
      email: params.customer.email,
      ...(params.customer.phone ? { phone: params.customer.phone } : {}),
    },
    source: { id: 'src_all' },
    redirect: { url: params.redirectUrl },
    post: { url: params.webhookUrl },
  };

  const response = await fetch('https://api.tap.company/v2/charges', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const json = (await response.json()) as TapChargeResponse & {
    errors?: Array<{ description?: string }>;
    message?: string;
  };

  if (!response.ok) {
    const detail =
      json.errors?.[0]?.description ?? json.message ?? `Tap API ${response.status}`;
    throw new Error(detail);
  }

  return json;
}

export async function retrieveTapCharge(chargeId: string): Promise<TapChargeResponse> {
  const secretKey = getTapSecretKey();
  const response = await fetch(`https://api.tap.company/v2/charges/${encodeURIComponent(chargeId)}`, {
    headers: { Authorization: `Bearer ${secretKey}` },
  });

  const json = (await response.json()) as TapChargeResponse & { message?: string };
  if (!response.ok) {
    throw new Error(json.message ?? `Tap retrieve failed (${response.status})`);
  }
  return json;
}

/** Validates Tap webhook hashstring per official docs. */
export function verifyTapWebhookHash(params: {
  charge: TapChargeResponse;
  hashstringHeader: string | null;
}): boolean {
  const secretKey = process.env.TAP_SECRET_KEY?.trim();
  if (!secretKey || !params.hashstringHeader) return false;

  const { charge } = params;
  const amount = formatTapAmount(charge.amount, charge.currency);
  const gatewayRef = charge.reference?.gateway ?? '';
  const paymentRef = charge.reference?.payment ?? '';
  const created = String(charge.transaction?.created ?? '');

  const toBeHashedString =
    'x_id' +
    charge.id +
    'x_amount' +
    amount +
    'x_currency' +
    charge.currency +
    'x_gateway_reference' +
    gatewayRef +
    'x_payment_reference' +
    paymentRef +
    'x_status' +
    charge.status +
    'x_created' +
    created;

  const computed = createHmac('sha256', secretKey).update(toBeHashedString).digest('hex');

  try {
    const a = Buffer.from(computed, 'utf8');
    const b = Buffer.from(params.hashstringHeader, 'utf8');
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return computed === params.hashstringHeader;
  }
}

export function isTapChargeSuccessful(status: TapChargeStatus): boolean {
  return status === 'CAPTURED';
}

export function isTapChargeFailed(status: TapChargeStatus): boolean {
  return ['FAILED', 'DECLINED', 'CANCELLED', 'RESTRICTED', 'VOID', 'TIMEDOUT'].includes(status);
}
