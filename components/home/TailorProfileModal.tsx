'use client';

import { COUNTRY_CODES } from '@/lib/home/constants';
import type { AuthFeedback } from '@/lib/home/types';

type TailorProfileModalProps = {
  open: boolean;
  onClose: () => void;
  tailorShopName: string;
  onShopNameChange: (value: string) => void;
  tailorLocalPhone: string;
  onLocalPhoneChange: (value: string) => void;
  tailorCountryCode: string;
  onCountryCodeChange: (value: string) => void;
  cloudNotes: string;
  onCloudNotesChange: (value: string) => void;
  tailorAvatarUrl: string;
  settingsFeedback: AuthFeedback;
  savingSettings: boolean;
  onSubmit: (e: React.FormEvent) => void;
};

export function TailorProfileModal({
  open,
  onClose,
  tailorShopName,
  onShopNameChange,
  tailorLocalPhone,
  onLocalPhoneChange,
  tailorCountryCode,
  onCountryCodeChange,
  cloudNotes,
  onCloudNotesChange,
  tailorAvatarUrl,
  settingsFeedback,
  savingSettings,
  onSubmit,
}: TailorProfileModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 glass-modal-backdrop flex items-center justify-center p-4 z-50">
      <div className="glass-panel border border-mistara-gold/35 rounded-3xl p-6 w-full max-w-sm sm:max-w-md space-y-4 shadow-2xl">
        <div className="flex justify-between items-center border-b border-mistara-brown/15 pb-2">
          <h3 className="font-bold text-mistara-espresso text-base">الإعدادات الشخصية</h3>
          <button type="button" onClick={onClose} className="text-mistara-gold text-lg">
            ✕
          </button>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="flex items-center gap-3 rounded-2xl border border-mistara-brown/15 bg-mistara-cream/60 p-3">
            {tailorAvatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={tailorAvatarUrl}
                alt="معاينة صورة الحساب"
                className="h-14 w-14 shrink-0 rounded-2xl border border-mistara-gold/30 object-cover"
              />
            ) : (
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-mistara-gold/15 text-lg font-black text-mistara-warm">
                م
              </div>
            )}
            <p className="text-xs leading-relaxed text-mistara-brown/80">
              غيّر صورة الحساب أو الشعار من قائمة أيقونة «م» في الأعلى، أو احفظ الإعدادات بعد إضافة رقمك.
            </p>
          </div>

          {settingsFeedback && (
            <div
              role="alert"
              className={`flex items-start gap-2 rounded-xl border px-3 py-2.5 text-sm leading-relaxed ${
                settingsFeedback.type === 'success'
                  ? 'border-mistara-gold-dark/40 bg-mistara-gold/10 text-mistara-brown'
                  : 'border-red-800/35 bg-red-800/8 text-red-900'
              }`}
            >
              <p>{settingsFeedback.message}</p>
            </div>
          )}

          <div>
            <label className="block text-sm font-bold text-mistara-gold mb-1">اسم المحل</label>
            <input
              type="text"
              value={tailorShopName}
              onChange={(e) => onShopNameChange(e.target.value)}
              placeholder="اسم محل الخياطة (اختياري)"
              className="w-full rounded-xl bg-mistara-cream border border-mistara-brown/15 p-3 text-base font-bold text-mistara-espresso"
            />
          </div>

          <div>
            <label className="block text-sm font-bold text-mistara-gold mb-1">رقم هاتف الخياط</label>
            <div className="flex gap-2 items-center">
              <input
                type="tel"
                required
                value={tailorLocalPhone}
                onChange={(e) => onLocalPhoneChange(e.target.value.replace(/\D/g, ''))}
                placeholder="رقم الجوال"
                className="flex-1 min-w-0 rounded-xl bg-mistara-cream border border-mistara-brown/15 p-3 text-base font-bold text-mistara-espresso font-mono tnum text-right"
                dir="ltr"
              />
              <select
                value={tailorCountryCode}
                onChange={(e) => onCountryCodeChange(e.target.value)}
                className="bg-mistara-cream border border-mistara-brown/15 text-sm text-mistara-warm rounded-xl p-3 font-mono tnum w-24 text-center"
              >
                {COUNTRY_CODES.map((c) => (
                  <option key={c.code} value={c.code}>
                    +{c.code}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-bold text-mistara-gold mb-1">ملاحظات سحابية عامة</label>
            <textarea
              value={cloudNotes}
              onChange={(e) => onCloudNotesChange(e.target.value)}
              placeholder="اكتب ملاحظات عامة تحفظ في حسابك..."
              rows={3}
              className="w-full rounded-xl bg-mistara-cream border border-mistara-brown/15 p-3 text-sm text-mistara-espresso focus:border-mistara-gold focus:outline-none resize-none"
            />
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-mistara-beige text-mistara-espresso text-sm py-3 rounded-xl font-bold"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={savingSettings}
              className="flex-1 bg-mistara-gold text-mistara-cream font-bold text-sm py-3 rounded-xl shadow"
            >
              {savingSettings ? 'جاري الحفظ...' : 'حفظ الإعدادات'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
