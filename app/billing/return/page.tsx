'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AppBrand } from '@/components/brand/AppBrand';
import { useOrganization } from '@/components/organization/OrganizationProvider';
import { resolveClientSession } from '@/lib/auth-session-client';
import { confirmBillingReturn } from '@/lib/billing-api';
import { isFirebaseConfigured } from '@/lib/firebase-auth-client';

function BillingReturnInner() {
  const params = useSearchParams();
  const { organizationId, loading: orgLoading } = useOrganization();

  const [message, setMessage] = useState('جاري تأكيد عملية الدفع...');
  const [success, setSuccess] = useState<boolean | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (orgLoading) return;

    if (!isFirebaseConfigured()) {
      setSuccess(false);
      setDone(true);
      setMessage('إعداد Firebase غير متاح — تعذّر تأكيد الدفع.');
      return;
    }

    const chargeId =
      params.get('tap_id') ?? params.get('charge_id') ?? params.get('id') ?? '';

    if (!chargeId) {
      setSuccess(false);
      setDone(true);
      setMessage('لم يُرسل معرف العملية. راجع صفحة الاشتراك.');
      return;
    }

    if (!organizationId) {
      void (async () => {
        const sessionResult = await resolveClientSession();
        setSuccess(false);
        setDone(true);
        setMessage(
          !sessionResult.ok && sessionResult.reason === 'no_session'
            ? 'يلزم تسجيل الدخول لتأكيد الدفع.'
            : 'لم يُعثر على منظمة مرتبطة بحسابك.'
        );
      })();
      return;
    }

    void (async () => {
      const sessionResult = await resolveClientSession();

      if (!sessionResult.ok) {
        setSuccess(false);
        setDone(true);
        setMessage(sessionResult.message);
        return;
      }

      try {
        const result = await confirmBillingReturn(
          sessionResult.accessToken,
          organizationId,
          chargeId
        );
        setDone(true);
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
        setDone(true);
        const errMsg = error instanceof Error ? error.message : 'تعذّر تأكيد الدفع.';
        console.warn('[billing/return] confirm failed:', errMsg);
        setMessage(errMsg);
      }
    })();
  }, [organizationId, orgLoading, params]);

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
        {done && !success && (
          <Link href="/" className="inline-block text-xs font-bold text-primary underline">
            تسجيل الدخول
          </Link>
        )}
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
