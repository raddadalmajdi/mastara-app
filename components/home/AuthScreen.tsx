'use client';

import { AuthConfirmationPanel } from '@/components/auth/AuthConfirmationPanel';
import { AuthAlert } from '@/components/auth/AuthAlert';
import { AuthModeTabs } from '@/components/auth/AuthModeTabs';
import { AppBrand } from '@/components/brand/AppBrand';
import { checkEmailRegistered } from '@/lib/check-email-api';
import { DUPLICATE_EMAIL_MESSAGE } from '@/lib/check-email-registered';
import { APP_TAGLINE } from '@/lib/brand';
import { OTP_LENGTH_AR } from '@/lib/otp-config';
import type { AuthFeedback } from '@/lib/home/types';

type AuthScreenProps = {
  sessionCheckPending: boolean;
  sessionFeedback: AuthFeedback;
  authPhase: 'form' | 'confirm';
  email: string;
  setEmail: (value: string) => void;
  password: string;
  setPassword: (value: string) => void;
  isSignUp: boolean;
  loginMethod: 'password' | 'otp';
  setLoginMethod: (method: 'password' | 'otp') => void;
  otpCode: string;
  setOtpCode: (value: string) => void;
  authFeedback: AuthFeedback;
  setAuthFeedback: (feedback: AuthFeedback) => void;
  emailDuplicateError: string | null;
  setEmailDuplicateError: (value: string | null) => void;
  emailCheckPending: boolean;
  authSubmitting: boolean;
  otpResendCooldown: number;
  devDeleteStatus: string | null;
  devDeleteLoading: boolean;
  switchAuthMode: (signUp: boolean) => void;
  onSubmitAuth: (e: React.FormEvent) => void;
  onVerifyOtp: (e: React.FormEvent) => void;
  onResendOtp: () => void;
  onBackFromConfirm: () => void;
  onEnterGuest: () => void;
  onDevDelete: () => void;
};

export function AuthScreen({
  sessionCheckPending,
  sessionFeedback,
  authPhase,
  email,
  setEmail,
  password,
  setPassword,
  isSignUp,
  loginMethod,
  setLoginMethod,
  otpCode,
  setOtpCode,
  authFeedback,
  setAuthFeedback,
  emailDuplicateError,
  setEmailDuplicateError,
  emailCheckPending,
  authSubmitting,
  otpResendCooldown,
  devDeleteStatus,
  devDeleteLoading,
  switchAuthMode,
  onSubmitAuth,
  onVerifyOtp,
  onResendOtp,
  onBackFromConfirm,
  onEnterGuest,
  onDevDelete,
}: AuthScreenProps) {
  const displayFeedback = sessionFeedback ?? authFeedback;

  return (
    <main
      className="relative min-h-screen bg-mistara-sand flex flex-col justify-center px-5 sm:px-8 py-8 sm:py-12 overflow-hidden"
      dir="rtl"
    >
      <div
        className="pointer-events-none absolute -top-32 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-primary/12 blur-[100px]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -bottom-32 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-primary/8 blur-[100px]"
        aria-hidden
      />
      <div className="auth-shell-card relative mx-auto w-full max-w-sm sm:max-w-md glass-panel rounded-[2rem] p-6 backdrop-blur-xl sm:p-8">
        <div className="space-y-5">
          <AppBrand size="hero" subtitle={APP_TAGLINE} priority className="w-full" />
          {sessionCheckPending && (
            <p className="text-xs text-mistara-brown/60 text-center animate-pulse">
              جاري التحقق من جلسة الدخول...
            </p>
          )}

          {authPhase === 'confirm' ? (
            <AuthConfirmationPanel
              email={email}
              otpCode={otpCode}
              onOtpCodeChange={setOtpCode}
              authFeedback={displayFeedback}
              onClearError={() => setAuthFeedback(null)}
              authSubmitting={authSubmitting}
              otpResendCooldown={otpResendCooldown}
              onVerifyOtp={onVerifyOtp}
              onResend={onResendOtp}
              onBack={onBackFromConfirm}
            />
          ) : (
            <>
              <AuthModeTabs
                mode={isSignUp ? 'signup' : 'signin'}
                onModeChange={(mode) => switchAuthMode(mode === 'signup')}
              />

              {displayFeedback && <AuthAlert type={displayFeedback.type} message={displayFeedback.message} />}

              <form
                id="auth-panel-form"
                role="tabpanel"
                aria-labelledby={isSignUp ? 'auth-tab-signup' : 'auth-tab-signin'}
                onSubmit={onSubmitAuth}
                className="space-y-4 relative z-10"
              >
                <div>
                  <label className="block text-sm font-bold text-primary mb-1.5">البريد الإلكتروني</label>
                  <input
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (authFeedback) setAuthFeedback(null);
                      if (emailDuplicateError) setEmailDuplicateError(null);
                    }}
        onBlur={() => {
                      if (!isSignUp) return;
                      const trimmed = email.trim().toLowerCase();
                      if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return;
                      void (async () => {
                        const check = await checkEmailRegistered(trimmed);
                        if (check.ok && check.exists) {
                          setEmailDuplicateError(DUPLICATE_EMAIL_MESSAGE);
                        }
                      })();
                    }}
                    aria-invalid={Boolean(emailDuplicateError)}
                    className={`w-full rounded-2xl bg-mistara-cream/70 border p-3.5 text-base text-mistara-espresso placeholder:text-mistara-brown/50 outline-none transition-all focus:ring-4 ${
                      emailDuplicateError
                        ? 'border-red-500/50 focus:border-red-600 focus:ring-red-500/15'
                        : displayFeedback?.type === 'error'
                          ? 'border-red-800/50 focus:border-rose-400 focus:ring-rose-500/10'
                          : 'border-mistara-brown/15 focus:border-primary focus:ring-primary/15'
                    }`}
                  />
                  {emailDuplicateError && (
                    <div
                      role="alert"
                      className="mt-2 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs font-bold leading-relaxed text-red-600"
                    >
                      <p>
                        <span>هذا البريد الإلكتروني مسجل مسبقاً</span>
                        ، يرجى استخدام بريد آخر أو{' '}
                        <button
                          type="button"
                          onClick={() => switchAuthMode(false)}
                          className="underline underline-offset-2 decoration-red-400 hover:text-red-700"
                        >
                          تسجيل الدخول
                        </button>
                      </p>
                    </div>
                  )}
                </div>

                {!isSignUp && (
                  <div className="grid grid-cols-2 gap-1 p-1 rounded-2xl bg-white/70 border border-primary/10">
                    <button
                      type="button"
                      onClick={() => {
                        setLoginMethod('password');
                        setAuthFeedback(null);
                      }}
                      className={`rounded-xl py-2.5 text-xs sm:text-sm font-bold transition-all ${
                        loginMethod === 'password' ? 'auth-tab-active' : 'text-mistara-brown/60 hover:text-mistara-brown'
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
                        loginMethod === 'otp' ? 'auth-tab-active' : 'text-mistara-brown/60 hover:text-mistara-brown'
                      }`}
                    >
                      رمز مؤقت (OTP)
                    </button>
                  </div>
                )}

                {(isSignUp || loginMethod === 'password') && (
                  <div>
                    <label className="block text-sm font-bold text-primary mb-1.5">كلمة المرور</label>
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
                        displayFeedback?.type === 'error'
                          ? 'border-red-800/50 focus:border-rose-400 focus:ring-rose-500/10'
                          : 'border-mistara-brown/15 focus:border-primary focus:ring-primary/15'
                      }`}
                    />
                    {isSignUp && (
                      <p className="text-xs text-mistara-brown/60 mt-1.5">6 أحرف على الأقل — يُفضّل أرقام ورموز.</p>
                    )}
                  </div>
                )}

                {!isSignUp && loginMethod === 'otp' && (
                  <p className="text-xs text-mistara-brown/80 leading-relaxed bg-mistara-cream/50 border border-mistara-brown/15 rounded-xl p-2.5">
                    {`سنرسل رمز تحقق مكوّناً من ${OTP_LENGTH_AR} إلى بريدك لتسجيل الدخول دون كلمة مرور.`}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={authSubmitting || emailCheckPending || Boolean(emailDuplicateError)}
                  className="auth-primary-btn w-full rounded-2xl py-3.5 font-black text-base disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none flex items-center justify-center gap-2 transition-all active:scale-[0.99]"
                >
                  {authSubmitting && (
                    <span className="h-4 w-4 rounded-full border-2 border-primary-foreground/25 border-t-primary-foreground animate-spin" />
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
                type="button"
                onClick={onEnterGuest}
                className="w-full bg-white/80 hover:bg-white text-mistara-warm text-sm py-3 rounded-xl border border-primary/15 font-bold"
              >
                الدخول الفوري وتجربة النظام (بلا حساب)
              </button>

              {process.env.NODE_ENV === 'development' && (
                <div className="rounded-xl border border-primary-dark/35 bg-primary/5 p-3 text-right space-y-2">
                  <p className="text-xs font-bold text-primary-dark">أدوات المطوّر (DEV فقط)</p>
                  <button
                    type="button"
                    disabled={devDeleteLoading}
                    onClick={onDevDelete}
                    className="w-full bg-primary/10 text-mistara-warm text-[10px] py-2 rounded-lg border border-primary/35 font-mono disabled:opacity-50"
                  >
                    {devDeleteLoading ? 'جاري الحذف عبر Admin API...' : 'حذف Auth: rraddad@hotmail.com'}
                  </button>
                  {devDeleteStatus && (
                    <p className="text-[10px] text-mistara-warm/80 font-mono break-all leading-relaxed">
                      {devDeleteStatus}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
