'use client';

import { useCallback, useEffect, useRef } from 'react';

type OtpCodeInputProps = {
  value: string;
  onChange: (value: string) => void;
  onComplete?: (value: string) => void;
  disabled?: boolean;
  hasError?: boolean;
};

const OTP_LENGTH = 6;

export function OtpCodeInput({ value, onChange, onComplete, disabled, hasError }: OtpCodeInputProps) {
  const inputsRef = useRef<Array<HTMLInputElement | null>>([]);
  const digits = value.padEnd(OTP_LENGTH, ' ').slice(0, OTP_LENGTH).split('');

  const commitDigits = useCallback(
    (next: string[]) => {
      const joined = next.join('').replace(/\s/g, '').slice(0, OTP_LENGTH);
      onChange(joined);
      if (joined.length === OTP_LENGTH) {
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
    const clean = raw.replace(/\D/g, '').slice(0, OTP_LENGTH);
    if (!clean) return;
    onChange(clean);
    if (clean.length === OTP_LENGTH) {
      onComplete?.(clean);
    }
    const focusIndex = Math.min(clean.length, OTP_LENGTH - 1);
    inputsRef.current[focusIndex]?.focus();
  };

  return (
    <div className="space-y-3" dir="ltr">
      <div className="flex justify-center gap-2 sm:gap-2.5" role="group" aria-label="رمز التحقق المكوّن من 6 أرقام">
        {digits.map((digit, index) => {
          const filled = Boolean(digit.trim());
          return (
            <input
              key={index}
              ref={(el) => {
                inputsRef.current[index] = el;
              }}
              type="text"
              // نمنع لوحة المفاتيح الافتراضية للجوال عمداً (inputMode="none") لتشجيع
              // استخدام لوحة الأرقام المخصّصة (OtpKeypad) أسفل الحقول؛ لا يمنع هذا
              // الكتابة عبر لوحة مفاتيح فعلية على أجهزة الحاسوب.
              inputMode="none"
              autoComplete={index === 0 ? 'one-time-code' : 'off'}
              maxLength={1}
              disabled={disabled}
              value={digit.trim()}
              aria-label={`الرقم ${index + 1} من 6`}
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
                if (char && index < OTP_LENGTH - 1) {
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
                } else if (e.key === 'ArrowRight' && index < OTP_LENGTH - 1) {
                  inputsRef.current[index + 1]?.focus();
                }
              }}
              className={`h-14 w-11 sm:h-16 sm:w-12 rounded-2xl border-2 bg-slate-950 text-center text-2xl sm:text-3xl font-black font-mono tnum text-white shadow-inner outline-none transition-all duration-150 ${
                hasError
                  ? 'border-rose-500/70 shadow-[0_0_0_3px_rgba(244,63,94,0.15)]'
                  : filled
                    ? 'border-cyan-400 shadow-[0_0_0_3px_rgba(34,211,238,0.18)]'
                    : 'border-slate-800 focus:border-cyan-500 focus:shadow-[0_0_0_3px_rgba(34,211,238,0.15)]'
              }`}
            />
          );
        })}
      </div>
      <p className="text-xs sm:text-sm text-slate-500 text-center" dir="rtl">
        أدخل الرمز المكوّن من 6 أرقام المرسل إلى بريدك — يمكنك أيضاً لصقه دفعة واحدة.
      </p>
    </div>
  );
}

export const OTP_CODE_LENGTH = OTP_LENGTH;
