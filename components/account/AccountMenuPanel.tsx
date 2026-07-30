'use client';

import { useRef } from 'react';

type AccountMenuPanelProps = {
  open: boolean;
  email?: string | null;
  tailorShopName: string;
  isTailorRegistered: boolean;
  tailorCountryCode: string;
  tailorLocalPhone: string;
  avatarUrl: string;
  uploadingAvatar: boolean;
  onAvatarSelect: (file: File) => void;
  onOpenSettings: () => void;
  onLogout: () => void;
};

export function AccountMenuPanel({
  open,
  email,
  tailorShopName,
  isTailorRegistered,
  tailorCountryCode,
  tailorLocalPhone,
  avatarUrl,
  uploadingAvatar,
  onAvatarSelect,
  onOpenSettings,
  onLogout,
}: AccountMenuPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!open) return null;

  const phoneLabel = isTailorRegistered ? `+${tailorCountryCode}${tailorLocalPhone}` : 'غير مسجل';

  return (
    <div className="absolute left-0 mt-2 w-80 sm:w-[22rem] rounded-2xl border border-mistara-gold/30 glass-panel p-4 shadow-2xl backdrop-blur-md z-50 space-y-4">
      <div className="flex items-center gap-3 border-b border-mistara-brown/15 pb-3">
        <div className="relative shrink-0">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatarUrl}
              alt="صورة حساب الخياط"
              className="h-14 w-14 rounded-2xl border-2 border-mistara-gold/35 object-cover shadow-md"
            />
          ) : (
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-mistara-gold text-2xl font-black text-mistara-cream shadow-md">
              م
            </div>
          )}
          {uploadingAvatar && (
            <span className="absolute inset-0 flex items-center justify-center rounded-2xl bg-mistara-cream/70">
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-mistara-gold/30 border-t-mistara-gold" />
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-black text-mistara-gold">لوحة الخياط</p>
          <p className="truncate text-sm font-bold text-mistara-espresso">
            {tailorShopName.trim() || 'اسم المحل غير مضاف'}
          </p>
          <p className="truncate text-xs text-mistara-brown/80">{email || 'ضيف'}</p>
        </div>
      </div>

      <div className="space-y-2">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onAvatarSelect(file);
            e.target.value = '';
          }}
        />
        <button
          type="button"
          disabled={uploadingAvatar}
          onClick={() => fileInputRef.current?.click()}
          className="w-full rounded-xl border border-mistara-gold/30 bg-mistara-gold/10 py-2.5 text-sm font-bold text-mistara-warm transition-colors hover:bg-mistara-gold/12 disabled:opacity-60"
        >
          {uploadingAvatar ? 'جاري رفع الصورة...' : avatarUrl ? 'تغيير صورة الحساب' : 'رفع صورة أو شعار'}
        </button>
      </div>

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

      <button
        type="button"
        onClick={onOpenSettings}
        className="w-full rounded-xl bg-mistara-gold py-3 text-sm font-black text-mistara-cream shadow-md shadow-mistara-gold/15"
      >
        الإعدادات
      </button>

      <button
        type="button"
        onClick={onLogout}
        className="w-full rounded-xl border border-red-800/30 bg-red-800/8 py-3 text-sm font-bold text-red-700"
      >
        خروج / تسجيل الدخول بحساب آخر
      </button>
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
      className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-xl bg-mistara-gold text-xl font-black text-mistara-cream shadow-md ring-2 ring-mistara-gold/30 transition-transform active:scale-95"
    >
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        'م'
      )}
    </button>
  );
}
