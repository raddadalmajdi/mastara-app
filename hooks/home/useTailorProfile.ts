'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { AvatarSaveFeedback } from '@/components/account/AccountMenuPanel';
import { COUNTRY_CODES } from '@/lib/home/constants';
import type { AppUser, AuthFeedback } from '@/lib/home/types';
import { appUserId } from '@/lib/home/types';
import { blobToDataUrl } from '@/lib/home/invoice-helpers';
import { withTimeout } from '@/lib/async-timeout';
import { isFirebaseConfigured } from '@/lib/firebase-auth-client';
import { getUserFacingErrorMessage } from '@/lib/user-facing-error';
import { fileToAvatarJpegBlob, uploadTailorAvatar } from '@/lib/upload-tailor-avatar';
import {
  clearTailorAvatarUrl,
  fetchTailorProfile,
  loadLocalAvatarUrl,
  loadLocalTailorProfile,
  persistAvatarLocally,
  persistLocalTailorAvatarUrl,
  persistTailorAvatarUrl,
  removeLocalAvatarUrl,
  resolveAvatarUrl,
  saveLocalAvatarUrl,
  saveLocalTailorProfile,
  syncLocalAvatarToDatabaseIfNeeded,
  upsertTailorProfile,
} from '@/lib/tailor-profile';
import { normalizeAvatarSrc } from '@/lib/avatar-src';

type UseTailorProfileOptions = {
  user: AppUser | null;
  organizationId: string | null;
  authBootstrapping: boolean;
  setLoading: (loading: boolean) => void;
};

function applyTailorPhoneFromStorage(
  phoneStr: string,
  setTailorCountryCode: (code: string) => void,
  setTailorLocalPhone: (phone: string) => void
) {
  let matched = false;
  COUNTRY_CODES.forEach((c) => {
    if (phoneStr.startsWith(c.code)) {
      setTailorCountryCode(c.code);
      setTailorLocalPhone(phoneStr.replace(c.code, ''));
      matched = true;
    }
  });
  if (!matched && phoneStr) {
    setTailorLocalPhone(phoneStr.replace(/\D/g, ''));
  }
}

export function useTailorProfile({
  user,
  organizationId,
  authBootstrapping,
  setLoading,
}: UseTailorProfileOptions) {
  const [tailorCountryCode, setTailorCountryCode] = useState('965');
  const [tailorLocalPhone, setTailorLocalPhone] = useState('');
  const [tailorShopName, setTailorShopName] = useState('');
  const [tailorAvatarUrl, setTailorAvatarUrl] = useState('');
  const [pendingAvatarPreview, setPendingAvatarPreview] = useState<string | null>(null);
  const [hasPendingAvatar, setHasPendingAvatar] = useState(false);
  const pendingAvatarBlobRef = useRef<Blob | null>(null);
  const pendingPreviewUrlRef = useRef<string | null>(null);
  const [savingAvatar, setSavingAvatar] = useState(false);
  const [avatarFeedback, setAvatarFeedback] = useState<AvatarSaveFeedback>(null);
  const [cloudNotes, setCloudNotes] = useState('');
  const [isTailorRegistered, setIsTailorRegistered] = useState(false);
  const [checkingTailor, setCheckingTailor] = useState(false);
  const [showTailorProfileModal, setShowTailorProfileModal] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsFeedback, setSettingsFeedback] = useState<AuthFeedback>(null);
  const profileOnboardingShownRef = useRef(false);

  const clearPendingAvatar = useCallback(() => {
    if (pendingPreviewUrlRef.current) {
      URL.revokeObjectURL(pendingPreviewUrlRef.current);
      pendingPreviewUrlRef.current = null;
    }
    pendingAvatarBlobRef.current = null;
    setPendingAvatarPreview(null);
    setHasPendingAvatar(false);
  }, []);

  const tailorProfileSnapshot = useCallback(
    () => ({
      phone: tailorLocalPhone.trim() ? `${tailorCountryCode}${tailorLocalPhone}` : '',
      cloud_notes: cloudNotes,
      shop_name: tailorShopName.trim(),
    }),
    [tailorCountryCode, tailorLocalPhone, cloudNotes, tailorShopName]
  );

  const resetProfile = useCallback(() => {
    setIsTailorRegistered(false);
    setCloudNotes('');
    setTailorShopName('');
    setTailorAvatarUrl('');
    setCheckingTailor(false);
    clearPendingAvatar();
    setAvatarFeedback(null);
    profileOnboardingShownRef.current = false;
  }, [clearPendingAvatar]);

  const fetchProfile = useCallback(
    async (userId: string) => {
      if (!isFirebaseConfigured()) {
        const local = loadLocalTailorProfile();
        if (local?.shop_name) setTailorShopName(local.shop_name);
        setTailorAvatarUrl(resolveAvatarUrl(local?.avatar_url, userId));
        if (local?.cloud_notes) setCloudNotes(local.cloud_notes);
        if (local?.phone) {
          applyTailorPhoneFromStorage(local.phone, setTailorCountryCode, setTailorLocalPhone);
          setIsTailorRegistered(true);
        } else {
          setIsTailorRegistered(false);
        }
        setCheckingTailor(false);
        setLoading(false);
        return;
      }

      setCheckingTailor(true);
      try {
        const data = await withTimeout(fetchTailorProfile(userId), 12_000, 'تحميل ملف الخياط');

        if (data) {
          if (data.phone) {
            setIsTailorRegistered(true);
            applyTailorPhoneFromStorage(String(data.phone), setTailorCountryCode, setTailorLocalPhone);
          }
          setTailorShopName(data.shop_name ? String(data.shop_name) : '');
          setTailorAvatarUrl(resolveAvatarUrl(data.avatar_url, userId));
          if (data.cloud_notes) setCloudNotes(data.cloud_notes);

          void syncLocalAvatarToDatabaseIfNeeded(userId, {
            phone: String(data.phone ?? ''),
            cloud_notes: data.cloud_notes ?? '',
            shop_name: String(data.shop_name ?? ''),
          }).catch(() => undefined);
        } else {
          setIsTailorRegistered(false);
          setTailorShopName('');
          setTailorAvatarUrl(resolveAvatarUrl(null, userId));
        }
      } catch (fetchError) {
        if (process.env.NODE_ENV === 'development') {
          console.warn('[tailor_profiles] fetch skipped or timed out', fetchError);
        }
        setIsTailorRegistered(false);
        setTailorAvatarUrl(resolveAvatarUrl(null, userId));
      } finally {
        setCheckingTailor(false);
        setLoading(false);
      }
    },
    [setLoading]
  );

  useEffect(() => {
    if (!user) {
      resetProfile();
      return;
    }
    const userId = appUserId(user);
    const cachedAvatar = normalizeAvatarSrc(loadLocalAvatarUrl(userId));
    if (cachedAvatar) {
      setTailorAvatarUrl(cachedAvatar);
    }
    void fetchProfile(userId);
  }, [user, fetchProfile, resetProfile]);

  useEffect(() => {
    return () => {
      if (pendingPreviewUrlRef.current) {
        URL.revokeObjectURL(pendingPreviewUrlRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!user || checkingTailor || authBootstrapping) return;
    if (isTailorRegistered || profileOnboardingShownRef.current) return;
    profileOnboardingShownRef.current = true;
    setShowTailorProfileModal(true);
  }, [user, checkingTailor, authBootstrapping, isTailorRegistered]);

  const handleSaveTailorProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tailorLocalPhone.trim()) {
      setSettingsFeedback({ type: 'error', message: 'يرجى إدخال رقم الجوال قبل الحفظ.' });
      return;
    }

    setSavingSettings(true);
    setSettingsFeedback(null);
    const fullPhone = `${tailorCountryCode}${tailorLocalPhone}`;
    const shopName = tailorShopName.trim();

    if (!isFirebaseConfigured()) {
      saveLocalTailorProfile({
        phone: fullPhone,
        cloud_notes: cloudNotes,
        shop_name: shopName,
        avatar_url: tailorAvatarUrl || undefined,
      });
      setIsTailorRegistered(true);
      setSettingsFeedback({ type: 'success', message: 'تم حفظ إعدادات الخياط محلياً بنجاح.' });
      window.setTimeout(() => {
        setShowTailorProfileModal(false);
        setSettingsFeedback(null);
      }, 1400);
      setSavingSettings(false);
      return;
    }

    if (!user) {
      setSettingsFeedback({ type: 'error', message: 'يجب تسجيل الدخول لحفظ الإعدادات.' });
      setSavingSettings(false);
      return;
    }

    try {
      await upsertTailorProfile({
        user_id: appUserId(user),
        organization_id: organizationId ?? undefined,
        phone: fullPhone,
        cloud_notes: cloudNotes,
        shop_name: shopName,
        avatar_url: tailorAvatarUrl || undefined,
      });
      if (tailorAvatarUrl.trim()) {
        saveLocalAvatarUrl(appUserId(user), tailorAvatarUrl);
      }
      setIsTailorRegistered(true);
      setSettingsFeedback({
        type: 'success',
        message: 'تم حفظ اسم المحل ورقم الخياط والملاحظات بنجاح.',
      });
      window.setTimeout(() => {
        setShowTailorProfileModal(false);
        setSettingsFeedback(null);
      }, 1400);
    } catch (saveError) {
      setSettingsFeedback({
        type: 'error',
        message: getUserFacingErrorMessage(saveError, 'فشل الحفظ.'),
      });
    }
    setSavingSettings(false);
  };

  const syncAvatarToCloud = useCallback(
    async (userId: string, blob: Blob, displayDataUrl: string) => {
      setSavingAvatar(true);
      setAvatarFeedback(null);
      const snapshot = tailorProfileSnapshot();

      try {
        const publicUrl = await uploadTailorAvatar(userId, blob);
        const persistTarget = await persistTailorAvatarUrl(userId, publicUrl, snapshot);
        persistAvatarLocally(userId, displayDataUrl);
        setTailorAvatarUrl(displayDataUrl);
        clearPendingAvatar();
        setAvatarFeedback({
          type: 'success',
          message:
            persistTarget === 'database'
              ? 'تم حفظ صورة المحل في حسابك.'
              : 'تم حفظ الصورة على هذا الجهاز — ستُزامَن مع السحابة لاحقاً.',
        });
      } catch (saveError) {
        setAvatarFeedback({
          type: 'error',
          message: getUserFacingErrorMessage(saveError, 'تعذّر مزامنة صورة المحل.'),
        });
      } finally {
        setSavingAvatar(false);
      }
    },
    [clearPendingAvatar, tailorProfileSnapshot]
  );

  const handleAvatarFilePick = async (file: File) => {
    setAvatarFeedback(null);
    try {
      const jpegBlob = await fileToAvatarJpegBlob(file);
      const dataUrl = await blobToDataUrl(jpegBlob);
      const userId = user ? appUserId(user) : 'guest-local-user';

      persistAvatarLocally(userId, dataUrl);
      if (!isFirebaseConfigured() || !user) {
        persistLocalTailorAvatarUrl(dataUrl, tailorProfileSnapshot(), userId);
      }

      if (pendingPreviewUrlRef.current) {
        URL.revokeObjectURL(pendingPreviewUrlRef.current);
        pendingPreviewUrlRef.current = null;
      }

      pendingAvatarBlobRef.current = jpegBlob;
      setTailorAvatarUrl(dataUrl);
      setPendingAvatarPreview(null);
      setHasPendingAvatar(isFirebaseConfigured() && Boolean(user));
      setAvatarFeedback({
        type: 'success',
        message: 'تم حفظ صورة المحل محلياً — تظهر لك فوراً.',
      });

      if (isFirebaseConfigured() && user) {
        void syncAvatarToCloud(appUserId(user), jpegBlob, dataUrl);
      }
    } catch (pickError) {
      setAvatarFeedback({
        type: 'error',
        message: pickError instanceof Error ? pickError.message : 'تعذّر قراءة الصورة.',
      });
    }
  };

  const handleSaveAvatar = async () => {
    const blob = pendingAvatarBlobRef.current;
    if (!blob) return;
    if (!user || !isFirebaseConfigured()) return;
    const dataUrl = normalizeAvatarSrc(tailorAvatarUrl) || (await blobToDataUrl(blob));
    await syncAvatarToCloud(appUserId(user), blob, dataUrl);
  };

  const handleRemoveAvatar = () => {
    const userId = user ? appUserId(user) : 'guest-local-user';
    const snapshot = tailorProfileSnapshot();
    clearPendingAvatar();
    setTailorAvatarUrl('');
    setAvatarFeedback({ type: 'success', message: 'تمت إزالة صورة المحل.' });
    void clearTailorAvatarUrl(userId, snapshot).catch(() => {
      removeLocalAvatarUrl(userId);
      if (!isFirebaseConfigured() || !user) {
        persistLocalTailorAvatarUrl('', snapshot, userId);
      }
    });
  };

  return {
    tailorCountryCode,
    setTailorCountryCode,
    tailorLocalPhone,
    setTailorLocalPhone,
    tailorShopName,
    setTailorShopName,
    tailorAvatarUrl,
    pendingAvatarPreview,
    hasPendingAvatar,
    savingAvatar,
    avatarFeedback,
    cloudNotes,
    setCloudNotes,
    isTailorRegistered,
    checkingTailor,
    showTailorProfileModal,
    setShowTailorProfileModal,
    savingSettings,
    settingsFeedback,
    setSettingsFeedback,
    fetchProfile,
    resetProfile,
    handleSaveTailorProfile,
    handleAvatarFilePick,
    handleSaveAvatar,
    handleRemoveAvatar,
    handleDiscardPendingAvatar: () => {
      clearPendingAvatar();
      setAvatarFeedback(null);
    },
  };
}
