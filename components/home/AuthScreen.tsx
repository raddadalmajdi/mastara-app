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

function authInputClass(hasError: boolean): string {
  const base = 'auth-field-input';
  if (hasError) {
    return `${base} border-red-500/50 focus:border-red-600 focus:ring-red-500/15`;
  }
  return base;
}

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
  const emailHasError = Boolean(emailDuplicateError) || displayFeedback?.type === 'error';
  const passwordHasError = displayFeedback?.type === 'error';

  return (
    <main
      className="auth-page relative flex min-h-[100dvh] flex-col justify-center overflow-hidden bg-mistara-sand text-mistara-espresso"
      dir="rtl"
    >
      <div
        className="pointer-events-none absolute -top-[20vh] left-1/2 h-[min(18rem,45vw)] w-[min(18rem,45vw)] -translate-x-1/2 rounded-full bg-primary/12 blur-[100px]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -bottom-[20vh] left-1/2 h-[min(18rem,45vw)] w-[min(18rem,45vw)] -translate-x-1/2 rounded-full bg-primary/8 blur-[100px]"
        aria-hidden
      />
      <div className="auth-shell-card glass-panel relative mx-auto w-full backdrop-blur-xl">
        <div className="space-y-[clamp(1rem,4vw,1.5rem)]">
          <AppBrand size="hero" subtitle={APP_TAGLINE} priority className="w-full" />
          {sessionCheckPending && (
            <p className="text-center text-[clamp(0.6875rem,3vw,0.8125rem)] text-mistara-brown/60 animate-pulse">
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
                className="relative z-10 space-y-[clamp(0.875rem,3.5vw,1.125rem)]"
              >
                <div>
                  <label htmlFor="auth-email" className="auth-field-label block">
                    البريد الإلكتروني
                  </label>
                  <input
                    id="auth-email"
                    type="email"
                    inputMode="email"
                    autoCapitalize="none"
                    autoCorrect="off"
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
                    className={authInputClass(emailHasError)}
                  />
                  {emailDuplicateError && (
                    <div
                      role="alert"
                      className="mt-2 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-[clamp(0.6875rem,3vw,0.8125rem)] font-bold leading-relaxed text-red-600"
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
                  <div className="grid grid-cols-2 gap-1 rounded-2xl border border-primary/10 bg-white/70 p-1">
                    <button
                      type="button"
                      onClick={() => {
                        setLoginMethod('password');
                        setAuthFeedback(null);
                      }}
                      className={`rounded-xl py-[clamp(0.625rem,2.5vw,0.75rem)] text-[clamp(0.6875rem,3vw,0.875rem)] font-bold transition-all touch-manipulation ${
                        loginMethod === 'password' ? 'auth-tab-active' : 'text-mistara-brown/60 hover:text-mistara-espresso'
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
                      className={`rounded-xl py-[clamp(0.625rem,2.5vw,0.75rem)] text-[clamp(0.6875rem,3vw,0.875rem)] font-bold transition-all touch-manipulation ${
                        loginMethod === 'otp' ? 'auth-tab-active' : 'text-mistara-brown/60 hover:text-mistara-espresso'
                      }`}
                    >
                      رمز مؤقت (OTP)
                    </button>
                  </div>
                )}

                {(isSignUp || loginMethod === 'password') && (
                  <div>
                    <label htmlFor="auth-password" className="auth-field-label block">
                      كلمة المرور
                    </label>
                    <input
                      id="auth-password"
                      type="password"
                      required={isSignUp || loginMethod === 'password'}
                      minLength={6}
                      autoComplete={isSignUp ? 'new-password' : 'current-password'}
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        if (authFeedback) setAuthFeedback(null);
                      }}
                      className={authInputClass(passwordHasError)}
                    />
                    {isSignUp && (
                      <p className="mt-1.5 text-[clamp(0.6875rem,3vw,0.8125rem)] text-mistara-brown/60">
                        6 أحرف على الأقل — يُفضّل أرقام ورموز.
                      </p>
                    )}
                  </div>
                )}

                {!isSignUp && loginMethod === 'otp' && (
                  <p className="rounded-xl border border-mistara-brown/15 bg-mistara-cream/50 p-2.5 text-[clamp(0.6875rem,3vw,0.8125rem)] leading-relaxed text-mistara-brown/80">
                    {`سنرسل رمز تحقق مكوّناً من ${OTP_LENGTH_AR} إلى بريدك لتسجيل الدخول دون كلمة مرور.`}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={authSubmitting || emailCheckPending || Boolean(emailDuplicateError)}
                  className="auth-primary-btn flex w-full items-center justify-center gap-2 rounded-2xl font-black transition-all active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none touch-manipulation"
                >
                  {authSubmitting && (
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground/25 border-t-primary-foreground" />
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
            <div className="space-y-2 border-t border-mistara-brown/15 pt-2 text-center">
              <button
                type="button"
                onClick={onEnterGuest}
                className="w-full rounded-xl border border-primary/15 bg-white/80 py-[clamp(0.75rem,3vw,0.875rem)] text-[clamp(0.8125rem,3.6vw,0.9375rem)] font-bold text-mistara-warm touch-manipulation hover:bg-white"
              >
                الدخول الفوري وتجربة النظام (بلا حساب)
              </button>

              {process.env.NODE_ENV === 'development' && (
                <div className="space-y-2 rounded-xl border border-primary-dark/35 bg-primary/5 p-3 text-right">
                  <p className="text-xs font-bold text-primary-dark">أدوات المطوّر (DEV فقط)</p>
                  <button
                    type="button"
                    disabled={devDeleteLoading}
                    onClick={onDevDelete}
                    className="w-full rounded-lg border border-primary/35 bg-primary/10 py-2 font-mono text-[10px] text-mistara-warm disabled:opacity-50"
                  >
                    {devDeleteLoading ? 'جاري الحذف عبر Admin API...' : 'حذف Auth: rraddad@hotmail.com'}
                  </button>
                  {devDeleteStatus && (
                    <p className="break-all font-mono text-[10px] leading-relaxed text-mistara-warm/80">
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
