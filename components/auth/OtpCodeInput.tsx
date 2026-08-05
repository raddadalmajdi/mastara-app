'use client';

import { useCallback, useEffect, useRef } from 'react';
import { OTP_CODE_LENGTH, OTP_LENGTH_AR } from '@/lib/otp-config';

type OtpCodeInputProps = {
  value: string;
  onChange: (value: string) => void;
  onComplete?: (value: string) => void;
  disabled?: boolean;
  hasError?: boolean;
};

export function OtpCodeInput({ value, onChange, onComplete, disabled, hasError }: OtpCodeInputProps) {
  const inputsRef = useRef<Array<HTMLInputElement | null>>([]);
  const digits = value.padEnd(OTP_CODE_LENGTH, ' ').slice(0, OTP_CODE_LENGTH).split('');

  const commitDigits = useCallback(
    (next: string[]) => {
      const joined = next.join('').replace(/\s/g, '').slice(0, OTP_CODE_LENGTH);
      onChange(joined);
      if (joined.length === OTP_CODE_LENGTH) {
        onComplete?.(joined);
      }
    },
    [onChange, onComplete]
  );

  useEffect(() => {
    if (value.length === 0) {
      inputsRef.current[0]?.focus();
    }
  }, [value]);

  const handlePaste = (raw: string) => {
    const clean = raw.replace(/\D/g, '').slice(0, OTP_CODE_LENGTH);
    if (!clean) return;
    onChange(clean);
    if (clean.length === OTP_CODE_LENGTH) {
      onComplete?.(clean);
    }
    const focusIndex = Math.min(clean.length, OTP_CODE_LENGTH - 1);
    inputsRef.current[focusIndex]?.focus();
  };

  return (
    <div className="space-y-3" dir="ltr">
      <div
        className="mx-auto grid w-full max-w-[min(100%,20.5rem)] grid-cols-8 gap-1 px-0.5 sm:max-w-[22rem] sm:gap-1.5"
        role="group"
        aria-label={`رمز التحقق المكوّن من ${OTP_LENGTH_AR}`}
      >
        {digits.map((digit, index) => {
          const filled = Boolean(digit.trim());
          return (
            <input
              key={index}
              ref={(el) => {
                inputsRef.current[index] = el;
              }}
              type="text"
              inputMode="none"
              autoComplete={index === 0 ? 'one-time-code' : 'off'}
              maxLength={1}
              disabled={disabled}
              value={digit.trim()}
              aria-label={`الرقم ${index + 1} من ${OTP_CODE_LENGTH}`}
              onPaste={(e) => {
                e.preventDefault();
                handlePaste(e.clipboardData.getData('text'));
              }}
              onFocus={(e) => e.currentTarget.select()}
              onChange={(e) => {
                const char = e.target.value.replace(/\D/g, '').slice(-1);
                const next = [...digits.map((d) => d.trim())];
                next[index] = char;
                commitDigits(next);
                if (char && index < OTP_CODE_LENGTH - 1) {
                  inputsRef.current[index + 1]?.focus();
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Backspace') {
                  if (digits[index]?.trim()) {
                    const next = [...digits.map((d) => d.trim())];
                    next[index] = '';
                    commitDigits(next);
                    return;
                  }
                  if (index > 0) {
                    inputsRef.current[index - 1]?.focus();
                  }
                } else if (e.key === 'ArrowLeft' && index > 0) {
                  inputsRef.current[index - 1]?.focus();
                } else if (e.key === 'ArrowRight' && index < OTP_CODE_LENGTH - 1) {
                  inputsRef.current[index + 1]?.focus();
                }
              }}
              className={`aspect-square h-12 w-full min-w-0 rounded-xl border-2 bg-mistara-cream text-center text-lg font-black font-mono tnum text-mistara-espresso shadow-inner outline-none transition-all duration-150 sm:h-14 sm:rounded-2xl sm:text-xl ${
                hasError
                  ? 'border-red-800/70 shadow-[0_0_0_3px_rgba(244,63,94,0.15)]'
                  : filled
                    ? 'border-primary shadow-[0_0_0_3px_rgba(0,115,207,0.22)]'
                    : 'border-mistara-brown/15 focus:border-primary focus:shadow-[0_0_0_3px_rgba(0,115,207,0.18)]'
              }`}
            />
          );
        })}
      </div>
      <p className="text-xs sm:text-sm text-mistara-brown/60 text-center" dir="rtl">
        أدخل الرمز المكوّن من {OTP_LENGTH_AR} المرسل إلى بريدك — يمكنك أيضاً لصقه دفعة واحدة.
      </p>
    </div>
  );
}

export { OTP_CODE_LENGTH } from '@/lib/otp-config';
