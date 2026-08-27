'use client';

import { useRef } from 'react';
import { UserProfileAvatar } from '@/components/account/UserProfileAvatar';
import type { AvatarSaveFeedback } from '@/components/account/AccountMenuPanel';

type TailorAvatarPickerProps = {
  avatarUrl: string;
  pendingPreview?: string | null;
  hasPendingCloudSync?: boolean;
  savingAvatar?: boolean;
  feedback?: AvatarSaveFeedback;
  compact?: boolean;
  onPickFile: (file: File) => void;
  onSaveCloud?: () => void;
  onRemove?: () => void;
  onDiscardPending?: () => void;
};

export function TailorAvatarPicker({
  avatarUrl,
  pendingPreview = null,
  hasPendingCloudSync = false,
  savingAvatar = false,
  feedback = null,
  compact = false,
  onPickFile,
  onSaveCloud,
  onRemove,
  onDiscardPending,
}: TailorAvatarPickerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const displayAvatar = pendingPreview || avatarUrl;

  return (
    <div className={`rounded-2xl border border-primary/15 bg-mistara-sand/50 ${compact ? 'p-3' : 'p-4'} space-y-3`}>
      <div className="flex items-center gap-3">
        <div className="relative shrink-0">
          <UserProfileAvatar
            src={displayAvatar}
            alt="صورة المحل"
            size={compact ? 'sm' : 'md'}
            className={hasPendingCloudSync ? 'ring-2 ring-primary/35' : undefined}
          />
          {savingAvatar && (
            <span className="absolute inset-0 flex items-center justify-center rounded-full bg-white/75">
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-black text-primary">صورة المحل / الشعار</p>
          <p className="text-[11px] leading-relaxed text-mistara-brown/75">
            تُحفظ فوراً على هذا الجهاز وتظهر لك وحدك. يمكن مزامنتها مع السحابة عند تسجيل الدخول.
          </p>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onPickFile(file);
          e.target.value = '';
        }}
      />

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={savingAvatar}
          onClick={() => fileInputRef.current?.click()}
          className="auth-primary-btn flex-1 min-w-[9rem] rounded-xl px-3 py-2.5 text-sm font-bold touch-manipulation disabled:opacity-60"
        >
          {displayAvatar ? 'تغيير الصورة' : 'رفع صورة المحل'}
        </button>
        {displayAvatar && onRemove && (
          <button
            type="button"
            disabled={savingAvatar}
            onClick={onRemove}
            className="rounded-xl border border-mistara-brown/20 bg-white px-3 py-2.5 text-xs font-bold text-mistara-brown touch-manipulation disabled:opacity-60"
          >
            إزالة
          </button>
        )}
      </div>

      {hasPendingCloudSync && onSaveCloud && (
        <div className="flex gap-2">
          <button
            type="button"
            disabled={savingAvatar}
            onClick={onSaveCloud}
            className="flex-1 rounded-xl border border-primary/25 bg-white py-2.5 text-sm font-bold text-primary touch-manipulation disabled:opacity-60"
          >
            {savingAvatar ? 'جاري المزامنة...' : 'مزامنة مع السحابة'}
          </button>
          {onDiscardPending && (
            <button
              type="button"
              disabled={savingAvatar}
              onClick={onDiscardPending}
              className="rounded-xl border border-mistara-brown/20 bg-mistara-beige px-3 py-2.5 text-xs font-bold text-mistara-brown disabled:opacity-60"
              aria-label="إلغاء المزامنة"
            >
              ✕
            </button>
          )}
        </div>
      )}

      {feedback && (
        <p
          role="status"
          className={`rounded-xl px-3 py-2 text-xs font-bold ${
            feedback.type === 'success'
              ? 'border border-primary/30 bg-primary/10 text-mistara-espresso'
              : 'border border-red-800/30 bg-red-800/8 text-red-800'
          }`}
        >
          {feedback.message}
        </p>
      )}
    </div>
  );
}
