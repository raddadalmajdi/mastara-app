'use client';

/** لوحة مسطرة 2030 — دخول (بريد/كلمة مرور/OTP)، إعدادات الخياط، ودفتر العملاء. */

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import dynamic from 'next/dynamic';
import type { EmailOtpType } from '@supabase/supabase-js';
import { mapAuthErrorToArabic } from '@/lib/auth-errors';
import {
  resolveSignUpFlow,
  verifyEmailOtpFlexible,
} from '@/lib/auth-handler';
import { logAuthRedirectDiagnostics, logSupabaseAuthErrorJson } from '@/lib/auth-debug';
import { executeSignUp } from '@/lib/auth-sign-up';
import { resendVerificationViaResendApi } from '@/lib/auth-sign-up-api';
import {
  getAuthCallbackUrl,
  getSupabaseBrowserClient,
  isSupabaseConfigured,
} from '@/lib/supabase-browser';
import { OTP_CODE_LENGTH } from '@/components/auth/OtpCodeInput';
import { AuthConfirmationPanel } from '@/components/auth/AuthConfirmationPanel';
import { AuthBootScreen } from '@/components/auth/AuthBootScreen';
import { AuthModeTabs } from '@/components/auth/AuthModeTabs';
import { withTimeout } from '@/lib/async-timeout';
import { isEmailVerifiedUser } from '@/lib/auth-confirmation-guard';
import {
  AUTH_CONFIRMATION_RESENT,
  AUTH_CONFIRMATION_SENT,
  AUTH_OTP_INCOMPLETE,
  AUTH_UNCONFIRMED_LOGIN,
} from '@/lib/auth-confirmation-copy';
import { downloadInvoiceAsPdf, openInvoicePdfForPrint, downloadStoredPdf, openStoredPdfForPrint } from '@/lib/pdf-export';
import {
  insertInvoiceRecord,
  invoiceShareDocumentUrl,
  uploadScannedInvoiceFiles,
} from '@/lib/upload-scanned-invoice';
import { DocumentScannerModal } from '@/components/scanner/DocumentScannerModal';
import type { DocumentScanResult } from '@/lib/document-scanner/scan-result';

const OpenCvDocumentScannerModal = dynamic(
  () =>
    import('@/components/scanner/OpenCvDocumentScannerModal').then((m) => m.OpenCvDocumentScannerModal),
  { ssr: false }
);
import {
  InvoiceSaveProgressRing,
  type InvoiceSaveUiPhase,
} from '@/components/invoices/InvoiceSaveProgressRing';
import { AccountMenuPanel, AccountMenuTrigger, type AvatarSaveFeedback } from '@/components/account/AccountMenuPanel';
import { AppBrand } from '@/components/brand/AppBrand';
import { fileToAvatarJpegBlob, uploadTailorAvatar } from '@/lib/upload-tailor-avatar';
import { useIdleLogout } from '@/lib/use-idle-logout';
import {
  lookupTailorCustomerByPhone,
  phoneMatchVariants,
  phonesMatch,
  upsertTailorCustomer,
} from '@/lib/tailor-customers';
import {
  fetchTailorProfile,
  loadLocalTailorProfile,
  persistLocalTailorAvatarUrl,
  persistTailorAvatarUrl,
  resolveAvatarUrl,
  saveLocalAvatarUrl,
  saveLocalTailorProfile,
  syncLocalAvatarToDatabaseIfNeeded,
  upsertTailorProfile,
} from '@/lib/tailor-profile';

type AuthFeedback = { type: 'success' | 'error'; message: string } | null;

const COUNTRY_CODES = [
  { code: '965', name: 'الكويت 🇰🇼' },
  { code: '966', name: 'السعودية 🇸🇦' },
  { code: '971', name: 'الإمارات 🇦🇪' },
  { code: '974', name: 'قطر 🇶🇦' },
  { code: '973', name: 'البحرين 🇧🇭' },
  { code: '968', name: 'عمان 🇴🇲' },
];

export default function Home() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [user, setUser] = useState<any>(isSupabaseConfigured() ? null : { id: 'guest-local-user', email: 'guest@mistarh.local' });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [loginMethod, setLoginMethod] = useState<'password' | 'otp'>('password');
  const [authPhase, setAuthPhase] = useState<'form' | 'confirm'>('form');
  const [otpCode, setOtpCode] = useState('');
  const [otpVerifyType, setOtpVerifyType] = useState<EmailOtpType>('email');
  const [otpResendCooldown, setOtpResendCooldown] = useState(0);
  const [authFeedback, setAuthFeedback] = useState<AuthFeedback>(null);
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [showWelcomeSuccess, setShowWelcomeSuccess] = useState(false);
  const [settingsFeedback, setSettingsFeedback] = useState<AuthFeedback>(null);
  const [devDeleteStatus, setDevDeleteStatus] = useState<string | null>(null);
  const [devDeleteLoading, setDevDeleteLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [authBootstrapping, setAuthBootstrapping] = useState(false);
  const [sessionCheckPending, setSessionCheckPending] = useState(() => isSupabaseConfigured());

  // ملف الخياط والإعدادات
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

  // القائمة المنسدلة
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // الزبون والفواتير
  const [customerCountryCode, setCustomerCountryCode] = useState('965');
  const [customerLocalPhone, setCustomerLocalPhone] = useState('');
  const [customerDisplayName, setCustomerDisplayName] = useState('');
  const [customerBookStatus, setCustomerBookStatus] = useState<
    'idle' | 'searching' | 'known' | 'new'
  >('idle');
  const [customerNameLocked, setCustomerNameLocked] = useState(false);
  const [customerNameEditing, setCustomerNameEditing] = useState(false);
  const [customerInvoices, setCustomerInvoices] = useState<any[]>([]);
  const customerLookupTimerRef = useRef<number | null>(null);
  const profileOnboardingShownRef = useRef(false);
  const [isSearchingInvoices, setIsSearchingInvoices] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadSavePhase, setUploadSavePhase] = useState<InvoiceSaveUiPhase>('idle');
  const [uploadSaveError, setUploadSaveError] = useState<string | null>(null);
  const [showDocumentScanner, setShowDocumentScanner] = useState(false);
  const [showOpenCvScanner, setShowOpenCvScanner] = useState(false);

  // حفظ رسائل الواتساب المخصصة لكل فاتورة
  const [whatsappMessages, setWhatsappMessages] = useState<{ [key: string]: string }>({});

  // عارض الصور (Lightbox)
  const [activeImageIndex, setActiveImageIndex] = useState<number | null>(null);

  // تصدير/طباعة الفاتورة كملف PDF: يحمل معرّف الفاتورة قيد التصدير حالياً (لتعطيل زرها فقط)
  const [exportingPdfId, setExportingPdfId] = useState<string | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured() || !supabase) {
      setLoading(false);
      setAuthBootstrapping(false);
      setSessionCheckPending(false);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const {
          data: { session },
        } = await withTimeout(supabase.auth.getSession(), 10_000, 'التحقق من الجلسة');

        if (cancelled) return;

        const currentUser = session?.user ?? null;
        if (currentUser && !isEmailVerifiedUser(currentUser)) {
          // جلسة موجودة لكن البريد غير مؤكد فعلياً برمز الـ OTP (حالة لا يجب
          // أن تحدث إن كان "Confirm email" مفعّلاً في Supabase، لكننا لا نثق
          // بذلك الإعداد وحده) — نُسجّل الخروج فوراً بدل عرض التطبيق.
          if (process.env.NODE_ENV === 'development') {
            console.warn('[auth bootstrap] session found but email not verified — signing out');
          }
          await supabase.auth.signOut().catch(() => undefined);
          if (!cancelled) setUser(null);
        } else if (currentUser) {
          setUser(currentUser);
          await checkTailorAndFetchData(currentUser.id);
        } else {
          setUser(null);
        }
      } catch (error) {
        if (process.env.NODE_ENV === 'development') {
          console.warn('[auth bootstrap] getSession failed or timed out', error);
        }
        if (!cancelled) {
          setUser(null);
        }
      } finally {
        if (!cancelled) {
          setAuthBootstrapping(false);
          setLoading(false);
          setSessionCheckPending(false);
        }
      }
    })();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      const currentUser = session?.user ?? null;

      if (currentUser && !isEmailVerifiedUser(currentUser)) {
        // نفس الحارس أعلاه لكن لأحداث الجلسة اللاحقة (تسجيل دخول/تحديث توكن).
        // نؤجّل استدعاء signOut خارج هذا الـ callback مباشرة (بدل استدعائه
        // بشكل متزامن هنا) تجنباً لأي تعارض داخلي موثّق في عميل Supabase عند
        // استدعاء دوال auth أخرى من within onAuthStateChange نفسه.
        if (process.env.NODE_ENV === 'development') {
          console.warn('[onAuthStateChange] unverified session detected — signing out', event);
        }
        setUser(null);
        setIsTailorRegistered(false);
        setCloudNotes('');
        setTailorShopName('');
        setTailorAvatarUrl('');
        setCheckingTailor(false);
        setLoading(false);
        setAuthBootstrapping(false);
        setSessionCheckPending(false);
        window.setTimeout(() => {
          void supabase.auth.signOut().catch(() => undefined);
        }, 0);
        return;
      }

      setUser(currentUser);
      if (currentUser) {
        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          setAuthPhase('form');
          setAuthFeedback(null);
          setOtpCode('');
          setAuthSubmitting(false);
        }
        void checkTailorAndFetchData(currentUser.id);
      } else {
        setIsTailorRegistered(false);
        setCloudNotes('');
        setTailorShopName('');
        setTailorAvatarUrl('');
        setCheckingTailor(false);
        setLoading(false);
        setAuthBootstrapping(false);
        setSessionCheckPending(false);
      }
    });

    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      cancelled = true;
      subscription.unsubscribe();
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [supabase]);

  useEffect(() => {
    if (!showWelcomeSuccess) return;
    const timer = window.setTimeout(() => setShowWelcomeSuccess(false), 2200);
    return () => window.clearTimeout(timer);
  }, [showWelcomeSuccess]);

  useEffect(() => {
    if (otpResendCooldown <= 0) return;
    const timer = window.setInterval(() => {
      setOtpResendCooldown((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [otpResendCooldown]);

  useEffect(() => {
    return () => {
      if (customerLookupTimerRef.current !== null) {
        window.clearTimeout(customerLookupTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    return () => {
      if (pendingPreviewUrlRef.current) {
        URL.revokeObjectURL(pendingPreviewUrlRef.current);
      }
    };
  }, []);

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

  useEffect(() => {
    if (!user || checkingTailor || authBootstrapping) return;
    const needsProfile = !isTailorRegistered;
    if (!needsProfile || profileOnboardingShownRef.current) return;
    profileOnboardingShownRef.current = true;
    setShowTailorProfileModal(true);
  }, [user, checkingTailor, authBootstrapping, isTailorRegistered]);

  const performLogout = async (idleReason?: boolean) => {
    if (supabase) {
      await supabase.auth.signOut();
    }
    setUser(null);
    setIsTailorRegistered(false);
    setTailorShopName('');
    setTailorAvatarUrl('');
    setCloudNotes('');
    clearPendingAvatar();
    setAvatarFeedback(null);
    profileOnboardingShownRef.current = false;
    setShowMenu(false);
    if (idleReason) {
      setAuthFeedback({
        type: 'error',
        message: 'انتهت الجلسة لعدم النشاط (5 دقائق). يرجى تسجيل الدخول مجدداً.',
      });
      setAuthPhase('form');
    }
  };

  useIdleLogout(Boolean(user && supabase), () => {
    void performLogout(true);
  });

  const applyTailorPhoneFromStorage = (phoneStr: string) => {
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
  };

  const checkTailorAndFetchData = async (userId: string) => {
    if (!supabase) {
      const local = loadLocalTailorProfile();
      if (local?.shop_name) {
        setTailorShopName(local.shop_name);
      }
      if (local?.avatar_url) {
        setTailorAvatarUrl(local.avatar_url);
      }
      if (local?.cloud_notes) {
        setCloudNotes(local.cloud_notes);
      }
      if (local?.phone) {
        applyTailorPhoneFromStorage(local.phone);
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
      const data = await withTimeout(
        fetchTailorProfile(supabase, userId),
        12_000,
        'تحميل ملف الخياط'
      );

      if (data) {
        if (data.phone) {
          setIsTailorRegistered(true);
          applyTailorPhoneFromStorage(String(data.phone));
        }
        if (data.shop_name) {
          setTailorShopName(String(data.shop_name));
        } else {
          setTailorShopName('');
        }
        setTailorAvatarUrl(resolveAvatarUrl(data.avatar_url, userId));
        if (data.cloud_notes) {
          setCloudNotes(data.cloud_notes);
        }

        void syncLocalAvatarToDatabaseIfNeeded(supabase, userId, {
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
  };

  const handleSaveTailorProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tailorLocalPhone.trim()) {
      setSettingsFeedback({
        type: 'error',
        message: 'يرجى إدخال رقم الجوال قبل الحفظ.',
      });
      return;
    }

    setSavingSettings(true);
    setSettingsFeedback(null);
    const fullPhone = `${tailorCountryCode}${tailorLocalPhone}`;
    const shopName = tailorShopName.trim();

    if (!supabase) {
      saveLocalTailorProfile({
        phone: fullPhone,
        cloud_notes: cloudNotes,
        shop_name: shopName,
        avatar_url: tailorAvatarUrl || undefined,
      });
      setIsTailorRegistered(true);
      setSettingsFeedback({
        type: 'success',
        message: 'تم حفظ إعدادات الخياط محلياً بنجاح.',
      });
      window.setTimeout(() => {
        setShowTailorProfileModal(false);
        setSettingsFeedback(null);
      }, 1400);
      setSavingSettings(false);
      return;
    }

    try {
      await upsertTailorProfile(supabase, {
        user_id: user.id,
        phone: fullPhone,
        cloud_notes: cloudNotes,
        shop_name: shopName,
        avatar_url: tailorAvatarUrl || undefined,
      });
      if (tailorAvatarUrl.trim()) {
        saveLocalAvatarUrl(user.id, tailorAvatarUrl);
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
        message: saveError instanceof Error ? saveError.message : 'فشل الحفظ.',
      });
    }
    setSavingSettings(false);
  };

  const handleAvatarFilePick = async (file: File) => {
    setAvatarFeedback(null);
    try {
      const jpegBlob = await fileToAvatarJpegBlob(file);
      if (pendingPreviewUrlRef.current) {
        URL.revokeObjectURL(pendingPreviewUrlRef.current);
      }
      pendingAvatarBlobRef.current = jpegBlob;
      const previewUrl = URL.createObjectURL(jpegBlob);
      pendingPreviewUrlRef.current = previewUrl;
      setPendingAvatarPreview(previewUrl);
      setHasPendingAvatar(true);
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

    setSavingAvatar(true);
    setAvatarFeedback(null);
    const snapshot = tailorProfileSnapshot();

    try {
      if (!supabase || !user?.id) {
        const dataUrl = await blobToDataUrl(blob);
        persistLocalTailorAvatarUrl(dataUrl, snapshot, user?.id ?? 'guest-local-user');
        setTailorAvatarUrl(dataUrl);
        clearPendingAvatar();
        setAvatarFeedback({ type: 'success', message: 'تم حفظ الصورة الشخصية بنجاح.' });
        return;
      }

      const publicUrl = await uploadTailorAvatar(supabase, user.id, blob);
      const persistTarget = await persistTailorAvatarUrl(supabase, user.id, publicUrl, snapshot);
      setTailorAvatarUrl(publicUrl);
      clearPendingAvatar();
      setAvatarFeedback({
        type: 'success',
        message:
          persistTarget === 'database'
            ? 'تم حفظ الصورة الشخصية في حسابك.'
            : 'تم حفظ الصورة على هذا الجهاز — ستُزامَن مع السحابة عند توفر الاتصال.',
      });
    } catch (saveError) {
      setAvatarFeedback({
        type: 'error',
        message: saveError instanceof Error ? saveError.message : 'تعذّر حفظ صورة الحساب.',
      });
    } finally {
      setSavingAvatar(false);
    }
  };

  const handleDiscardPendingAvatar = () => {
    clearPendingAvatar();
    setAvatarFeedback(null);
  };

  const switchAuthMode = (signUp: boolean) => {
    setIsSignUp(signUp);
    setLoginMethod('password');
    setAuthPhase('form');
    setAuthFeedback(null);
    setPassword('');
    setOtpCode('');
    setAuthSubmitting(false);
  };

  const beginConfirmationPhase = (verifyType: EmailOtpType, successMessage?: string) => {
    setOtpVerifyType(verifyType);
    setAuthPhase('confirm');
    setOtpCode('');
    setAuthFeedback({
      type: 'success',
      message: successMessage ?? AUTH_CONFIRMATION_SENT,
    });
    setOtpResendCooldown(60);
  };

  const handleSendLoginOtp = async () => {
    if (!supabase) return;
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setAuthFeedback({ type: 'error', message: 'أدخل بريدك الإلكتروني أولاً.' });
      return;
    }

    setAuthSubmitting(true);
    setAuthFeedback(null);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: trimmedEmail,
        options: {
          shouldCreateUser: false,
          emailRedirectTo: getAuthCallbackUrl(),
        },
      });
      if (error) {
        setAuthFeedback({ type: 'error', message: mapAuthErrorToArabic(error) });
        return;
      }
      beginConfirmationPhase('email');
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleResendOtp = async () => {
    if (!supabase || otpResendCooldown > 0) return;
    setAuthSubmitting(true);
    setAuthFeedback(null);
    try {
      const trimmedEmail = email.trim();
      if (otpVerifyType === 'signup') {
        const redirectTo = getAuthCallbackUrl();
        const normalized = trimmedEmail.toLowerCase();

        if (password) {
          const resendApi = await resendVerificationViaResendApi({
            email: normalized,
            password,
            emailRedirectTo: redirectTo,
          });

          if (!('unavailable' in resendApi)) {
            if (!resendApi.ok) {
              setAuthFeedback({ type: 'error', message: resendApi.message });
              return;
            }
            setAuthFeedback({
              type: 'success',
              message: `${AUTH_CONFIRMATION_RESENT} (Resend)`,
            });
            setOtpResendCooldown(60);
            return;
          }
        }

        const { error } = await supabase.auth.resend({
          type: 'signup',
          email: trimmedEmail,
          options: { emailRedirectTo: getAuthCallbackUrl() },
        });
        if (error) {
          setAuthFeedback({ type: 'error', message: mapAuthErrorToArabic(error) });
          return;
        }
      } else {
        const { error } = await supabase.auth.signInWithOtp({
          email: trimmedEmail,
          options: {
            shouldCreateUser: isSignUp,
            emailRedirectTo: getAuthCallbackUrl(),
          },
        });
        if (error) {
          setAuthFeedback({ type: 'error', message: mapAuthErrorToArabic(error) });
          return;
        }
      }
      setAuthFeedback({
        type: 'success',
        message: AUTH_CONFIRMATION_RESENT,
      });
      setOtpResendCooldown(60);
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;

    const token = otpCode.replace(/\D/g, '');
    if (token.length !== OTP_CODE_LENGTH) {
      setAuthFeedback({
        type: 'error',
        message: AUTH_OTP_INCOMPLETE,
      });
      return;
    }

    setAuthSubmitting(true);
    setAuthFeedback(null);
    try {
      const result = await verifyEmailOtpFlexible(supabase, {
        email: email.trim(),
        token,
        preferredType: otpVerifyType,
      });

      if (!result.ok) {
        setAuthFeedback({
          type: 'error',
          message: mapAuthErrorToArabic(result.error),
        });
        return;
      }

      setAuthFeedback({ type: 'success', message: 'تم التحقق من الرمز وتسجيل الدخول بنجاح.' });
      setShowWelcomeSuccess(true);
      setOtpCode('');
      setAuthPhase('form');
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isSupabaseConfigured() || !supabase) {
      setAuthFeedback({
        type: 'error',
        message:
          'إعداد Supabase غير مكتمل. أضف NEXT_PUBLIC_SUPABASE_URL و NEXT_PUBLIC_SUPABASE_ANON_KEY في .env.local ثم أعد تشغيل الخادم.',
      });
      return;
    }

    if (!isSignUp && loginMethod === 'otp') {
      await handleSendLoginOtp();
      return;
    }

    const trimmedEmail = email.trim();

    if (isSignUp && (!trimmedEmail || !password)) {
      setAuthFeedback({
        type: 'error',
        message: 'يرجى إدخال البريد الإلكتروني وكلمة المرور.',
      });
      return;
    }

    if (!isSignUp && loginMethod === 'password' && (!trimmedEmail || !password)) {
      setAuthFeedback({
        type: 'error',
        message: 'يرجى إدخال البريد الإلكتروني وكلمة المرور.',
      });
      return;
    }

    setAuthSubmitting(true);
    setAuthFeedback(null);

    try {
      let redirectTo: string;
      try {
        redirectTo = getAuthCallbackUrl();
      } catch (redirectError) {
        setAuthFeedback({
          type: 'error',
          message:
            redirectError instanceof Error
              ? redirectError.message
              : 'تعذّر تجهيز إعداد التسجيل الداخلي. تواصل مع الدعم.',
        });
        return;
      }

      if (isSignUp) {
        const normalizedEmail = trimmedEmail.toLowerCase();

        logAuthRedirectDiagnostics(redirectTo);

        if (process.env.NODE_ENV === 'development') {
          console.log('Supabase signUp request:', {
            email: normalizedEmail,
            redirectTo,
            passwordLength: password.length,
          });
        }

        let signUpResult;
        try {
          signUpResult = await executeSignUp(supabase, {
            email: normalizedEmail,
            password,
            emailRedirectTo: redirectTo,
          });
        } catch (signUpError) {
          console.error('[signUp]', signUpError);
          setAuthFeedback({
            type: 'error',
            message:
              signUpError instanceof Error
                ? signUpError.message
                : 'تعذّر إنشاء الحساب. حاول مجدداً.',
          });
          return;
        }

        const { data, error, recoveredAfterServerError, emailSentViaResend } = signUpResult;

        if (process.env.NODE_ENV === 'development') {
          console.log('Supabase signUp response:', {
            userId: data?.user?.id,
            hasSession: Boolean(data?.session),
            identitiesCount: data?.user?.identities?.length ?? 0,
            recoveredAfterServerError,
            emailSentViaResend,
          });
          if (error) {
            logSupabaseAuthErrorJson(error, 'signUp/page');
          }
        }

        const flow = resolveSignUpFlow(data, error, {
          emailRedirectTo: redirectTo,
          recoveredAfterServerError,
        });

        if (flow.kind === 'error') {
          setAuthFeedback({ type: 'error', message: flow.message });
          if (flow.message.includes('مسج')) {
            switchAuthMode(false);
          }
          setPassword('');
          return;
        }

        if (flow.kind === 'logged_in') {
          // حارس إضافي مستقل عن إعداد "Confirm email" في Supabase: لا نثق
          // بمجرد وجود جلسة — يجب أن يكون البريد مؤكداً فعلياً برمز الـ OTP.
          if (!isEmailVerifiedUser(data?.session?.user)) {
            await supabase.auth.signOut().catch(() => undefined);
            beginConfirmationPhase(
              'signup',
              'تم إنشاء حسابك. أدخل رمز التحقق (6 أرقام) المرسل إلى بريدك لإكمال تسجيل الدخول.'
            );
            setPassword('');
            return;
          }

          setAuthFeedback({
            type: 'success',
            message: recoveredAfterServerError
              ? 'تم إنشاء حسابك. تم تسجيل دخولك (بعد تعافٍ من خطأ خادم/SMTP).'
              : 'تم إنشاء حسابك وتسجيل دخولك بنجاح.',
          });
          setShowWelcomeSuccess(true);
          setPassword('');
          return;
        }

        const confirmMessage = emailSentViaResend
          ? 'تم إنشاء حسابك. أرسلنا رمز التفعيل (6 أرقام) إلى بريدك عبر Resend — أدخله أدناه.'
          : recoveredAfterServerError
            ? 'تم إنشاء حسابك، لكن إرسال رمز التفعيل قد يكون فشل. استخدم «إعادة إرسال» أو راجع إعداد Resend.'
            : undefined;

        beginConfirmationPhase('signup', confirmMessage);
        return;
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email: trimmedEmail,
        password,
      });

      if (error) {
        if (error.code === 'email_not_confirmed') {
          beginConfirmationPhase('signup');
          setAuthFeedback({ type: 'success', message: AUTH_UNCONFIRMED_LOGIN });
          return;
        }
        setAuthFeedback({ type: 'error', message: mapAuthErrorToArabic(error) });
        return;
      }

      if (data.session) {
        // نفس الحارس: تسجيل دخول ناجح بكلمة المرور لا يكفي وحده — لا بد أن
        // يكون البريد مؤكداً فعلياً برمز الـ OTP، بمعزل عن إعداد Supabase.
        if (!isEmailVerifiedUser(data.session.user)) {
          await supabase.auth.signOut().catch(() => undefined);
          beginConfirmationPhase('signup');
          setAuthFeedback({ type: 'success', message: AUTH_UNCONFIRMED_LOGIN });
          return;
        }
        setAuthFeedback({ type: 'success', message: 'تم التحقق من بياناتك وتسجيل الدخول بنجاح.' });
        setShowWelcomeSuccess(true);
        setPassword('');
      }
    } catch (unexpected) {
      console.error('[handleAuth]', unexpected);
      setAuthFeedback({
        type: 'error',
        message: 'حدث خطأ غير متوقع أثناء المعالجة. حاول مجدداً.',
      });
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleDevDeleteAuthUser = async () => {
    const targetEmail = 'rraddad@hotmail.com';
    if (
      !window.confirm(
        `[DEV] حذف نهائي للمستخدم ${targetEmail} من Supabase Auth؟`
      )
    ) {
      return;
    }

    setDevDeleteLoading(true);
    setDevDeleteStatus(null);
    try {
      const res = await fetch('/api/dev/delete-auth-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: targetEmail }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        message?: string;
        userId?: string;
      };
      const line = data.ok
        ? `[DEV] ✅ ${data.message}${data.userId ? ` (id: ${data.userId})` : ''}`
        : `[DEV] ℹ️ ${data.message ?? 'فشل غير معروف'} — (ليست رسالة تسجيل دخول)`;
      setDevDeleteStatus(line);
      console.info('[DEV delete-auth-user]', data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Network error';
      setDevDeleteStatus(`❌ ${msg}`);
      console.error('[DEV delete-auth-user]', err);
    } finally {
      setDevDeleteLoading(false);
    }
  };

  const handleLogout = async () => {
    await performLogout(false);
  };

  const scheduleCustomerDirectoryLookup = (localPhone: string, cCode: string) => {
    if (customerLookupTimerRef.current !== null) {
      window.clearTimeout(customerLookupTimerRef.current);
    }
    if (localPhone.length < 3) {
      setCustomerBookStatus('idle');
      return;
    }
    customerLookupTimerRef.current = window.setTimeout(() => {
      void (async () => {
        setCustomerBookStatus('searching');
        const fullPhone = `${cCode}${localPhone}`;
        try {
          const hit = await lookupTailorCustomerByPhone(
            supabase,
            user?.id ?? 'guest-local-user',
            fullPhone
          );
          if (hit) {
            setCustomerDisplayName(hit.customer_name);
            setCustomerBookStatus('known');
            setCustomerNameLocked(true);
            setCustomerNameEditing(false);
          } else {
            setCustomerDisplayName('');
            setCustomerBookStatus('new');
            setCustomerNameLocked(false);
            setCustomerNameEditing(false);
          }
        } catch (lookupError) {
          if (process.env.NODE_ENV === 'development') {
            console.warn('[tailor_customers] lookup failed', lookupError);
          }
          setCustomerBookStatus('new');
        }
      })();
    }, 200);
  };

  const handleCustomerPhoneInput = (val: string) => {
    const cleanVal = val.replace(/\D/g, '');
    setCustomerLocalPhone(cleanVal);
    if (cleanVal.length < 3) {
      setCustomerDisplayName('');
      setCustomerBookStatus('idle');
      setCustomerNameLocked(false);
      setCustomerNameEditing(false);
    } else {
      setCustomerBookStatus('searching');
    }
    if (cleanVal.length >= 1) {
      void searchInvoices(cleanVal, customerCountryCode);
      scheduleCustomerDirectoryLookup(cleanVal, customerCountryCode);
    } else {
      setCustomerInvoices([]);
      setWhatsappMessages({});
    }
  };

  const handleOpenScannerForCustomer = () => {
    if (!customerLocalPhone.trim()) {
      return;
    }
    if (!customerDisplayName.trim()) {
      setUploadSaveError('أدخل اسم العميل مع رقم الجوال قبل التصوير.');
      window.setTimeout(() => setUploadSaveError(null), 3500);
      return;
    }
    setUploadSaveError(null);
    setShowDocumentScanner(true);
  };

  const handleOpenOpenCvScanner = () => {
    if (!customerLocalPhone.trim()) {
      return;
    }
    if (!customerDisplayName.trim()) {
      setUploadSaveError('أدخل اسم العميل مع رقم الجوال قبل التصوير.');
      window.setTimeout(() => setUploadSaveError(null), 3500);
      return;
    }
    setUploadSaveError(null);
    setShowOpenCvScanner(true);
  };

  const handleSaveCustomerContact = async () => {
    const localPhone = customerLocalPhone.trim();
    const name = customerDisplayName.trim();
    if (!localPhone) {
      setUploadSaveError('أدخل رقم جوال العميل.');
      window.setTimeout(() => setUploadSaveError(null), 3500);
      return;
    }
    if (!name) {
      setUploadSaveError('أدخل اسم العميل.');
      window.setTimeout(() => setUploadSaveError(null), 3500);
      return;
    }
    try {
      await upsertTailorCustomer(
        supabase,
        user?.id ?? 'guest-local-user',
        `${customerCountryCode}${localPhone}`,
        name
      );
      setCustomerBookStatus('known');
      setCustomerNameLocked(true);
      setCustomerNameEditing(false);
      setUploadSaveError(null);
    } catch (err) {
      setUploadSaveError(err instanceof Error ? err.message : 'تعذّر حفظ بيانات العميل.');
      window.setTimeout(() => setUploadSaveError(null), 4000);
    }
  };

  const handleCountryCodeChange = (newCode: string) => {
    setCustomerCountryCode(newCode);
    if (customerLocalPhone.length >= 3) {
      setCustomerBookStatus('searching');
    } else {
      setCustomerDisplayName('');
      setCustomerBookStatus('idle');
      setCustomerNameLocked(false);
      setCustomerNameEditing(false);
    }
    if (customerLocalPhone.length >= 1) {
      void searchInvoices(customerLocalPhone, newCode);
      scheduleCustomerDirectoryLookup(customerLocalPhone, newCode);
    }
  };

  const searchInvoices = async (localPhone: string, cCode: string) => {
    const variants = phoneMatchVariants(cCode, localPhone);

    setIsSearchingInvoices(true);
    try {
      if (!supabase) {
        const savedInvoices = JSON.parse(localStorage.getItem('mistarh_local_invoices') || '[]');
        const filtered = savedInvoices.filter((inv: { customer_phone?: string }) =>
          variants.some((variant) => phonesMatch(String(inv.customer_phone ?? ''), variant))
        );
        setCustomerInvoices(filtered);
        const initialMessages: { [key: string]: string } = {};
        filtered.forEach((inv: { id: string; image_url: string; pdf_url?: string | null }) => {
          initialMessages[inv.id] = `تم! شكراً لتعاملك معنا، نسعد بخدمتك. رابط مستندك (PDF): ${invoiceShareDocumentUrl(inv)}`;
        });
        setWhatsappMessages(initialMessages);
        return;
      }

      const { data, error } = await supabase
        .from('invoices')
        .select('id, user_id, customer_phone, image_url, pdf_url, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) {
        if (process.env.NODE_ENV === 'development') {
          console.warn('[invoices] search failed', error);
        }
        setCustomerInvoices([]);
        setWhatsappMessages({});
        return;
      }

      const filtered = (data ?? []).filter((inv) =>
        variants.some((variant) => phonesMatch(String(inv.customer_phone ?? ''), variant))
      );
      setCustomerInvoices(filtered);
      const initialMessages: { [key: string]: string } = {};
      filtered.forEach((inv) => {
        initialMessages[inv.id] = `تم! شكراً لتعاملك معنا، نسعد بخدمتك. رابط مستندك (PDF): ${invoiceShareDocumentUrl(inv)}`;
      });
      setWhatsappMessages(initialMessages);
    } finally {
      setIsSearchingInvoices(false);
    }
  };

  /** يقرأ Blob ويحوّله إلى data URL (لاستخدامه في وضع الضيف بدون Supabase). */
  const blobToDataUrl = (blob: Blob): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error ?? new Error('تعذّر قراءة ملف المستند.'));
      reader.readAsDataURL(blob);
    });

  /**
   * بعد الماسح: PDF مُولَّد في الواجهة الأمامية → رفع PDF إلى Storage → حفظ
   * `pdf_url` (+ صورة JPEG للمعاينة) في جدول `invoices`.
   */
  const handleDocumentCaptured = async ({ jpegBlob, pdfBlob }: DocumentScanResult) => {
    if (!customerLocalPhone.trim()) {
      throw new Error('يرجى كتابة رقم جوال العميل أولاً.');
    }

    const localPhone = customerLocalPhone;
    const fullCustomerPhone = `${customerCountryCode}${localPhone}`;

    let nameToSave = customerDisplayName.trim();
    if (!nameToSave) {
      try {
        const hit = await lookupTailorCustomerByPhone(
          supabase,
          user?.id ?? 'guest-local-user',
          fullCustomerPhone
        );
        if (hit) {
          nameToSave = hit.customer_name;
          setCustomerDisplayName(hit.customer_name);
          setCustomerBookStatus('known');
        }
      } catch {
        /* ignore lookup errors before save */
      }
    }
    if (!nameToSave) {
      throw new Error('يرجى إدخال اسم العميل لحفظه في قائمة عملائك.');
    }

    setUploadSavePhase('preparing');
    setUploadSaveError(null);
    setIsUploading(true);

    try {
      if (!supabase) {
        setUploadSavePhase('uploading');
        const imageUrl = await blobToDataUrl(jpegBlob);
        const pdfUrl = await blobToDataUrl(pdfBlob);

        const newInvoice = {
          id: 'local-' + Date.now(),
          user_id: 'guest-local-user',
          customer_phone: fullCustomerPhone,
          image_url: imageUrl,
          pdf_url: pdfUrl,
          created_at: new Date().toISOString(),
        };

        const savedInvoices = JSON.parse(localStorage.getItem('mistarh_local_invoices') || '[]');
        const updatedInvoices = [newInvoice, ...savedInvoices];
        localStorage.setItem('mistarh_local_invoices', JSON.stringify(updatedInvoices));

        await upsertTailorCustomer(
          supabase,
          user?.id ?? 'guest-local-user',
          fullCustomerPhone,
          nameToSave
        );

        searchInvoices(localPhone, customerCountryCode);
        setUploadSavePhase('success');
        window.setTimeout(() => setUploadSavePhase('idle'), 2800);
      } else {
        setUploadSavePhase('uploading');
        const { imageUrl, pdfUrl } = await uploadScannedInvoiceFiles(
          supabase,
          user.id,
          { jpegBlob, pdfBlob },
          { label: fullCustomerPhone }
        );

        await insertInvoiceRecord(supabase, {
          user_id: user.id,
          customer_phone: fullCustomerPhone,
          image_url: imageUrl,
          pdf_url: pdfUrl,
        });

        await upsertTailorCustomer(supabase, user.id, fullCustomerPhone, nameToSave);
        setCustomerBookStatus('known');

        await searchInvoices(localPhone, customerCountryCode);
        setUploadSavePhase('success');
        setShowDocumentScanner(false);
        setShowOpenCvScanner(false);
        window.setTimeout(() => setUploadSavePhase('idle'), 2800);
      }
    } catch (saveErr) {
      const msg = saveErr instanceof Error ? saveErr.message : 'تعذّر حفظ الفاتورة.';
      setUploadSaveError(msg);
      setUploadSavePhase('error');
      window.setTimeout(() => {
        setUploadSavePhase('idle');
        setUploadSaveError(null);
      }, 4000);
      throw saveErr;
    } finally {
      setIsUploading(false);
    }
  };

  const sendViaWhatsApp = (fullPhone: string, invoiceId: string) => {
    let cleanPhone = fullPhone.replace(/\D/g, '');
    const messageText = whatsappMessages[invoiceId] || 'شكراً لتعاملك معنا!';
    const encodedMessage = encodeURIComponent(messageText);
    window.open(`https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodedMessage}`, '_blank');
  };

  /** يبني بيانات العنوان (اسم الملف + نص الترويسة) الخاصة بفاتورة معينة لأغراض تصدير PDF. */
  const buildInvoicePdfLabel = (invoice: any, invoiceNumber: number) => ({
    fileName: `invoice-${invoiceNumber}`,
    meta: {
      invoiceLabel: `Invoice #${invoiceNumber}`,
      dateLabel: formatDate(invoice.created_at),
    },
  });

  /** تنزيل الفاتورة كملف PDF (بديل تنزيل/فتح الصورة الخام مباشرة). */
  const handleDownloadInvoicePdf = async (invoice: any, invoiceNumber: number) => {
    if ((!invoice?.image_url && !invoice?.pdf_url) || exportingPdfId) return;
    setExportingPdfId(invoice.id);
    try {
      const { fileName, meta } = buildInvoicePdfLabel(invoice, invoiceNumber);
      if (invoice.pdf_url) {
        await downloadStoredPdf(invoice.pdf_url, fileName);
        return;
      }
      await downloadInvoiceAsPdf(invoice.image_url, fileName, meta);
    } catch (error: any) {
      alert(`تعذّر تنزيل PDF: ${error?.message || 'خطأ غير متوقع'}`);
    } finally {
      setExportingPdfId(null);
    }
  };

  /** فتح معاينة PDF للفاتورة في تبويب جديد جاهزة للطباعة مباشرة. */
  const handlePrintInvoicePdf = async (invoice: any, invoiceNumber: number) => {
    if ((!invoice?.image_url && !invoice?.pdf_url) || exportingPdfId) return;
    setExportingPdfId(invoice.id);
    try {
      if (invoice.pdf_url) {
        openStoredPdfForPrint(invoice.pdf_url);
        return;
      }
      const { meta } = buildInvoicePdfLabel(invoice, invoiceNumber);
      await openInvoicePdfForPrint(invoice.image_url, meta);
    } catch (error: any) {
      alert(`تعذّر تجهيز معاينة الطباعة: ${error?.message || 'خطأ غير متوقع'}`);
    } finally {
      setExportingPdfId(null);
    }
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('en-GB', {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }).format(date);
  };

  const showAppBootScreen = Boolean(user) && (loading || checkingTailor || authBootstrapping);

  if (showAppBootScreen) {
    return (
      <AuthBootScreen
        message={
          authBootstrapping
            ? 'جاري التحقق من جلسة الدخول...'
            : 'جاري تحميل بيانات حسابك...'
        }
      />
    );
  }

  if (!user && isSupabaseConfigured()) {
    /* مصادقة قياسية فقط: بريد + كلمة مرور أو OTP — بدون Passkey / Face ID. */
    return (
      <main
        className="relative min-h-screen bg-mistara-sand flex flex-col justify-center px-5 sm:px-8 py-8 sm:py-12 overflow-hidden"
        dir="rtl"
      >
        <div
          className="pointer-events-none absolute -top-32 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-mistara-gold/15 blur-[100px]"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -bottom-32 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-mistara-gold/10 blur-[100px]"
          aria-hidden
        />
        <div className="relative w-full max-w-sm sm:max-w-md mx-auto glass-panel/90 backdrop-blur-xl border border-mistara-brown/12 rounded-[2rem] p-6 sm:p-8 shadow-[0_25px_70px_-15px_rgba(212,175,55,0.22)] space-y-6">
          <AppBrand
            size="lg"
            subtitle="نظام إدارة فواتير الخياطة الذكي"
            priority
            className="mb-1"
          />
          {sessionCheckPending && (
            <p className="text-xs text-mistara-brown/60 -mt-3 text-center animate-pulse">
              جاري التحقق من جلسة الدخول...
            </p>
          )}

          {authPhase === 'confirm' ? (
            <AuthConfirmationPanel
              email={email}
              otpCode={otpCode}
              onOtpCodeChange={setOtpCode}
              authFeedback={authFeedback}
              onClearError={() => setAuthFeedback(null)}
              authSubmitting={authSubmitting}
              otpResendCooldown={otpResendCooldown}
              onVerifyOtp={handleVerifyOtp}
              onResend={() => void handleResendOtp()}
              onBack={() => {
                setAuthPhase('form');
                setOtpCode('');
                setAuthFeedback(null);
              }}
            />
          ) : (
            <>
              <AuthModeTabs
                mode={isSignUp ? 'signup' : 'signin'}
                onModeChange={(mode) => switchAuthMode(mode === 'signup')}
              />

              {authFeedback && (
                <div
                  role="alert"
                  className={`flex items-start gap-3 rounded-2xl border px-3 py-3 text-sm leading-relaxed ${
                    authFeedback.type === 'success'
                      ? 'border-mistara-gold-dark/40 bg-mistara-gold/10 text-mistara-brown'
                      : 'border-red-800/35 bg-red-800/8 text-red-900'
                  }`}
                >
                  <span
                    className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                      authFeedback.type === 'success'
                        ? 'bg-mistara-gold/15 ring-2 ring-mistara-gold/40'
                        : 'bg-red-800/10 ring-2 ring-rose-500/40'
                    }`}
                  >
                    {authFeedback.type === 'success' ? (
                      <svg className="h-4 w-4 text-mistara-gold-dark" viewBox="0 0 24 24" fill="none" aria-hidden>
                        <path
                          d="M5 13l4 4L19 7"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    ) : (
                      <svg className="h-4 w-4 text-red-700" viewBox="0 0 24 24" fill="none" aria-hidden>
                        <path
                          d="M8 8l8 8M16 8l-8 8"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                        />
                      </svg>
                    )}
                  </span>
                  <p>{authFeedback.message}</p>
                </div>
              )}

              <form
                id="auth-panel-form"
                role="tabpanel"
                aria-labelledby={isSignUp ? 'auth-tab-signup' : 'auth-tab-signin'}
                onSubmit={handleAuth}
                className="space-y-4 relative z-10"
              >
                <div>
                  <label className="block text-sm font-bold text-mistara-gold mb-1.5">البريد الإلكتروني</label>
                  <input
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (authFeedback) setAuthFeedback(null);
                    }}
                    className={`w-full rounded-2xl bg-mistara-cream/70 border p-3.5 text-base text-mistara-espresso placeholder:text-mistara-brown/50 outline-none transition-all focus:ring-4 ${
                      authFeedback?.type === 'error'
                        ? 'border-red-800/50 focus:border-rose-400 focus:ring-rose-500/10'
                        : 'border-mistara-brown/15 focus:border-mistara-gold focus:ring-mistara-gold/15'
                    }`}
                  />
                </div>
                {!isSignUp && (
                  <div className="grid grid-cols-2 gap-1 p-1 rounded-2xl bg-mistara-cream/70 border border-mistara-brown/15">
                    <button
                      type="button"
                      onClick={() => {
                        setLoginMethod('password');
                        setAuthFeedback(null);
                      }}
                      className={`rounded-xl py-2.5 text-xs sm:text-sm font-bold transition-all ${
                        loginMethod === 'password'
                          ? 'bg-mistara-gold text-mistara-cream shadow-md shadow-mistara-gold/15'
                          : 'text-mistara-brown/60 hover:text-mistara-brown'
                      }`}
                    >
                      كلمة المرور
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setLoginMethod('otp');
                        setAuthFeedback(null);
                      }}
                      className={`rounded-xl py-2.5 text-xs sm:text-sm font-bold transition-all ${
                        loginMethod === 'otp'
                          ? 'bg-mistara-gold text-mistara-cream shadow-md shadow-mistara-gold/15'
                          : 'text-mistara-brown/60 hover:text-mistara-brown'
                      }`}
                    >
                      رمز مؤقت (OTP)
                    </button>
                  </div>
                )}
                {(isSignUp || loginMethod === 'password') && (
                <div>
                  <label className="block text-sm font-bold text-mistara-gold mb-1.5">كلمة المرور</label>
                  <input
                    type="password"
                    required={isSignUp || loginMethod === 'password'}
                    minLength={6}
                    autoComplete={isSignUp ? 'new-password' : 'current-password'}
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (authFeedback) setAuthFeedback(null);
                    }}
                    className={`w-full rounded-2xl bg-mistara-cream/70 border p-3.5 text-base text-mistara-espresso placeholder:text-mistara-brown/50 outline-none transition-all focus:ring-4 ${
                      authFeedback?.type === 'error'
                        ? 'border-red-800/50 focus:border-rose-400 focus:ring-rose-500/10'
                        : 'border-mistara-brown/15 focus:border-mistara-gold focus:ring-mistara-gold/15'
                    }`}
                  />
                  {isSignUp && (
                    <p className="text-xs text-mistara-brown/60 mt-1.5">6 أحرف على الأقل — يُفضّل أرقام ورموز.</p>
                  )}
                </div>
                )}
                {!isSignUp && loginMethod === 'otp' && (
                  <p className="text-xs text-mistara-brown/80 leading-relaxed bg-mistara-cream/50 border border-mistara-brown/15 rounded-xl p-2.5">
                    سنرسل رمز تحقق مكوّناً من 6 أرقام إلى بريدك لتسجيل الدخول دون كلمة مرور.
                  </p>
                )}
                <button
                  type="submit"
                  disabled={authSubmitting}
                  className="w-full rounded-2xl bg-gradient-to-l from-mistara-gold to-mistara-gold-dark py-3.5 text-mistara-cream font-black text-base shadow-lg shadow-mistara-gold/15 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none flex items-center justify-center gap-2 transition-all active:scale-[0.99]"
                >
                  {authSubmitting && (
                    <span className="h-4 w-4 rounded-full border-2 border-mistara-brown/20 border-t-mistara-espresso animate-spin" />
                  )}
                  {authSubmitting
                    ? isSignUp
                      ? 'جاري إنشاء الحساب...'
                      : 'جاري التحقق...'
                    : !isSignUp && loginMethod === 'otp'
                      ? 'إرسال رمز الدخول'
                      : isSignUp
                        ? 'إنشاء حساب جديد'
                        : 'تسجيل الدخول'}
                </button>
              </form>
            </>
          )}

          {authPhase === 'form' && (
            <div className="text-center pt-2 border-t border-mistara-brown/15 space-y-2">
              <button
                onClick={() => setUser({ id: 'guest-local-user', email: 'guest@mistarh.local' })}
                className="w-full bg-mistara-beige hover:bg-mistara-beige/80 text-mistara-warm text-sm py-3 rounded-xl border border-mistara-gold/20 font-bold"
              >
                🚀 الدخول الفوري وتجربة النظام (بلا حساب)
              </button>

              {process.env.NODE_ENV === 'development' && (
                <div className="rounded-xl border border-mistara-gold-dark/35 bg-amber-500/5 p-3 text-right space-y-2">
                  <p className="text-xs font-bold text-mistara-gold-dark">أدوات المطوّر (DEV فقط)</p>
                  <button
                    type="button"
                    disabled={devDeleteLoading}
                    onClick={() => void handleDevDeleteAuthUser()}
                    className="w-full bg-mistara-gold/15 text-mistara-warm text-[10px] py-2 rounded-lg border border-amber-500/40 font-mono disabled:opacity-50"
                  >
                    {devDeleteLoading
                      ? 'جاري الحذف عبر Admin API...'
                      : 'حذف Auth: rraddad@hotmail.com'}
                  </button>
                  {devDeleteStatus && (
                    <p className="text-[10px] text-mistara-warm/80 font-mono break-all leading-relaxed">
                      {devDeleteStatus}
                    </p>
                  )}
                  <p className="text-[9px] text-mistara-brown/50">
                    لا تُخلط بين رسائل أداة DEV أعلاه وبين تنبيهات تسجيل الدخول في النموذج.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-mistara-sand text-mistara-espresso flex flex-col relative pb-36" dir="rtl">
      {showWelcomeSuccess && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center glass-modal-backdrop px-6">
          <div className="w-full max-w-xs rounded-3xl border border-mistara-gold-dark/30 glass-panel p-6 text-center shadow-2xl space-y-3">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-mistara-gold/12 ring-4 ring-mistara-gold/30">
              <svg className="h-8 w-8 text-mistara-gold-dark" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path
                  d="M5 13l4 4L19 7"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <p className="text-base font-bold text-mistara-gold-dark">تم التحقق بنجاح</p>
            <p className="text-sm text-mistara-brown/80">مرحباً بك في لوحة مسطرة</p>
          </div>
        </div>
      )}
      {/* الهيدر العلوي */}
      <header className="sticky top-0 z-40 glass-header px-4 sm:px-6 lg:px-8 py-3">
        <div className="max-w-lg sm:max-w-2xl lg:max-w-4xl w-full mx-auto flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <AppBrand size="sm" layout="row" showTitle subtitle={undefined} />
          {!isSupabaseConfigured() && (
            <span className="text-xs bg-mistara-gold/15 text-mistara-gold-dark border border-mistara-gold-dark/35 px-2 py-0.5 rounded-full font-mono">وضع التجربة (بلا حساب)</span>
          )}
        </div>

        <div className="relative" ref={menuRef}>
          <AccountMenuTrigger avatarUrl={tailorAvatarUrl} onClick={() => setShowMenu(!showMenu)} />

          <AccountMenuPanel
            open={showMenu}
            email={user?.email}
            tailorShopName={tailorShopName}
            isTailorRegistered={isTailorRegistered}
            tailorCountryCode={tailorCountryCode}
            tailorLocalPhone={tailorLocalPhone}
            avatarUrl={tailorAvatarUrl}
            pendingAvatarPreview={pendingAvatarPreview}
            hasPendingAvatar={hasPendingAvatar}
            savingAvatar={savingAvatar}
            avatarFeedback={avatarFeedback}
            onAvatarFilePick={(file) => void handleAvatarFilePick(file)}
            onSaveAvatar={() => void handleSaveAvatar()}
            onDiscardPendingAvatar={handleDiscardPendingAvatar}
            onOpenSettings={() => {
              setShowMenu(false);
              setShowTailorProfileModal(true);
            }}
            onLogout={() => void handleLogout()}
          />
        </div>
        </div>
      </header>

      {/* المحتوى الرئيسي */}
      <main className="flex-1 max-w-lg sm:max-w-2xl lg:max-w-4xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-4 sm:space-y-6">

        {/* رقم العميل + الاسم — إدخال مباشر */}
        <section className="glass-panel border border-mistara-gold/35 p-4 rounded-3xl space-y-3 shadow-xl">
          <div className="space-y-1.5">
            <label className="text-sm text-mistara-gold font-bold block">رقم هاتف العميل</label>
            <div className="flex gap-2 items-center">
              <input
                type="tel"
                value={customerLocalPhone}
                onChange={(e) => handleCustomerPhoneInput(e.target.value)}
                placeholder="50123456"
                className="flex-1 min-w-0 rounded-xl bg-mistara-cream border border-mistara-brown/15 p-3.5 text-lg font-bold text-mistara-espresso font-mono tnum text-right"
                dir="ltr"
              />
              <select
                value={customerCountryCode}
                onChange={(e) => handleCountryCodeChange(e.target.value)}
                className="bg-mistara-cream border border-mistara-brown/15 text-sm text-mistara-warm rounded-xl p-3.5 font-mono tnum w-28 text-center shrink-0"
              >
                {COUNTRY_CODES.map((c) => (
                  <option key={c.code} value={c.code}>+{c.code}</option>
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
                onChange={(e) => setCustomerDisplayName(e.target.value)}
                readOnly={customerNameLocked && !customerNameEditing}
                placeholder="اكتب اسم العميل هنا..."
                className={`flex-1 min-w-0 rounded-xl bg-mistara-cream border border-mistara-brown/15 p-3.5 text-base font-bold text-mistara-espresso ${
                  customerNameLocked && !customerNameEditing ? 'cursor-default opacity-90' : ''
                }`}
              />
              {customerBookStatus === 'known' &&
                customerDisplayName.trim() &&
                !customerNameEditing && (
                  <button
                    type="button"
                    onClick={() => {
                      setCustomerNameEditing(true);
                      setCustomerNameLocked(false);
                    }}
                    className="shrink-0 rounded-xl glass-panel border border-mistara-gold/35 px-3.5 text-mistara-warm font-bold text-sm hover:bg-mistara-beige transition-colors"
                    aria-label="تعديل اسم العميل"
                    title="تعديل الاسم"
                  >
                    ✏️
                  </button>
                )}
            </div>
          </div>

          {customerLocalPhone.length >= 3 &&
            customerDisplayName.trim() &&
            customerBookStatus === 'new' && (
              <button
                type="button"
                onClick={() => void handleSaveCustomerContact()}
                className="w-full bg-mistara-gold text-mistara-cream text-sm font-bold py-3 rounded-xl shadow"
              >
                حفظ الرقم والاسم في دفتر العملاء
              </button>
            )}

          {customerNameEditing && customerBookStatus === 'known' && customerDisplayName.trim() && (
            <button
              type="button"
              onClick={() => void handleSaveCustomerContact()}
              className="w-full bg-mistara-gold-dark text-mistara-cream text-sm font-bold py-3 rounded-xl shadow"
            >
              حفظ الاسم المحدّث
            </button>
          )}

          {uploadSaveError && customerLocalPhone.length >= 1 && uploadSavePhase === 'idle' && (
            <p className="text-xs text-red-800 font-bold">{uploadSaveError}</p>
          )}

          {customerLocalPhone.length >= 1 && (
            <p className="text-[11px] text-mistara-brown/60 font-bold">
              {isSearchingInvoices || customerBookStatus === 'searching'
                ? 'جاري البحث في سجل العملاء والفواتير...'
                : customerBookStatus === 'known' && customerDisplayName
                  ? `عميل مسجّل: ${customerDisplayName}`
                  : customerInvoices.length > 0
                    ? `تم العثور على ${customerInvoices.length} مستند/فاتورة سابقة.`
                    : customerLocalPhone.length >= 3
                      ? 'رقم جديد — اكتب الاسم واحفظ، أو استخدم زر الكاميرا بالأسفل.'
                      : 'أكمل رقم الجوال (3 أرقام على الأقل) للبحث.'}
            </p>
          )}

          {customerLocalPhone.length >= 3 && customerDisplayName.trim() && (
            <button
              type="button"
              onClick={handleOpenOpenCvScanner}
              disabled={isUploading || uploadSavePhase !== 'idle'}
              className="w-full rounded-xl border border-mistara-gold/25 bg-mistara-cream/60 py-2.5 text-xs font-bold text-mistara-gold backdrop-blur-sm transition-colors hover:border-mistara-gold/35 hover:text-mistara-warm disabled:opacity-50"
            >
              ✨ ماسح OpenCV المتقدّم — اكتشاف حي للحواف
            </button>
          )}
        </section>

        {/* عرض الفواتير: الفاتورة الحديثة (الأحدث) ضخمة في المقدمة يعقبها الأرشيف */}
        {customerLocalPhone.length >= 1 && customerInvoices.length > 0 && (
          <section className="space-y-4">
            <h2 className="text-base sm:text-lg text-mistara-gold font-bold">
              أرشيف فواتير العميل (<span className="tnum">{customerInvoices.length}</span>)
            </h2>

            {/* الفاتورة الأحدث */}
            {(() => {
              const latestInvoice = customerInvoices[0];
              const latestIndex = 0;
              const latestInvoiceNumber = customerInvoices.length;

              return (
                <div className="glass-panel border-2 border-mistara-gold/50 rounded-3xl p-4 shadow-2xl space-y-3">
                  <div className="flex items-center justify-between bg-mistara-cream px-4 py-2.5 rounded-2xl border border-mistara-gold/30">
                    <div>
                      <span className="text-sm sm:text-base font-black text-mistara-warm">
                        ⭐ الفاتورة الأحدث (فاتورة #<span className="tnum">{latestInvoiceNumber}</span>)
                      </span>
                      <span className="text-xs text-mistara-brown/80 font-bold font-mono tnum block" dir="ltr">{formatDate(latestInvoice.created_at)}</span>
                    </div>
                  </div>

                  {/* معاينة الفاتورة الكبيرة */}
                  <div className="w-full bg-mistara-cream rounded-2xl border border-mistara-brown/15 p-2 flex flex-col items-center space-y-3">
                    <div 
                      onClick={() => setActiveImageIndex(latestIndex)}
                      className="w-full h-96 sm:h-[28rem] lg:h-[32rem] rounded-xl overflow-hidden border border-mistara-gold/30 glass-panel cursor-pointer relative shadow-inner flex items-center justify-center"
                    >
                      <img 
                        src={latestInvoice.image_url} 
                        alt="Latest Invoice" 
                        className="w-full h-full object-contain"
                      />
                    </div>

                    <div className="flex gap-2 w-full">
                      <button
                        onClick={() => setActiveImageIndex(latestIndex)}
                        className="flex-1 bg-mistara-gold/10 text-mistara-gold border border-mistara-gold/30 text-sm py-3 rounded-xl font-bold"
                      >
                        تكبير المعاينة
                      </button>
                      <button
                        type="button"
                        disabled={exportingPdfId === latestInvoice.id}
                        onClick={() => handleDownloadInvoicePdf(latestInvoice, latestInvoiceNumber)}
                        className="flex-1 bg-mistara-gold text-mistara-cream font-bold text-sm py-3 rounded-xl text-center shadow-md flex items-center justify-center gap-1 disabled:opacity-50"
                      >
                        <span>{exportingPdfId === latestInvoice.id ? 'جارٍ التجهيز...' : '📄 تنزيل PDF'}</span>
                      </button>
                    </div>
                    <button
                      type="button"
                      disabled={exportingPdfId === latestInvoice.id}
                      onClick={() => handlePrintInvoicePdf(latestInvoice, latestInvoiceNumber)}
                      className="w-full glass-panel text-mistara-warm border border-mistara-gold/30 text-sm py-3 rounded-xl font-bold flex items-center justify-center gap-1 disabled:opacity-50"
                    >
                      <span>{exportingPdfId === latestInvoice.id ? 'جارٍ التجهيز...' : '🖨️ معاينة وطباعة PDF'}</span>
                    </button>
                  </div>

                  {/* خانة رسالة الواتساب المخصصة تحت الفاتورة الأحدث */}
                  <div className="bg-mistara-cream border border-mistara-brown/15 rounded-2xl p-3 space-y-2">
                    <label className="text-sm text-mistara-gold font-bold block">رسالة الواتساب المخصصة لهذه الفاتورة:</label>
                    <textarea
                      value={whatsappMessages[latestInvoice.id] || ''}
                      onChange={(e) => setWhatsappMessages({ ...whatsappMessages, [latestInvoice.id]: e.target.value })}
                      rows={3}
                      className="w-full glass-panel border border-mistara-brown/15 rounded-xl p-3 text-sm text-mistara-espresso focus:border-mistara-gold focus:outline-none resize-y"
                      placeholder="اكتب رسالة الواتساب..."
                    />
                    <button
                      onClick={() => sendViaWhatsApp(latestInvoice.customer_phone, latestInvoice.id)}
                      className="w-full bg-mistara-gold-dark hover:bg-mistara-gold text-mistara-cream font-bold text-base py-3.5 rounded-xl flex items-center justify-center gap-2 shadow-lg transition-all"
                    >
                      <span>💬 إرسال عبر واتساب</span>
                    </button>
                  </div>
                </div>
              );
            })()}

            {/* الفواتير القديمة والأرشيف: عمود واحد على الجوال، شبكة على الشاشات الأوسع لتفادي الفراغ الجانبي */}
            {customerInvoices.length > 1 && (
              <div className="space-y-3 pt-2">
                <h3 className="text-sm text-mistara-brown/80 font-bold">الفواتير السابقة (الأرشيف)</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                  {customerInvoices.slice(1).map((inv, subIndex) => {
                    const actualIndex = subIndex + 1;
                    const invoiceNumber = customerInvoices.length - actualIndex;

                    return (
                      <div key={inv.id} className="glass-panel border border-mistara-brown/15 rounded-2xl p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-mistara-gold font-bold">
                            فاتورة #<span className="tnum">{invoiceNumber}</span>
                          </span>
                          <span className="text-xs text-mistara-brown/60 font-bold font-mono tnum" dir="ltr">{formatDate(inv.created_at)}</span>
                        </div>
                        
                        <div className="flex gap-3">
                          <div 
                            onClick={() => setActiveImageIndex(actualIndex)}
                            className="w-24 h-32 shrink-0 rounded-xl overflow-hidden bg-mistara-cream border border-mistara-brown/15 cursor-pointer relative flex items-center justify-center"
                          >
                            <img src={inv.image_url} alt="Old Invoice" className="w-full h-full object-contain" />
                          </div>

                          <div className="flex-1 min-w-0 space-y-2">
                            <textarea
                              value={whatsappMessages[inv.id] || ''}
                              onChange={(e) => setWhatsappMessages({ ...whatsappMessages, [inv.id]: e.target.value })}
                              rows={2}
                              className="w-full bg-mistara-cream border border-mistara-brown/15 rounded-xl p-2 text-sm text-mistara-espresso focus:border-mistara-gold focus:outline-none resize-y"
                            />
                            <div className="flex gap-1.5">
                              <button
                                onClick={() => sendViaWhatsApp(inv.customer_phone, inv.id)}
                                className="flex-1 bg-mistara-gold/15 text-mistara-gold-dark border border-mistara-gold-dark/30 text-xs sm:text-sm font-bold py-2.5 rounded-xl flex items-center justify-center gap-1.5"
                              >
                                <span>💬 واتساب</span>
                              </button>
                              <button
                                type="button"
                                disabled={exportingPdfId === inv.id}
                                onClick={() => handleDownloadInvoicePdf(inv, invoiceNumber)}
                                className="flex-1 bg-mistara-gold/15 text-mistara-warm border border-mistara-gold/30 text-xs sm:text-sm font-bold py-2.5 rounded-xl flex items-center justify-center gap-1.5 disabled:opacity-50"
                              >
                                <span>{exportingPdfId === inv.id ? '...' : '📄 PDF'}</span>
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </section>
        )}
      </main>

      {/* زر الكاميرا / الماسح في منتصف أسفل الشاشة — يفتح ماسح المستندات بأربع زوايا (شبيه HP Smart) */}
      {customerLocalPhone.trim().length >= 1 && (
        <div className="fixed bottom-4 left-0 right-0 z-40 flex justify-center items-center pointer-events-none">
          {uploadSavePhase !== 'idle' ? (
            <InvoiceSaveProgressRing phase={uploadSavePhase} errorMessage={uploadSaveError} />
          ) : (
            <button
              type="button"
              onClick={handleOpenScannerForCustomer}
              disabled={isUploading}
              className="pointer-events-auto w-24 h-24 rounded-full bg-gradient-to-tr from-mistara-gold via-mistara-gold-light to-mistara-gold-dark text-mistara-cream font-black shadow-[0_0_40px_rgba(166,124,82,0.45)] border-4 border-mistara-sand flex flex-col items-center justify-center cursor-pointer transition-transform transform active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed"
              title="فتح الكاميرا ومسح فاتورة أو مستند"
            >
              <span className="text-4xl leading-none mb-0.5" aria-hidden>
                📷
              </span>
              <span className="text-xs font-black tracking-tight text-mistara-cream">كاميرا</span>
            </button>
          )}
        </div>
      )}

      {showDocumentScanner && (
        <DocumentScannerModal
          onClose={() => setShowDocumentScanner(false)}
          onConfirm={handleDocumentCaptured}
        />
      )}

      {showOpenCvScanner && (
        <OpenCvDocumentScannerModal
          onClose={() => setShowOpenCvScanner(false)}
          onConfirm={handleDocumentCaptured}
        />
      )}

      {/* مودال إعدادات الخياط وملاحظات سحابية عامة */}
      {showTailorProfileModal && (
        <div className="fixed inset-0 glass-modal-backdrop flex items-center justify-center p-4 z-50">
          <div className="glass-panel border border-mistara-gold/35 rounded-3xl p-6 w-full max-w-sm sm:max-w-md space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b border-mistara-brown/15 pb-2">
              <h3 className="font-bold text-mistara-espresso text-base">الإعدادات الشخصية</h3>
              <button onClick={() => { setShowTailorProfileModal(false); setSettingsFeedback(null); }} className="text-mistara-gold text-lg">✕</button>
            </div>
            
            <form onSubmit={handleSaveTailorProfile} className="space-y-4">
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
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                      settingsFeedback.type === 'success'
                        ? 'bg-mistara-gold/15 ring-2 ring-mistara-gold/30'
                        : 'bg-red-800/10 ring-2 ring-red-800/25'
                    }`}
                  >
                    {settingsFeedback.type === 'success' ? (
                      <svg className="h-3.5 w-3.5 text-mistara-gold-dark" viewBox="0 0 24 24" fill="none" aria-hidden>
                        <path
                          d="M5 13l4 4L19 7"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    ) : (
                      <svg className="h-3.5 w-3.5 text-red-700" viewBox="0 0 24 24" fill="none" aria-hidden>
                        <path
                          d="M8 8l8 8M16 8l-8 8"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                        />
                      </svg>
                    )}
                  </span>
                  <p>{settingsFeedback.message}</p>
                </div>
              )}
              <div>
                <label className="block text-sm font-bold text-mistara-gold mb-1">اسم المحل</label>
                <input
                  type="text"
                  value={tailorShopName}
                  onChange={(e) => setTailorShopName(e.target.value)}
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
                    onChange={(e) => setTailorLocalPhone(e.target.value.replace(/\D/g, ''))}
                    placeholder="رقم الجوال"
                    className="flex-1 min-w-0 rounded-xl bg-mistara-cream border border-mistara-brown/15 p-3 text-base font-bold text-mistara-espresso font-mono tnum text-right"
                    dir="ltr"
                  />
                  <select
                    value={tailorCountryCode}
                    onChange={(e) => setTailorCountryCode(e.target.value)}
                    className="bg-mistara-cream border border-mistara-brown/15 text-sm text-mistara-warm rounded-xl p-3 font-mono tnum w-24 text-center"
                  >
                    {COUNTRY_CODES.map((c) => (
                      <option key={c.code} value={c.code}>+{c.code}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-mistara-gold mb-1">ملاحظات سحابية عامة</label>
                <textarea
                  value={cloudNotes}
                  onChange={(e) => setCloudNotes(e.target.value)}
                  placeholder="اكتب ملاحظات عامة تحفظ في حسابك..."
                  rows={3}
                  className="w-full rounded-xl bg-mistara-cream border border-mistara-brown/15 p-3 text-sm text-mistara-espresso focus:border-mistara-gold focus:outline-none resize-none"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => { setShowTailorProfileModal(false); setSettingsFeedback(null); }}
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
      )}

      {/* عارض الصور مكبراً (Lightbox) */}
      {activeImageIndex !== null && (
        <div className="fixed inset-0 glass-modal-backdrop z-50 flex flex-col items-center justify-center p-4">
          <div className="absolute top-4 right-4 z-10">
            <button 
              onClick={() => setActiveImageIndex(null)}
              className="w-11 h-11 rounded-full glass-panel border border-mistara-gold/30 text-mistara-gold font-bold flex items-center justify-center text-lg shadow-lg"
            >
              ✕
            </button>
          </div>

          <div className="w-full max-w-lg lg:max-w-2xl h-[70vh] sm:h-[80vh] glass-panel border border-mistara-gold/30 rounded-2xl overflow-hidden flex items-center justify-center p-2 shadow-2xl">
            <img 
              src={customerInvoices[activeImageIndex]?.image_url} 
              alt="Invoice Large" 
              className="w-full h-full object-contain"
            />
          </div>

          <div className="flex items-center gap-4 mt-4">
            <button
              disabled={activeImageIndex >= customerInvoices.length - 1}
              onClick={() => setActiveImageIndex(activeImageIndex + 1)}
              className="glass-panel disabled:opacity-30 border border-mistara-gold/30 text-mistara-gold text-sm px-4 py-2.5 rounded-xl font-bold"
            >
              السابق
            </button>
            <span className="text-sm text-mistara-gold font-bold font-mono tnum">
              {activeImageIndex + 1} / {customerInvoices.length}
            </span>
            <button
              disabled={activeImageIndex <= 0}
              onClick={() => setActiveImageIndex(activeImageIndex - 1)}
              className="glass-panel disabled:opacity-30 border border-mistara-gold/30 text-mistara-gold text-sm px-4 py-2.5 rounded-xl font-bold"
            >
              التالي
            </button>
          </div>

          {customerInvoices[activeImageIndex] && (
            <div className="flex items-center gap-2 mt-3 w-full max-w-lg lg:max-w-2xl px-2">
              <button
                type="button"
                disabled={exportingPdfId === customerInvoices[activeImageIndex].id}
                onClick={() =>
                  handleDownloadInvoicePdf(
                    customerInvoices[activeImageIndex],
                    customerInvoices.length - activeImageIndex
                  )
                }
                className="flex-1 bg-mistara-gold text-mistara-cream font-bold text-sm py-3 rounded-xl shadow-md disabled:opacity-50"
              >
                {exportingPdfId === customerInvoices[activeImageIndex].id
                  ? 'جارٍ التجهيز...'
                  : '📄 تنزيل PDF'}
              </button>
              <button
                type="button"
                disabled={exportingPdfId === customerInvoices[activeImageIndex].id}
                onClick={() =>
                  handlePrintInvoicePdf(
                    customerInvoices[activeImageIndex],
                    customerInvoices.length - activeImageIndex
                  )
                }
                className="flex-1 glass-panel text-mistara-warm border border-mistara-gold/30 text-sm py-3 rounded-xl font-bold disabled:opacity-50"
              >
                {exportingPdfId === customerInvoices[activeImageIndex].id
                  ? 'جارٍ التجهيز...'
                  : '🖨️ طباعة PDF'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}