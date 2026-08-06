'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AppBrand } from '@/components/brand/AppBrand';
import { useOrganization } from '@/components/organization/OrganizationProvider';
import {
  fetchBillingPlans,
  fetchOrganizationSubscription,
  startBillingCheckout,
} from '@/lib/billing-api';
import {
  formatPlanPrice,
  SUBSCRIPTION_STATUS_LABELS,
  type SubscriptionPlan,
  type SubscriptionSummary,
} from '@/lib/subscription';
import { getSupabaseBrowserClient, isSupabaseConfigured } from '@/lib/supabase-browser';

function statusBadgeClass(status: SubscriptionSummary['subscription']['status']): string {
  switch (status) {
    case 'active':
      return 'bg-emerald-100 text-emerald-800 border-emerald-200';
    case 'trialing':
      return 'bg-sky-100 text-sky-800 border-sky-200';
    case 'past_due':
      return 'bg-amber-100 text-amber-900 border-amber-200';
    case 'canceled':
      return 'bg-red-100 text-red-800 border-red-200';
    default:
      return 'bg-mistara-cream text-mistara-brown border-mistara-brown/20';
  }
}

export default function BillingPage() {
  const router = useRouter();
  const supabase = useMemo(() => (isSupabaseConfigured() ? getSupabaseBrowserClient() : null), []);
  const { organizationId, organization, role, loading: orgLoading } = useOrganization();

  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [summary, setSummary] = useState<SubscriptionSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkoutPlanId, setCheckoutPlanId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null
  );

  const loadBilling = useCallback(async () => {
    if (!supabase || !organizationId) return;

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      router.replace('/');
      return;
    }

    setAccessToken(session.access_token);

    const [planList, subSummary] = await Promise.all([
      fetchBillingPlans(),
      fetchOrganizationSubscription(session.access_token, organizationId),
    ]);

    setPlans(planList);
    setSummary(subSummary);
    setLoading(false);
  }, [organizationId, router, supabase]);

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      router.replace('/');
      return;
    }
    if (orgLoading) return;
    if (!organizationId) {
      setLoading(false);
      return;
    }
    void loadBilling();
  }, [loadBilling, orgLoading, organizationId, router]);

  const handleUpgrade = async (planId: string) => {
    if (!accessToken || !organizationId) return;
    if (role !== 'owner') {
      setFeedback({ type: 'error', message: 'فقط مالك المحل يمكنه ترقية الاشتراك.' });
      return;
    }

    setCheckoutPlanId(planId);
    setFeedback(null);
    try {
      const { checkoutUrl } = await startBillingCheckout(accessToken, organizationId, planId);
      window.location.href = checkoutUrl;
    } catch (error) {
      setFeedback({
        type: 'error',
        message: error instanceof Error ? error.message : 'تعذّر بدء الدفع.',
      });
      setCheckoutPlanId(null);
    }
  };

  const currentPlanId = summary?.plan.id;
  const paidPlans = plans.filter((p) => p.billing_interval !== 'free' && p.price_amount > 0);

  return (
    <div className="min-h-screen bg-mistara-sand text-mistara-espresso" dir="rtl">
      <header className="sticky top-0 z-40 glass-header px-4 py-3 border-b border-mistara-gold/20">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <AppBrand size="sm" layout="row" showTitle subtitle={null} />
          <Link
            href="/"
            className="rounded-xl border border-primary/20 bg-white/70 px-3 py-2 text-xs font-bold text-primary-dark"
          >
            ← لوحة العمل
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6 space-y-6">
        <div>
          <h1 className="text-xl font-black text-mistara-espresso">الاشتراك والفوترة</h1>
          <p className="mt-1 text-sm text-mistara-brown/80">
            إدارة باقة محل{' '}
            <span className="font-bold">{organization?.name ?? '—'}</span> — الدفع عبر Tap (مدى،
            Apple Pay، بطاقات).
          </p>
        </div>

        {feedback && (
          <p
            role="status"
            className={`rounded-xl border px-4 py-3 text-sm font-bold ${
              feedback.type === 'success'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                : 'border-red-200 bg-red-50 text-red-800'
            }`}
          >
            {feedback.message}
          </p>
        )}

        {loading || orgLoading ? (
          <div className="glass-panel rounded-2xl p-8 text-center text-sm text-mistara-brown/70">
            جاري تحميل بيانات الاشتراك...
          </div>
        ) : !organizationId ? (
          <div className="glass-panel rounded-2xl p-8 text-center text-sm text-mistara-brown/80">
            لم يُعثر على منظمة مرتبطة بحسابك. سجّل الدخول مجدداً أو تواصل مع الدعم.
          </div>
        ) : (
          <>
            {summary && (
              <section className="glass-panel rounded-2xl border border-mistara-gold/25 p-5 space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold text-mistara-gold">الباقة الحالية</p>
                    <h2 className="text-lg font-black">{summary.plan.name_ar}</h2>
                    <p className="text-sm text-mistara-brown/75">{summary.plan.description_ar}</p>
                  </div>
                  <span
                    className={`rounded-full border px-3 py-1 text-xs font-black ${statusBadgeClass(summary.subscription.status)}`}
                  >
                    {SUBSCRIPTION_STATUS_LABELS[summary.subscription.status]}
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 text-sm">
                  <div className="rounded-xl bg-mistara-cream/70 px-3 py-2.5">
                    <p className="text-xs font-bold text-mistara-gold">السعر</p>
                    <p className="font-black tnum">{formatPlanPrice(summary.plan)}</p>
                  </div>
                  {summary.subscription.current_period_end && (
                    <div className="rounded-xl bg-mistara-cream/70 px-3 py-2.5">
                      <p className="text-xs font-bold text-mistara-gold">ينتهي في</p>
                      <p className="font-black tnum" dir="ltr">
                        {new Date(summary.subscription.current_period_end).toLocaleDateString('ar-SA')}
                      </p>
                    </div>
                  )}
                  {summary.daysUntilTrialEnd != null && summary.subscription.status === 'trialing' && (
                    <div className="rounded-xl bg-sky-50 px-3 py-2.5 border border-sky-100">
                      <p className="text-xs font-bold text-sky-700">أيام التجربة المتبقية</p>
                      <p className="font-black tnum text-sky-900">{summary.daysUntilTrialEnd} يوم</p>
                    </div>
                  )}
                </div>

                <ul className="space-y-1.5">
                  {summary.plan.features.map((feature) => (
                    <li key={feature} className="flex items-center gap-2 text-sm font-bold">
                      <span className="text-primary">✓</span>
                      {feature}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section className="space-y-3">
              <h2 className="text-base font-black">ترقية الباقة</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                {paidPlans.map((plan) => {
                  const isCurrent = plan.id === currentPlanId && summary?.subscription.status === 'active';
                  const isProcessing = checkoutPlanId === plan.id;
                  return (
                    <article
                      key={plan.id}
                      className="glass-panel flex flex-col rounded-2xl border border-primary/15 p-5 shadow-sm"
                    >
                      <h3 className="text-base font-black text-primary-dark">{plan.name_ar}</h3>
                      <p className="mt-1 text-2xl font-black tnum text-mistara-espresso">
                        {formatPlanPrice(plan)}
                      </p>
                      <p className="mt-2 min-h-[2.5rem] text-xs leading-relaxed text-mistara-brown/75">
                        {plan.description_ar}
                      </p>
                      <ul className="mt-3 flex-1 space-y-1">
                        {plan.features.slice(0, 4).map((f) => (
                          <li key={f} className="text-xs font-bold text-mistara-brown">
                            • {f}
                          </li>
                        ))}
                      </ul>
                      <button
                        type="button"
                        disabled={isCurrent || isProcessing || role !== 'owner'}
                        onClick={() => void handleUpgrade(plan.id)}
                        className="mt-4 w-full rounded-xl bg-primary py-3 text-sm font-black text-white shadow-md disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {isCurrent
                          ? 'الباقة الحالية'
                          : isProcessing
                            ? 'جاري التحويل للدفع...'
                            : 'ترقية والدفع'}
                      </button>
                    </article>
                  );
                })}
              </div>
              {role !== 'owner' && (
                <p className="text-xs font-bold text-amber-800">
                  أنت عضو في المحل — الترقية متاحة لمالك الحساب فقط.
                </p>
              )}
            </section>

            <p className="text-[11px] leading-relaxed text-mistara-brown/60">
              يتم الدفع عبر Tap Payments. طرق الدفع المدعومة تشمل مدى (Mada) وApple Pay والبطاقات
              البنكية. بعد إتمام الدفع يُحدَّث اشتراك المحل تلقائياً.
            </p>
          </>
        )}
      </main>
    </div>
  );
}
