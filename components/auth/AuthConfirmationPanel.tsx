'use client';

import { useRef } from 'react';
import { AUTH_CONFIRMATION_LINK_HINT } from '@/lib/auth-confirmation-copy';
import { AuthAlert } from '@/components/auth/AuthAlert';
import { OtpCodeInput, OTP_CODE_LENGTH } from '@/components/auth/OtpCodeInput';
import { OtpKeypad } from '@/components/auth/OtpKeypad';

type AuthFeedback = { type: 'success' | 'error'; message: string } | null;

type AuthConfirmationPanelProps = {
  email: string;
  otpCode: string;
  onOtpCodeChange: (value: string) => void;
  authFeedback: AuthFeedback;
  onClearError: () => void;
  authSubmitting: boolean;
  otpResendCooldown: number;
  onVerifyOtp: (e: React.FormEvent) => void;
  onResend: () => void;
  onBack: () => void;
};

function formatCooldown(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safe / 60)
    .toString()
    .padStart(2, '0');
  const seconds = (safe % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
}

export function AuthConfirmationPanel({
  email,
  otpCode,
  onOtpCodeChange,
  authFeedback,
  onClearError,
  authSubmitting,
  otpResendCooldown,
  onVerifyOtp,
  onResend,
  onBack,
}: AuthConfirmationPanelProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const tokenLength = otpCode.replace(/\D/g, '').length;
  const canSubmitOtp = tokenLength === OTP_CODE_LENGTH;

  const handleChange = (nextValue: string) => {
    onOtpCodeChange(nextValue);
    if (authFeedback?.type === 'error') onClearError();
  };

  const handleComplete = () => {
    window.setTimeout(() => {
      if (!authSubmitting) formRef.current?.requestSubmit();
    }, 150);
  };

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2.5">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 ring-1 ring-primary/25 shadow-[0_0_25px_-5px_rgba(0,115,207,0.35)]">
          <svg className="h-7 w-7 text-primary" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M3.5 8.5 12 14l8.5-5.5M4.5 6.5h15A1.5 1.5 0 0 1 21 8v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17V8a1.5 1.5 0 0 1 1.5-1.5Z"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <h2 className="text-xl sm:text-2xl font-black text-mistara-espresso">تحقق من بريدك الإلكتروني</h2>
        <p className="text-sm text-mistara-brown/80 leading-relaxed">
          أرسلنا رمز تحقق مكوّناً من 6 أرقام إلى
          <br />
          <span className="font-mono text-primary-dark font-bold" dir="ltr">
            {email}
          </span>
        </p>
      </div>

      {authFeedback && <AuthAlert type={authFeedback.type} message={authFeedback.message} />}

      <form ref={formRef} onSubmit={onVerifyOtp} className="space-y-6">
        <OtpCodeInput
          value={otpCode}
          onChange={handleChange}
          onComplete={handleComplete}
          disabled={authSubmitting}
          hasError={authFeedback?.type === 'error'}
        />

        <OtpKeypad value={otpCode} onChange={handleChange} onComplete={handleComplete} disabled={authSubmitting} />

        <button
          type="submit"
          disabled={authSubmitting || !canSubmitOtp}
          className="auth-primary-btn w-full rounded-2xl py-3.5 font-black text-base disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none flex items-center justify-center gap-2 transition-all active:scale-[0.99]"
        >
          {authSubmitting && (
            <span className="h-4 w-4 rounded-full border-2 border-primary-foreground/25 border-t-primary-foreground animate-spin" />
          )}
          {authSubmitting ? 'جاري التحقق...' : 'تأكيد الرمز والدخول'}
        </button>
      </form>

      <div className="flex items-center justify-center">
        {otpResendCooldown > 0 ? (
          <p className="text-sm text-mistara-brown/60" dir="ltr">
            <span dir="rtl">إعادة الإرسال خلال</span>{' '}
            <span className="font-mono font-bold text-primary text-base tnum">
              {formatCooldown(otpResendCooldown)}
            </span>
          </p>
        ) : (
          <button
            type="button"
            disabled={authSubmitting}
            onClick={onResend}
            className="text-sm font-bold text-primary disabled:text-mistara-brown/50 py-1 underline-offset-4 hover:underline"
          >
            لم يصلك الرمز؟ إعادة الإرسال
          </button>
        )}
      </div>

      <p className="text-xs text-mistara-brown/60 text-center leading-relaxed">{AUTH_CONFIRMATION_LINK_HINT}</p>

      <button
        type="button"
        onClick={onBack}
        className="w-full rounded-2xl bg-mistara-beige/80 hover:bg-mistara-beige py-3 text-sm text-mistara-espresso font-bold transition-colors border border-primary/10"
      >
        تعديل البريد أو العودة
      </button>
    </div>
  );
}
