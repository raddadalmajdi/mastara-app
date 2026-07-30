'use client';

/** لوحة مسطرة 2030 — دخول (بريد/كلمة مرور/OTP)، إعدادات الخياط، ودفتر العملاء. */

import { useState, useEffect, useRef, useMemo } from 'react';
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
import {
  InvoiceSaveProgressRing,
  type InvoiceSaveUiPhase,
} from '@/components/invoices/InvoiceSaveProgressRing';
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
  saveLocalTailorProfile,
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
  const [customerNamePanelOpen, setCustomerNamePanelOpen] = useState(false);
  const [customerInvoices, setCustomerInvoices] = useState<any[]>([]);
  const customerLookupTimerRef = useRef<number | null>(null);
  const profileOnboardingShownRef = useRef(false);
  const [isSearchingInvoices, setIsSearchingInvoices] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadSavePhase, setUploadSavePhase] = useState<InvoiceSaveUiPhase>('idle');
  const [uploadSaveError, setUploadSaveError] = useState<string | null>(null);
  const [showDocumentScanner, setShowDocumentScanner] = useState(false);

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
    setCloudNotes('');
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
        if (data.cloud_notes) {
          setCloudNotes(data.cloud_notes);
        }
      } else {
        setIsTailorRegistered(false);
        setTailorShopName('');
      }
    } catch (fetchError) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('[tailor_profiles] fetch skipped or timed out', fetchError);
      }
      setIsTailorRegistered(false);
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
      });
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
            setCustomerNamePanelOpen(false);
          } else {
            setCustomerDisplayName('');
            setCustomerBookStatus('new');
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
    setCustomerNamePanelOpen(false);
    if (cleanVal.length < 3) {
      setCustomerDisplayName('');
      setCustomerBookStatus('idle');
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

  const handleAddCustomerNameClick = () => {
    setCustomerNamePanelOpen(true);
  };

  const handleOpenScannerForCustomer = () => {
    if (!customerLocalPhone.trim()) {
      return;
    }
    if (customerBookStatus === 'new' && !customerDisplayName.trim()) {
      setCustomerNamePanelOpen(true);
      return;
    }
    setShowDocumentScanner(true);
  };

  const handleCountryCodeChange = (newCode: string) => {
    setCustomerCountryCode(newCode);
    setCustomerNamePanelOpen(false);
    if (customerLocalPhone.length >= 3) {
      setCustomerBookStatus('searching');
    } else {
      setCustomerDisplayName('');
      setCustomerBookStatus('idle');
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
        const { imageUrl, pdfUrl } = await uploadScannedInvoiceFiles(supabase, user.id, {
          jpegBlob,
          pdfBlob,
        });

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
        className="relative min-h-screen bg-[#030712] flex flex-col justify-center px-5 sm:px-8 py-8 sm:py-12 overflow-hidden"
        style={{ backgroundColor: '#030712', color: '#f1f5f9' }}
        dir="rtl"
      >
        <div
          className="pointer-events-none absolute -top-32 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-cyan-500/20 blur-[100px]"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -bottom-32 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-emerald-500/10 blur-[100px]"
          aria-hidden
        />
        <div className="relative w-full max-w-sm sm:max-w-md mx-auto bg-slate-900/90 backdrop-blur-xl border border-white/10 rounded-[2rem] p-6 sm:p-8 shadow-[0_25px_70px_-15px_rgba(8,145,178,0.35)] space-y-6">
          <div className="text-center mb-1 space-y-2">
            <h1 className="text-4xl sm:text-5xl font-black bg-gradient-to-l from-cyan-300 via-cyan-400 to-teal-300 bg-clip-text text-transparent tracking-tight">
              مسطرة 2030
            </h1>
            <p className="text-sm sm:text-base text-slate-400">نظام إدارة فواتير الخياطة الذكي</p>
            {sessionCheckPending && (
              <p className="text-xs text-slate-500 mt-2 animate-pulse">جاري التحقق من جلسة الدخول...</p>
            )}
          </div>

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
                      ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-100'
                      : 'border-rose-500/40 bg-rose-500/10 text-rose-100'
                  }`}
                >
                  <span
                    className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                      authFeedback.type === 'success'
                        ? 'bg-emerald-500/20 ring-2 ring-emerald-500/40'
                        : 'bg-rose-500/20 ring-2 ring-rose-500/40'
                    }`}
                  >
                    {authFeedback.type === 'success' ? (
                      <svg className="h-4 w-4 text-emerald-300" viewBox="0 0 24 24" fill="none" aria-hidden>
                        <path
                          d="M5 13l4 4L19 7"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    ) : (
                      <svg className="h-4 w-4 text-rose-300" viewBox="0 0 24 24" fill="none" aria-hidden>
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
                  <label className="block text-sm font-bold text-cyan-400 mb-1.5">البريد الإلكتروني</label>
                  <input
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (authFeedback) setAuthFeedback(null);
                    }}
                    className={`w-full rounded-2xl bg-slate-950/70 border p-3.5 text-base text-white placeholder:text-slate-600 outline-none transition-all focus:ring-4 ${
                      authFeedback?.type === 'error'
                        ? 'border-rose-500/50 focus:border-rose-400 focus:ring-rose-500/10'
                        : 'border-slate-800 focus:border-cyan-500 focus:ring-cyan-500/10'
                    }`}
                  />
                </div>
                {!isSignUp && (
                  <div className="grid grid-cols-2 gap-1 p-1 rounded-2xl bg-slate-950/70 border border-slate-800">
                    <button
                      type="button"
                      onClick={() => {
                        setLoginMethod('password');
                        setAuthFeedback(null);
                      }}
                      className={`rounded-xl py-2.5 text-xs sm:text-sm font-bold transition-all ${
                        loginMethod === 'password'
                          ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20'
                          : 'text-slate-500 hover:text-slate-300'
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
                          ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20'
                          : 'text-slate-500 hover:text-slate-300'
                      }`}
                    >
                      رمز مؤقت (OTP)
                    </button>
                  </div>
                )}
                {(isSignUp || loginMethod === 'password') && (
                <div>
                  <label className="block text-sm font-bold text-cyan-400 mb-1.5">كلمة المرور</label>
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
                    className={`w-full rounded-2xl bg-slate-950/70 border p-3.5 text-base text-white placeholder:text-slate-600 outline-none transition-all focus:ring-4 ${
                      authFeedback?.type === 'error'
                        ? 'border-rose-500/50 focus:border-rose-400 focus:ring-rose-500/10'
                        : 'border-slate-800 focus:border-cyan-500 focus:ring-cyan-500/10'
                    }`}
                  />
                  {isSignUp && (
                    <p className="text-xs text-slate-500 mt-1.5">6 أحرف على الأقل — يُفضّل أرقام ورموز.</p>
                  )}
                </div>
                )}
                {!isSignUp && loginMethod === 'otp' && (
                  <p className="text-xs text-slate-400 leading-relaxed bg-slate-950/50 border border-slate-800 rounded-xl p-2.5">
                    سنرسل رمز تحقق مكوّناً من 6 أرقام إلى بريدك لتسجيل الدخول دون كلمة مرور.
                  </p>
                )}
                <button
                  type="submit"
                  disabled={authSubmitting}
                  className="w-full rounded-2xl bg-gradient-to-l from-cyan-400 to-cyan-500 py-3.5 text-slate-950 font-black text-base shadow-lg shadow-cyan-500/20 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none flex items-center justify-center gap-2 transition-all active:scale-[0.99]"
                >
                  {authSubmitting && (
                    <span className="h-4 w-4 rounded-full border-2 border-slate-950/30 border-t-slate-950 animate-spin" />
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
            <div className="text-center pt-2 border-t border-slate-800 space-y-2">
              <button
                onClick={() => setUser({ id: 'guest-local-user', email: 'guest@mistarh.local' })}
                className="w-full bg-slate-800 hover:bg-slate-700 text-cyan-300 text-sm py-3 rounded-xl border border-cyan-500/20 font-bold"
              >
                🚀 الدخول الفوري وتجربة النظام (بلا حساب)
              </button>

              {process.env.NODE_ENV === 'development' && (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-right space-y-2">
                  <p className="text-xs font-bold text-amber-300">أدوات المطوّر (DEV فقط)</p>
                  <button
                    type="button"
                    disabled={devDeleteLoading}
                    onClick={() => void handleDevDeleteAuthUser()}
                    className="w-full bg-amber-500/20 text-amber-200 text-[10px] py-2 rounded-lg border border-amber-500/40 font-mono disabled:opacity-50"
                  >
                    {devDeleteLoading
                      ? 'جاري الحذف عبر Admin API...'
                      : 'حذف Auth: rraddad@hotmail.com'}
                  </button>
                  {devDeleteStatus && (
                    <p className="text-[10px] text-amber-200/80 font-mono break-all leading-relaxed">
                      {devDeleteStatus}
                    </p>
                  )}
                  <p className="text-[9px] text-slate-600">
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
    <div className="min-h-screen bg-[#030712] text-slate-100 flex flex-col relative pb-36" dir="rtl">
      {showWelcomeSuccess && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/70 backdrop-blur-sm px-6">
          <div className="w-full max-w-xs rounded-3xl border border-emerald-500/30 bg-slate-900 p-6 text-center shadow-2xl space-y-3">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/15 ring-4 ring-emerald-500/30">
              <svg className="h-8 w-8 text-emerald-400" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path
                  d="M5 13l4 4L19 7"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <p className="text-base font-bold text-emerald-300">تم التحقق بنجاح</p>
            <p className="text-sm text-slate-400">مرحباً بك في لوحة مسطرة</p>
          </div>
        </div>
      )}
      {/* الهيدر العلوي */}
      <header className="sticky top-0 z-40 bg-[#030712]/90 backdrop-blur-md border-b border-cyan-500/20 px-4 sm:px-6 lg:px-8 py-3">
        <div className="max-w-lg sm:max-w-2xl lg:max-w-4xl w-full mx-auto flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h1 className="font-black text-cyan-400 text-xl">مسطرة 2030</h1>
          {!isSupabaseConfigured() && (
            <span className="text-xs bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-full font-mono">وضع التجربة (بلا حساب)</span>
          )}
        </div>

        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="w-11 h-11 rounded-xl bg-cyan-500 text-slate-950 font-black flex items-center justify-center text-xl shadow-md"
          >
            م
          </button>

          {showMenu && (
            <div className="absolute left-0 mt-2 w-72 sm:w-80 bg-slate-900 border border-cyan-500/30 rounded-2xl shadow-2xl p-4 z-50 space-y-3">
              <div className="border-b border-slate-800 pb-2">
                <span className="text-sm text-cyan-400">الحساب:</span>
                <p className="text-sm text-white truncate">{user?.email || 'ضيف'}</p>
                {tailorShopName.trim() ? (
                  <p className="text-xs text-slate-300 mt-1 truncate">{tailorShopName.trim()}</p>
                ) : null}
              </div>
              <div className="border-b border-slate-800 pb-2 flex justify-between items-center gap-2">
                <div className="min-w-0">
                  <span className="text-sm text-cyan-400">هاتف الخياط:</span>
                  <p className="text-sm text-white font-bold tnum truncate" dir="ltr">
                    {isTailorRegistered ? `+${tailorCountryCode}${tailorLocalPhone}` : 'غير مسجل'}
                  </p>
                </div>
                <button
                  onClick={() => { setShowMenu(false); setShowTailorProfileModal(true); }}
                  className="bg-cyan-500/10 text-cyan-400 text-sm px-3 py-2 rounded-lg border border-cyan-500/30"
                >
                  الإعدادات
                </button>
              </div>
              <button
                onClick={handleLogout}
                className="w-full bg-rose-500/10 text-rose-400 text-sm py-3 rounded-xl border border-rose-500/30 font-bold"
              >
                خروج / تسجيل الدخول بحساب آخر
              </button>
            </div>
          )}
        </div>
        </div>
      </header>

      {/* المحتوى الرئيسي */}
      <main className="flex-1 max-w-lg sm:max-w-2xl lg:max-w-4xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-4 sm:space-y-6">

        {/* معلومات الخياط ورقم العميل: عمود واحد على الجوال، عمودان جنباً إلى جنب على الشاشات الأوسع */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-stretch">
        {/* معلومات الخياط المبسطة */}
        <div className="bg-slate-900 border border-cyan-500/20 p-4 rounded-2xl flex items-center justify-between gap-3">
          <div className="min-w-0">
            <span className="text-sm text-cyan-400 font-bold">لوحة الخياط</span>
            {tailorShopName.trim() ? (
              <p className="text-sm text-white font-bold truncate">{tailorShopName.trim()}</p>
            ) : null}
            <p className="text-sm text-white font-bold tnum truncate" dir="ltr">
              {isTailorRegistered ? `+${tailorCountryCode}${tailorLocalPhone}` : '⚠️ أضف رقم هاتفك'}
            </p>
          </div>
          <button
            onClick={() => setShowTailorProfileModal(true)}
            className="shrink-0 bg-cyan-500 text-slate-950 text-sm font-bold px-3.5 py-2.5 rounded-xl shadow"
          >
            {isTailorRegistered ? 'الإعدادات' : 'إضافة الرقم'}
          </button>
        </div>

        {/* خانة رقم العميل (الرقم يمين ومفتاح الدولة يساراً) */}
        <section className="bg-slate-900 border border-cyan-500/40 p-4 rounded-3xl space-y-3 shadow-xl">
          <div className="space-y-1.5">
            <label className="text-sm text-cyan-400 font-bold block">رقم هاتف العميل</label>
            <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
              <div className="flex gap-2 items-center flex-1 min-w-0">
                <input
                  type="tel"
                  value={customerLocalPhone}
                  onChange={(e) => handleCustomerPhoneInput(e.target.value)}
                  placeholder="أدخل رقم الجوال..."
                  className="flex-1 min-w-0 rounded-xl bg-slate-950 border border-slate-800 p-3.5 text-lg font-bold text-white font-mono tnum text-right"
                  dir="ltr"
                />
                <select
                  value={customerCountryCode}
                  onChange={(e) => handleCountryCodeChange(e.target.value)}
                  className="bg-slate-950 border border-slate-800 text-sm text-cyan-300 rounded-xl p-3.5 font-mono tnum w-28 text-center shrink-0"
                >
                  {COUNTRY_CODES.map((c) => (
                    <option key={c.code} value={c.code}>+{c.code}</option>
                  ))}
                </select>
              </div>
              {customerBookStatus === 'searching' && customerLocalPhone.length >= 1 ? (
                <span className="text-xs text-slate-500 font-bold shrink-0">جاري البحث...</span>
              ) : customerBookStatus === 'known' && customerDisplayName ? (
                <p className="text-base font-bold text-white truncate sm:max-w-[40%] sm:text-right">
                  👤 {customerDisplayName}
                </p>
              ) : customerBookStatus === 'new' && customerLocalPhone.length >= 3 ? (
                <button
                  type="button"
                  onClick={handleAddCustomerNameClick}
                  className="shrink-0 flex items-center gap-1.5 bg-cyan-500/15 border border-cyan-500/40 text-cyan-300 text-xs sm:text-sm font-bold px-3 py-2 rounded-xl"
                >
                  <span className="text-base leading-none">+</span>
                  <span>إضافة اسم شخص</span>
                </button>
              ) : null}
            </div>
          </div>
          {customerNamePanelOpen && (
            <div className="space-y-1.5">
              <label className="text-sm text-cyan-400 font-bold block">اسم العميل</label>
              <input
                type="text"
                value={customerDisplayName}
                onChange={(e) => setCustomerDisplayName(e.target.value)}
                placeholder="اكتب اسم العميل..."
                autoFocus={customerNamePanelOpen}
                className="w-full rounded-xl bg-slate-950 border border-slate-800 p-3.5 text-base font-bold text-white"
              />
              {customerDisplayName.trim() && (
                <button
                  type="button"
                  onClick={handleOpenScannerForCustomer}
                  className="w-full bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-sm font-bold py-2.5 rounded-xl"
                >
                  📷 فتح الكاميرا وحفظ مستند لهذا العميل
                </button>
              )}
            </div>
          )}
          {customerLocalPhone.length >= 1 && (
            <p className="text-[11px] text-slate-500 font-bold">
              {isSearchingInvoices || customerBookStatus === 'searching'
                ? 'جاري البحث في سجل العملاء والفواتير...'
                : customerInvoices.length > 0
                  ? `تم العثور على ${customerInvoices.length} مستند/فاتورة سابقة${customerDisplayName ? ` لـ ${customerDisplayName}` : ''}.`
                  : customerLocalPhone.length >= 3 && customerBookStatus === 'new'
                    ? 'لا يوجد سجلات لهذا الرقم — أضف اسم العميل ثم افتح الكاميرا.'
                    : 'لا توجد فواتير سابقة مسجّلة لهذا الرقم بعد.'}
            </p>
          )}
        </section>
        </div>

        {/* عرض الفواتير: الفاتورة الحديثة (الأحدث) ضخمة في المقدمة يعقبها الأرشيف */}
        {customerLocalPhone.length >= 1 && customerInvoices.length > 0 && (
          <section className="space-y-4">
            <h2 className="text-base sm:text-lg text-cyan-400 font-bold">
              أرشيف فواتير العميل (<span className="tnum">{customerInvoices.length}</span>)
            </h2>

            {/* الفاتورة الأحدث */}
            {(() => {
              const latestInvoice = customerInvoices[0];
              const latestIndex = 0;
              const latestInvoiceNumber = customerInvoices.length;

              return (
                <div className="bg-slate-900 border-2 border-cyan-400/60 rounded-3xl p-4 shadow-2xl space-y-3">
                  <div className="flex items-center justify-between bg-slate-950 px-4 py-2.5 rounded-2xl border border-cyan-500/30">
                    <div>
                      <span className="text-sm sm:text-base font-black text-cyan-300">
                        ⭐ الفاتورة الأحدث (فاتورة #<span className="tnum">{latestInvoiceNumber}</span>)
                      </span>
                      <span className="text-xs text-slate-400 font-bold font-mono tnum block" dir="ltr">{formatDate(latestInvoice.created_at)}</span>
                    </div>
                  </div>

                  {/* معاينة الفاتورة الكبيرة */}
                  <div className="w-full bg-slate-950 rounded-2xl border border-slate-800 p-2 flex flex-col items-center space-y-3">
                    <div 
                      onClick={() => setActiveImageIndex(latestIndex)}
                      className="w-full h-96 sm:h-[28rem] lg:h-[32rem] rounded-xl overflow-hidden border border-cyan-500/30 bg-slate-900 cursor-pointer relative shadow-inner flex items-center justify-center"
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
                        className="flex-1 bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 text-sm py-3 rounded-xl font-bold"
                      >
                        تكبير المعاينة
                      </button>
                      <button
                        type="button"
                        disabled={exportingPdfId === latestInvoice.id}
                        onClick={() => handleDownloadInvoicePdf(latestInvoice, latestInvoiceNumber)}
                        className="flex-1 bg-cyan-500 text-slate-950 font-bold text-sm py-3 rounded-xl text-center shadow-md flex items-center justify-center gap-1 disabled:opacity-50"
                      >
                        <span>{exportingPdfId === latestInvoice.id ? 'جارٍ التجهيز...' : '📄 تنزيل PDF'}</span>
                      </button>
                    </div>
                    <button
                      type="button"
                      disabled={exportingPdfId === latestInvoice.id}
                      onClick={() => handlePrintInvoicePdf(latestInvoice, latestInvoiceNumber)}
                      className="w-full bg-slate-900 text-cyan-300 border border-cyan-500/30 text-sm py-3 rounded-xl font-bold flex items-center justify-center gap-1 disabled:opacity-50"
                    >
                      <span>{exportingPdfId === latestInvoice.id ? 'جارٍ التجهيز...' : '🖨️ معاينة وطباعة PDF'}</span>
                    </button>
                  </div>

                  {/* خانة رسالة الواتساب المخصصة تحت الفاتورة الأحدث */}
                  <div className="bg-slate-950 border border-slate-800 rounded-2xl p-3 space-y-2">
                    <label className="text-sm text-cyan-400 font-bold block">رسالة الواتساب المخصصة لهذه الفاتورة:</label>
                    <textarea
                      value={whatsappMessages[latestInvoice.id] || ''}
                      onChange={(e) => setWhatsappMessages({ ...whatsappMessages, [latestInvoice.id]: e.target.value })}
                      rows={3}
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl p-3 text-sm text-white focus:border-cyan-500 focus:outline-none resize-y"
                      placeholder="اكتب رسالة الواتساب..."
                    />
                    <button
                      onClick={() => sendViaWhatsApp(latestInvoice.customer_phone, latestInvoice.id)}
                      className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-base py-3.5 rounded-xl flex items-center justify-center gap-2 shadow-lg transition-all"
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
                <h3 className="text-sm text-slate-400 font-bold">الفواتير السابقة (الأرشيف)</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                  {customerInvoices.slice(1).map((inv, subIndex) => {
                    const actualIndex = subIndex + 1;
                    const invoiceNumber = customerInvoices.length - actualIndex;

                    return (
                      <div key={inv.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-cyan-400 font-bold">
                            فاتورة #<span className="tnum">{invoiceNumber}</span>
                          </span>
                          <span className="text-xs text-slate-500 font-bold font-mono tnum" dir="ltr">{formatDate(inv.created_at)}</span>
                        </div>
                        
                        <div className="flex gap-3">
                          <div 
                            onClick={() => setActiveImageIndex(actualIndex)}
                            className="w-24 h-32 shrink-0 rounded-xl overflow-hidden bg-slate-950 border border-slate-800 cursor-pointer relative flex items-center justify-center"
                          >
                            <img src={inv.image_url} alt="Old Invoice" className="w-full h-full object-contain" />
                          </div>

                          <div className="flex-1 min-w-0 space-y-2">
                            <textarea
                              value={whatsappMessages[inv.id] || ''}
                              onChange={(e) => setWhatsappMessages({ ...whatsappMessages, [inv.id]: e.target.value })}
                              rows={2}
                              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2 text-sm text-white focus:border-cyan-500 focus:outline-none resize-y"
                            />
                            <div className="flex gap-1.5">
                              <button
                                onClick={() => sendViaWhatsApp(inv.customer_phone, inv.id)}
                                className="flex-1 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs sm:text-sm font-bold py-2.5 rounded-xl flex items-center justify-center gap-1.5"
                              >
                                <span>💬 واتساب</span>
                              </button>
                              <button
                                type="button"
                                disabled={exportingPdfId === inv.id}
                                onClick={() => handleDownloadInvoicePdf(inv, invoiceNumber)}
                                className="flex-1 bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-xs sm:text-sm font-bold py-2.5 rounded-xl flex items-center justify-center gap-1.5 disabled:opacity-50"
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
              className="pointer-events-auto w-24 h-24 rounded-full bg-gradient-to-tr from-emerald-500 via-teal-400 to-cyan-400 text-slate-950 font-black shadow-[0_0_40px_rgba(16,185,129,0.8)] border-4 border-slate-950 flex flex-col items-center justify-center cursor-pointer transition-transform transform active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed"
              title="فتح الكاميرا ومسح فاتورة أو مستند"
            >
              <span className="text-4xl leading-none mb-0.5" aria-hidden>
                📷
              </span>
              <span className="text-xs font-black tracking-tight text-slate-950">كاميرا</span>
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

      {/* مودال إعدادات الخياط وملاحظات سحابية عامة */}
      {showTailorProfileModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-cyan-500/40 rounded-3xl p-6 w-full max-w-sm sm:max-w-md space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b border-slate-800 pb-2">
              <h3 className="font-bold text-white text-base">الإعدادات الشخصية</h3>
              <button onClick={() => { setShowTailorProfileModal(false); setSettingsFeedback(null); }} className="text-cyan-400 text-lg">✕</button>
            </div>
            
            <form onSubmit={handleSaveTailorProfile} className="space-y-4">
              {settingsFeedback && (
                <div
                  role="alert"
                  className={`flex items-start gap-2 rounded-xl border px-3 py-2.5 text-sm leading-relaxed ${
                    settingsFeedback.type === 'success'
                      ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-100'
                      : 'border-rose-500/40 bg-rose-500/10 text-rose-100'
                  }`}
                >
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                      settingsFeedback.type === 'success'
                        ? 'bg-emerald-500/20 ring-2 ring-emerald-500/30'
                        : 'bg-rose-500/20 ring-2 ring-rose-500/30'
                    }`}
                  >
                    {settingsFeedback.type === 'success' ? (
                      <svg className="h-3.5 w-3.5 text-emerald-300" viewBox="0 0 24 24" fill="none" aria-hidden>
                        <path
                          d="M5 13l4 4L19 7"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    ) : (
                      <svg className="h-3.5 w-3.5 text-rose-300" viewBox="0 0 24 24" fill="none" aria-hidden>
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
                <label className="block text-sm font-bold text-cyan-400 mb-1">اسم المحل</label>
                <input
                  type="text"
                  value={tailorShopName}
                  onChange={(e) => setTailorShopName(e.target.value)}
                  placeholder="اسم محل الخياطة (اختياري)"
                  className="w-full rounded-xl bg-slate-950 border border-slate-800 p-3 text-base font-bold text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-cyan-400 mb-1">رقم هاتف الخياط</label>
                <div className="flex gap-2 items-center">
                  <input
                    type="tel"
                    required
                    value={tailorLocalPhone}
                    onChange={(e) => setTailorLocalPhone(e.target.value.replace(/\D/g, ''))}
                    placeholder="رقم الجوال"
                    className="flex-1 min-w-0 rounded-xl bg-slate-950 border border-slate-800 p-3 text-base font-bold text-white font-mono tnum text-right"
                    dir="ltr"
                  />
                  <select
                    value={tailorCountryCode}
                    onChange={(e) => setTailorCountryCode(e.target.value)}
                    className="bg-slate-950 border border-slate-800 text-sm text-cyan-300 rounded-xl p-3 font-mono tnum w-24 text-center"
                  >
                    {COUNTRY_CODES.map((c) => (
                      <option key={c.code} value={c.code}>+{c.code}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-cyan-400 mb-1">ملاحظات سحابية عامة</label>
                <textarea
                  value={cloudNotes}
                  onChange={(e) => setCloudNotes(e.target.value)}
                  placeholder="اكتب ملاحظات عامة تحفظ في حسابك..."
                  rows={3}
                  className="w-full rounded-xl bg-slate-950 border border-slate-800 p-3 text-sm text-white focus:border-cyan-500 focus:outline-none resize-none"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => { setShowTailorProfileModal(false); setSettingsFeedback(null); }}
                  className="flex-1 bg-slate-800 text-white text-sm py-3 rounded-xl font-bold"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={savingSettings}
                  className="flex-1 bg-cyan-500 text-slate-950 font-bold text-sm py-3 rounded-xl shadow"
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
        <div className="fixed inset-0 bg-slate-950/95 backdrop-blur-md z-50 flex flex-col items-center justify-center p-4">
          <div className="absolute top-4 right-4 z-10">
            <button 
              onClick={() => setActiveImageIndex(null)}
              className="w-11 h-11 rounded-full bg-slate-900 border border-cyan-500/30 text-cyan-400 font-bold flex items-center justify-center text-lg shadow-lg"
            >
              ✕
            </button>
          </div>

          <div className="w-full max-w-lg lg:max-w-2xl h-[70vh] sm:h-[80vh] bg-slate-900 border border-cyan-500/30 rounded-2xl overflow-hidden flex items-center justify-center p-2 shadow-2xl">
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
              className="bg-slate-900 disabled:opacity-30 border border-cyan-500/30 text-cyan-400 text-sm px-4 py-2.5 rounded-xl font-bold"
            >
              السابق
            </button>
            <span className="text-sm text-cyan-400 font-bold font-mono tnum">
              {activeImageIndex + 1} / {customerInvoices.length}
            </span>
            <button
              disabled={activeImageIndex <= 0}
              onClick={() => setActiveImageIndex(activeImageIndex - 1)}
              className="bg-slate-900 disabled:opacity-30 border border-cyan-500/30 text-cyan-400 text-sm px-4 py-2.5 rounded-xl font-bold"
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
                className="flex-1 bg-cyan-500 text-slate-950 font-bold text-sm py-3 rounded-xl shadow-md disabled:opacity-50"
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
                className="flex-1 bg-slate-900 text-cyan-300 border border-cyan-500/30 text-sm py-3 rounded-xl font-bold disabled:opacity-50"
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