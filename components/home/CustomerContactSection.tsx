'use client';

import { COUNTRY_CODES } from '@/lib/home/constants';
import type { CustomerBookStatus } from '@/lib/home/types';
import type { InvoiceSaveUiPhase } from '@/components/invoices/InvoiceSaveProgressRing';
import { isCustomerPhoneSearchable, normalizeStoredPhone } from '@/lib/tailor-customers';

type CustomerContactSectionProps = {
  customerLocalPhone: string;
  customerCountryCode: string;
  customerDisplayName: string;
  onPhoneChange: (value: string) => void;
  onCountryCodeChange: (code: string) => void;
  onDisplayNameChange: (value: string) => void;
  customerBookStatus: CustomerBookStatus;
  customerNameLocked: boolean;
  customerNameEditing: boolean;
  onStartNameEdit: () => void;
  onSaveContact: () => void;
  isSearchingInvoices: boolean;
  customerInvoicesCount: number;
  uploadSaveError: string | null;
  uploadSavePhase: InvoiceSaveUiPhase;
};

export function CustomerContactSection({
  customerLocalPhone,
  customerCountryCode,
  customerDisplayName,
  onPhoneChange,
  onCountryCodeChange,
  onDisplayNameChange,
  customerBookStatus,
  customerNameLocked,
  customerNameEditing,
  onStartNameEdit,
  onSaveContact,
  isSearchingInvoices,
  customerInvoicesCount,
  uploadSaveError,
  uploadSavePhase,
}: CustomerContactSectionProps) {
  return (
    <section className="dashboard-contact-card space-y-[clamp(0.875rem,3.5vw,1.25rem)]">
      <header>
        <h2 className="dashboard-contact-title">إدخال بيانات العميل</h2>
        <p className="text-[clamp(0.75rem,3.2vw,0.875rem)] leading-relaxed text-mistara-brown/75">
          اكتب رقم جوال العميل أولاً — ستظهر لوحة الأرقام تلقائياً على الهاتف.
        </p>
      </header>

      <div className="space-y-2">
        <label htmlFor="customer-phone" className="auth-field-label block">
          رقم هاتف العميل
        </label>
        <div className="auth-phone-row">
          <input
            id="customer-phone"
            type="tel"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="tel-national"
            enterKeyHint="done"
            value={customerLocalPhone}
            onChange={(e) => onPhoneChange(normalizeStoredPhone(e.target.value))}
            placeholder="50123456"
            className="auth-phone-input--hero tnum text-right font-mono"
            dir="ltr"
          />
          <select
            id="customer-country-code"
            value={customerCountryCode}
            onChange={(e) => onCountryCodeChange(e.target.value)}
            className="auth-phone-select--hero tnum font-mono"
            aria-label="رمز الدولة"
          >
            {COUNTRY_CODES.map((c) => (
              <option key={c.code} value={c.code}>
                +{c.code}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-2">
        <label htmlFor="customer-name" className="auth-field-label block">
          اسم العميل
        </label>
        <div className="flex items-stretch gap-2">
          <input
            id="customer-name"
            type="text"
            autoComplete="name"
            enterKeyHint="next"
            value={customerDisplayName}
            onChange={(e) => onDisplayNameChange(e.target.value)}
            readOnly={customerNameLocked && !customerNameEditing}
            placeholder="اكتب اسم العميل هنا..."
            className={`auth-field-input min-h-[clamp(3rem,11vw,3.5rem)] font-bold ${
              customerNameLocked && !customerNameEditing ? 'cursor-default bg-mistara-sand/60 opacity-90' : ''
            }`}
          />
          {customerBookStatus === 'known' && customerDisplayName.trim() && !customerNameEditing && (
            <button
              type="button"
              onClick={onStartNameEdit}
              className="shrink-0 rounded-xl border border-primary/25 bg-mistara-sand px-3.5 text-primary transition-colors touch-manipulation hover:bg-primary/10"
              aria-label="تعديل اسم العميل"
              title="تعديل الاسم"
            >
              ✏️
            </button>
          )}
        </div>
      </div>

      {isCustomerPhoneSearchable(customerLocalPhone) &&
        customerDisplayName.trim() &&
        customerBookStatus === 'new' && (
          <button
            type="button"
            onClick={onSaveContact}
            className="auth-primary-btn w-full rounded-xl py-3 text-[clamp(0.8125rem,3.6vw,0.9375rem)] font-bold shadow touch-manipulation"
          >
            حفظ الرقم والاسم في دفتر العملاء
          </button>
        )}

      {customerNameEditing && customerBookStatus === 'known' && customerDisplayName.trim() && (
        <button
          type="button"
          onClick={onSaveContact}
          className="auth-primary-btn w-full rounded-xl py-3 text-[clamp(0.8125rem,3.6vw,0.9375rem)] font-bold shadow touch-manipulation"
        >
          حفظ الاسم المحدّث
        </button>
      )}

      {uploadSaveError && customerLocalPhone.length >= 1 && uploadSavePhase === 'idle' && (
        <p className="text-[clamp(0.75rem,3.2vw,0.875rem)] font-bold text-red-800" role="alert">
          {uploadSaveError}
        </p>
      )}

      {isCustomerPhoneSearchable(customerLocalPhone) && (
        <p className="rounded-xl border border-primary/10 bg-mistara-sand/80 px-3 py-2.5 text-[clamp(0.6875rem,3vw,0.8125rem)] font-bold leading-relaxed text-mistara-brown/75">
          {isSearchingInvoices || customerBookStatus === 'searching'
            ? 'جاري البحث في سجل العملاء والفواتير...'
            : customerBookStatus === 'known' && customerDisplayName
              ? `عميل مسجّل: ${customerDisplayName}`
              : customerInvoicesCount > 0
                ? `تم العثور على ${customerInvoicesCount} مستند/فاتورة سابقة.`
                : 'رقم جديد — اكتب الاسم واحفظ، أو استخدم زر الكاميرا بالأسفل.'}
        </p>
      )}
    </section>
  );
}
