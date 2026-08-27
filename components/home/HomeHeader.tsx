'use client';

import Link from 'next/link';
import { AccountMenuPanel, AccountMenuTrigger } from '@/components/account/AccountMenuPanel';
import { UserProfileAvatar } from '@/components/account/UserProfileAvatar';
import { AppBrand } from '@/components/brand/AppBrand';
import { isFirebaseConfigured } from '@/lib/firebase-auth-client';
import type { AvatarSaveFeedback } from '@/components/account/AccountMenuPanel';

type HomeHeaderProps = {
  menuRef: React.RefObject<HTMLDivElement | null>;
  showMenu: boolean;
  setShowMenu: (open: boolean) => void;
  userEmail?: string | null;
  tailorShopName: string;
  isTailorRegistered: boolean;
  tailorCountryCode: string;
  tailorLocalPhone: string;
  tailorAvatarUrl: string;
  pendingAvatarPreview: string | null;
  hasPendingAvatar: boolean;
  savingAvatar: boolean;
  avatarFeedback: AvatarSaveFeedback;
  onAvatarFilePick: (file: File) => void;
  onSaveAvatar: () => void;
  onRemoveAvatar: () => void;
  onDiscardPendingAvatar: () => void;
  onOpenSettings: () => void;
  onLogout: () => void;
};

export function HomeHeader({
  menuRef,
  showMenu,
  setShowMenu,
  userEmail,
  tailorShopName,
  isTailorRegistered,
  tailorCountryCode,
  tailorLocalPhone,
  tailorAvatarUrl,
  pendingAvatarPreview,
  hasPendingAvatar,
  savingAvatar,
  avatarFeedback,
  onAvatarFilePick,
  onSaveAvatar,
  onRemoveAvatar,
  onDiscardPendingAvatar,
  onOpenSettings,
  onLogout,
}: HomeHeaderProps) {
  const displayAvatar = pendingAvatarPreview || tailorAvatarUrl;
  const merchantLabel = tailorShopName.trim() || 'محلّي';

  return (
    <header className="sticky top-0 z-40 glass-header px-4 sm:px-6 lg:px-8 py-3">
      <div className="max-w-lg sm:max-w-2xl lg:max-w-4xl w-full mx-auto flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <AppBrand size="sm" layout="row" showTitle subtitle={null} />
          {!isFirebaseConfigured() && (
            <span className="hidden sm:inline text-xs bg-primary/10 text-primary-dark border border-primary/30 px-2 py-0.5 rounded-full font-mono">
              وضع التجربة (بلا حساب)
            </span>
          )}
        </div>

        <div className="hidden min-w-0 flex-1 items-center justify-center gap-2 sm:flex">
          <UserProfileAvatar src={displayAvatar} alt={merchantLabel} size="sm" />
          <div className="min-w-0 text-center">
            <p className="truncate text-sm font-black text-primary-dark">{merchantLabel}</p>
            <p className="truncate text-[10px] font-bold text-mistara-brown/70">لوحة التاجر</p>
          </div>
        </div>

        <div className="relative flex shrink-0 items-center gap-2" ref={menuRef}>
          <Link
            href="/billing"
            onClick={() => setShowMenu(false)}
            className="inline-flex shrink-0 items-center rounded-xl border border-primary/25 bg-primary/8 px-2.5 sm:px-3 py-2 text-[11px] sm:text-xs font-black text-primary-dark transition-colors hover:bg-primary/12 active:scale-[0.99]"
          >
            الاشتراك والفوترة
          </Link>

          <AccountMenuTrigger avatarUrl={displayAvatar} onClick={() => setShowMenu(!showMenu)} />

          <AccountMenuPanel
            open={showMenu}
            email={userEmail}
            tailorShopName={tailorShopName}
            isTailorRegistered={isTailorRegistered}
            tailorCountryCode={tailorCountryCode}
            tailorLocalPhone={tailorLocalPhone}
            avatarUrl={tailorAvatarUrl}
            pendingAvatarPreview={pendingAvatarPreview}
            hasPendingAvatar={hasPendingAvatar}
            savingAvatar={savingAvatar}
            avatarFeedback={avatarFeedback}
            onAvatarFilePick={onAvatarFilePick}
            onSaveAvatar={onSaveAvatar}
            onRemoveAvatar={onRemoveAvatar}
            onDiscardPendingAvatar={onDiscardPendingAvatar}
            onCloseMenu={() => setShowMenu(false)}
            onOpenSettings={onOpenSettings}
            onLogout={onLogout}
          />
        </div>
      </div>
    </header>
  );
}
