'use client';

import Link from 'next/link';
import { TailorAvatarPicker } from '@/components/account/TailorAvatarPicker';
import { UserProfileAvatar } from '@/components/account/UserProfileAvatar';

export type AvatarSaveFeedback = { type: 'success' | 'error'; message: string } | null;

type AccountMenuPanelProps = {
  open: boolean;
  email?: string | null;
  tailorShopName: string;
  isTailorRegistered: boolean;
  tailorCountryCode: string;
  tailorLocalPhone: string;
  /** الرابط المحفوظ فعلياً (يظهر في أيقونة الهيدر). */
  avatarUrl: string;
  /** معاينة الصورة المختارة قبل الحفظ — إن وُجدت. */
  pendingAvatarPreview: string | null;
  hasPendingAvatar: boolean;
  savingAvatar: boolean;
  avatarFeedback: AvatarSaveFeedback;
  onAvatarFilePick: (file: File) => void;
  onSaveAvatar: () => void;
  onRemoveAvatar: () => void;
  onDiscardPendingAvatar: () => void;
  /** يُغلق القائمة قبل أي انتقال (اختياري). */
  onCloseMenu?: () => void;
  onOpenSettings: () => void;
  onLogout: () => void;
};

const BILLING_HREF = '/billing';

function BillingMenuIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <path d="M2 10h20" />
      <path d="M6 15h2" />
      <path d="M10 15h4" />
    </svg>
  );
}

export function AccountMenuPanel({
  open,
  email,
  tailorShopName,
  isTailorRegistered,
  tailorCountryCode,
  tailorLocalPhone,
  avatarUrl,
  pendingAvatarPreview,
  hasPendingAvatar,
  savingAvatar,
  avatarFeedback,
  onAvatarFilePick,
  onSaveAvatar,
  onRemoveAvatar,
  onDiscardPendingAvatar,
  onCloseMenu,
  onOpenSettings,
  onLogout,
}: AccountMenuPanelProps) {
  if (!open) return null;

  const phoneLabel = isTailorRegistered ? `+${tailorCountryCode}${tailorLocalPhone}` : 'غير مسجل';
  const displayAvatar = pendingAvatarPreview || avatarUrl;

  return (
    <div className="absolute left-0 mt-2 w-80 sm:w-[22rem] rounded-2xl border border-mistara-gold/30 glass-panel p-4 shadow-2xl backdrop-blur-md z-50 space-y-4">
      <div className="flex items-center gap-3 border-b border-mistara-brown/15 pb-3">
        <UserProfileAvatar
          src={displayAvatar}
          alt="صورة حساب الخياط"
          size="md"
          className={hasPendingAvatar ? 'border-primary/45 ring-primary/30' : undefined}
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-black text-mistara-gold">لوحة الخياط</p>
          <p className="truncate text-sm font-bold text-mistara-espresso">
            {tailorShopName.trim() || 'اسم المحل غير مضاف'}
          </p>
          <p className="truncate text-xs text-mistara-brown/80">{email || 'ضيف'}</p>
        </div>
      </div>

      <TailorAvatarPicker
        avatarUrl={avatarUrl}
        pendingPreview={pendingAvatarPreview}
        hasPendingCloudSync={hasPendingAvatar}
        savingAvatar={savingAvatar}
        feedback={avatarFeedback}
        compact
        onPickFile={onAvatarFilePick}
        onSaveCloud={onSaveAvatar}
        onRemove={displayAvatar ? onRemoveAvatar : undefined}
        onDiscardPending={onDiscardPendingAvatar}
      />

      <div className="rounded-xl border border-mistara-brown/15 bg-mistara-cream/60 px-3 py-2.5 space-y-1.5">
        <div>
          <span className="text-xs font-bold text-mistara-gold">اسم الخياط / المحل</span>
          <p className="truncate text-sm font-bold text-mistara-espresso">
            {tailorShopName.trim() || '—'}
          </p>
        </div>
        <div>
          <span className="text-xs font-bold text-mistara-gold">رقم الجوال</span>
          <p className="truncate text-sm font-bold text-mistara-espresso tnum" dir="ltr">
            {phoneLabel}
          </p>
        </div>
      </div>

      <nav
        aria-label="إجراءات الحساب"
        className="border-t border-mistara-brown/15 pt-3 space-y-2"
      >
        <Link
          href={BILLING_HREF}
          onClick={onCloseMenu}
          className="flex w-full items-center justify-center gap-2.5 rounded-xl border border-primary/25 bg-primary/8 py-3 text-sm font-black text-primary-dark transition-colors hover:bg-primary/12 active:scale-[0.99]"
        >
          <BillingMenuIcon className="h-4 w-4 shrink-0 opacity-90" />
          <span>الاشتراك والفوترة</span>
        </Link>

        <button
          type="button"
          onClick={onOpenSettings}
          className="w-full rounded-xl bg-mistara-gold py-3 text-sm font-black text-mistara-cream shadow-md shadow-mistara-gold/15 transition-colors hover:bg-mistara-gold/95 active:scale-[0.99]"
        >
          إعدادات المحل
        </button>

        <button
          type="button"
          onClick={onLogout}
          className="w-full rounded-xl border border-red-800/30 bg-red-800/8 py-3 text-sm font-bold text-red-700 transition-colors hover:bg-red-800/12 active:scale-[0.99]"
        >
          خروج / تسجيل الدخول بحساب آخر
        </button>
      </nav>
    </div>
  );
}

export function AccountMenuTrigger({
  avatarUrl,
  onClick,
}: {
  avatarUrl: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="فتح قائمة الحساب"
      className="rounded-full transition-transform active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-mistara-cream"
    >
      <UserProfileAvatar src={avatarUrl} size="sm" />
    </button>
  );
}
