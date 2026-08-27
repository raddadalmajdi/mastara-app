'use client';

import { TailorAvatarPicker } from '@/components/account/TailorAvatarPicker';
import type { AvatarSaveFeedback } from '@/components/account/AccountMenuPanel';
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
  pendingAvatarPreview: string | null;
  hasPendingAvatar: boolean;
  savingAvatar: boolean;
  avatarFeedback: AvatarSaveFeedback;
  onAvatarFilePick: (file: File) => void;
  onSaveAvatar: () => void;
  onRemoveAvatar: () => void;
  onDiscardPendingAvatar: () => void;
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
  pendingAvatarPreview,
  hasPendingAvatar,
  savingAvatar,
  avatarFeedback,
  onAvatarFilePick,
  onSaveAvatar,
  onRemoveAvatar,
  onDiscardPendingAvatar,
  settingsFeedback,
  savingSettings,
  onSubmit,
}: TailorProfileModalProps) {
  if (!open) return null;

  return (
    <div className="auth-page fixed inset-0 z-50 flex items-end justify-center sm:items-center glass-modal-backdrop p-0 sm:p-4">
      <div className="auth-shell-card glass-panel w-full max-h-[92dvh] overflow-y-auto border border-primary/20 shadow-2xl sm:max-h-none">
        <div className="mb-[clamp(0.75rem,3vw,1rem)] flex items-center justify-between border-b border-mistara-brown/15 pb-2">
          <h3 className="text-[clamp(1rem,4.2vw,1.125rem)] font-bold text-mistara-espresso">
            إكمال تسجيل المحل
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-lg text-primary touch-manipulation"
            aria-label="إغلاق"
          >
            ✕
          </button>
        </div>

        <form onSubmit={onSubmit} className="space-y-[clamp(0.875rem,3.5vw,1.125rem)]">
          <TailorAvatarPicker
            avatarUrl={tailorAvatarUrl}
            pendingPreview={pendingAvatarPreview}
            hasPendingCloudSync={hasPendingAvatar}
            savingAvatar={savingAvatar}
            feedback={avatarFeedback}
            onPickFile={onAvatarFilePick}
            onSaveCloud={onSaveAvatar}
            onRemove={tailorAvatarUrl || pendingAvatarPreview ? onRemoveAvatar : undefined}
            onDiscardPending={onDiscardPendingAvatar}
          />

          <p className="text-[clamp(0.6875rem,3vw,0.8125rem)] leading-relaxed text-mistara-brown/80">
            أدخل رقم جوالك لإكمال تسجيل محلّك. صورة المحل تُحفظ فوراً على هذا الجهاز وتظهر في لوحة التحكم.
          </p>

          {settingsFeedback && (
            <div
              role="alert"
              className={`flex items-start gap-2 rounded-xl border px-3 py-2.5 text-[clamp(0.8125rem,3.6vw,0.9375rem)] leading-relaxed ${
                settingsFeedback.type === 'success'
                  ? 'border-primary/35 bg-primary/10 text-mistara-espresso'
                  : 'border-red-800/35 bg-red-800/8 text-red-900'
              }`}
            >
              <p>{settingsFeedback.message}</p>
            </div>
          )}

          <div>
            <label htmlFor="tailor-shop-name" className="auth-field-label block">
              اسم المحل
            </label>
            <input
              id="tailor-shop-name"
              type="text"
              value={tailorShopName}
              onChange={(e) => onShopNameChange(e.target.value)}
              placeholder="اسم محل الخياطة (اختياري)"
              className="auth-field-input font-bold"
            />
          </div>

          <div>
            <label htmlFor="tailor-phone" className="auth-field-label block">
              رقم جوال التاجر
            </label>
            <div className="flex items-stretch gap-2">
              <input
                id="tailor-phone"
                type="tel"
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="tel-national"
                enterKeyHint="done"
                required
                value={tailorLocalPhone}
                onChange={(e) => onLocalPhoneChange(e.target.value.replace(/\D/g, ''))}
                placeholder="50123456"
                className="auth-phone-input tnum text-right font-mono"
                dir="ltr"
              />
              <select
                value={tailorCountryCode}
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

          <div>
            <label htmlFor="tailor-notes" className="auth-field-label block">
              ملاحظات سحابية عامة
            </label>
            <textarea
              id="tailor-notes"
              value={cloudNotes}
              onChange={(e) => onCloudNotesChange(e.target.value)}
              placeholder="اكتب ملاحظات عامة تحفظ في حسابك..."
              rows={3}
              className="auth-field-input resize-none text-[clamp(0.8125rem,3.6vw,0.9375rem)]"
            />
          </div>

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl bg-mistara-beige py-[clamp(0.75rem,3vw,0.875rem)] text-[clamp(0.8125rem,3.6vw,0.9375rem)] font-bold text-mistara-espresso touch-manipulation"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={savingSettings}
              className="auth-primary-btn flex-1 rounded-xl font-bold text-[clamp(0.8125rem,3.6vw,0.9375rem)] shadow disabled:opacity-50 touch-manipulation"
            >
              {savingSettings ? 'جاري الحفظ...' : 'حفظ وإكمال التسجيل'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
