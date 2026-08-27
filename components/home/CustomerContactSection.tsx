'use client';

import { COUNTRY_CODES } from '@/lib/home/constants';
import type { CustomerBookStatus } from '@/lib/home/types';
import type { InvoiceSaveUiPhase } from '@/components/invoices/InvoiceSaveProgressRing';
import { isCustomerPhoneSearchable } from '@/lib/tailor-customers';

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
    <section className="glass-panel border border-mistara-gold/35 p-4 rounded-3xl space-y-3 shadow-xl">
      <div className="space-y-1.5">
        <label className="auth-field-label block">رقم هاتف العميل</label>
        <div className="flex items-stretch gap-2">
          <input
            type="tel"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="tel-national"
            enterKeyHint="done"
            value={customerLocalPhone}
            onChange={(e) => onPhoneChange(e.target.value)}
            placeholder="50123456"
            className="auth-phone-input tnum text-right font-mono"
            dir="ltr"
          />
          <select
            value={customerCountryCode}
            onChange={(e) => onCountryCodeChange(e.target.value)}
            className="auth-phone-select tnum font-mono"
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

      <div className="space-y-1.5">
        <label className="text-sm text-mistara-gold font-bold block">اسم العميل</label>
        <div className="flex gap-2 items-stretch">
          <input
            type="text"
            value={customerDisplayName}
            onChange={(e) => onDisplayNameChange(e.target.value)}
            readOnly={customerNameLocked && !customerNameEditing}
            placeholder="اكتب اسم العميل هنا..."
            className={`flex-1 min-w-0 rounded-xl bg-mistara-cream border border-mistara-brown/15 p-3.5 text-base font-bold text-mistara-espresso ${
              customerNameLocked && !customerNameEditing ? 'cursor-default opacity-90' : ''
            }`}
          />
          {customerBookStatus === 'known' && customerDisplayName.trim() && !customerNameEditing && (
            <button
              type="button"
              onClick={onStartNameEdit}
              className="shrink-0 rounded-xl glass-panel border border-mistara-gold/35 px-3.5 text-mistara-warm font-bold text-sm hover:bg-mistara-beige transition-colors"
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
            className="w-full bg-mistara-gold text-mistara-cream text-sm font-bold py-3 rounded-xl shadow"
          >
            حفظ الرقم والاسم في دفتر العملاء
          </button>
        )}

      {customerNameEditing && customerBookStatus === 'known' && customerDisplayName.trim() && (
        <button
          type="button"
          onClick={onSaveContact}
          className="w-full bg-mistara-gold-dark text-mistara-cream text-sm font-bold py-3 rounded-xl shadow"
        >
          حفظ الاسم المحدّث
        </button>
      )}

      {uploadSaveError && customerLocalPhone.length >= 1 && uploadSavePhase === 'idle' && (
        <p className="text-xs text-red-800 font-bold">{uploadSaveError}</p>
      )}

      {isCustomerPhoneSearchable(customerLocalPhone) && (
        <p className="text-[11px] text-mistara-brown/60 font-bold">
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
