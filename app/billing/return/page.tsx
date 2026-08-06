'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { AppBrand } from '@/components/brand/AppBrand';
import { useOrganization } from '@/components/organization/OrganizationProvider';
import { confirmBillingReturn } from '@/lib/billing-api';
import { getSupabaseBrowserClient, isSupabaseConfigured } from '@/lib/supabase-browser';

function BillingReturnInner() {
  const router = useRouter();
  const params = useSearchParams();
  const supabase = useMemo(() => (isSupabaseConfigured() ? getSupabaseBrowserClient() : null), []);
  const { organizationId } = useOrganization();

  const [message, setMessage] = useState('جاري تأكيد عملية الدفع...');
  const [success, setSuccess] = useState<boolean | null>(null);

  useEffect(() => {
    if (!supabase || !organizationId) return;

    const chargeId =
      params.get('tap_id') ??
      params.get('charge_id') ??
      params.get('id') ??
      '';

    if (!chargeId) {
      setSuccess(false);
      setMessage('لم يُرسل معرف العملية. راجع صفحة الاشتراك.');
      return;
    }

    void (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        router.replace('/');
        return;
      }

      try {
        const result = await confirmBillingReturn(
          session.access_token,
          organizationId,
          chargeId
        );
        if (result.ok) {
          setSuccess(true);
          setMessage('تم تفعيل اشتراكك بنجاح! شكراً لك.');
        } else {
          setSuccess(false);
          setMessage(
            result.status === 'CAPTURED'
              ? 'تم الدفع — جاري مزامنة الاشتراك. ارجع لصفحة الفوترة خلال لحظات.'
              : 'لم تكتمل عملية الدفع. يمكنك المحاولة مجدداً من صفحة الاشتراك.'
          );
        }
      } catch (error) {
        setSuccess(false);
        setMessage(error instanceof Error ? error.message : 'تعذّر تأكيد الدفع.');
      }
    })();
  }, [organizationId, params, router, supabase]);

  return (
    <div className="min-h-screen bg-mistara-sand flex flex-col items-center justify-center px-4" dir="rtl">
      <div className="w-full max-w-md glass-panel rounded-3xl border border-mistara-gold/25 p-8 text-center space-y-4">
        <AppBrand size="sm" layout="column" showTitle subtitle={null} />
        <div
          className={`mx-auto flex h-14 w-14 items-center justify-center rounded-full ${
            success === true
              ? 'bg-emerald-100 text-emerald-700'
              : success === false
                ? 'bg-red-100 text-red-700'
                : 'bg-primary/10 text-primary'
          }`}
        >
          {success === null ? (
            <span className="h-6 w-6 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
          ) : success ? (
            '✓'
          ) : (
            '!'
          )}
        </div>
        <p className="text-sm font-bold leading-relaxed">{message}</p>
        <Link
          href="/billing"
          className="inline-block rounded-xl bg-primary px-6 py-3 text-sm font-black text-white"
        >
          العودة للاشتراك
        </Link>
      </div>
    </div>
  );
}

export default function BillingReturnPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center text-sm font-bold" dir="rtl">
          جاري التحميل...
        </div>
      }
    >
      <BillingReturnInner />
    </Suspense>
  );
}
