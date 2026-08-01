'use client';

type OtpKeypadProps = {
  value: string;
  onChange: (value: string) => void;
  onComplete?: (value: string) => void;
  disabled?: boolean;
  maxLength?: number;
};

const DIGIT_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

const keyClass =
  'h-14 sm:h-16 rounded-2xl glass-panel border border-mistara-brown/15 text-mistara-espresso text-xl font-black tnum ' +
  'transition-all duration-100 active:scale-95 active:bg-mistara-beige active:border-primary/40 ' +
  'disabled:opacity-30 disabled:active:scale-100 select-none touch-manipulation';

/** لوحة مفاتيح رقمية أنيقة على الشاشة لإدخال رمز التحقق (OTP) بسهولة على الجوال. */
export function OtpKeypad({ value, onChange, onComplete, disabled, maxLength = 6 }: OtpKeypadProps) {
  const appendDigit = (digit: string) => {
    if (disabled || value.length >= maxLength) return;
    const next = (value + digit).slice(0, maxLength);
    onChange(next);
    if (next.length === maxLength) {
      onComplete?.(next);
    }
  };

  const backspace = () => {
    if (disabled || value.length === 0) return;
    onChange(value.slice(0, -1));
  };

  const clearAll = () => {
    if (disabled || value.length === 0) return;
    onChange('');
  };

  return (
    <div className="grid grid-cols-3 gap-2 sm:gap-2.5 max-w-[280px] mx-auto" dir="ltr" role="group" aria-label="لوحة مفاتيح رقمية">
      {DIGIT_KEYS.map((digit) => (
        <button
          key={digit}
          type="button"
          disabled={disabled}
          onClick={() => appendDigit(digit)}
          className={keyClass}
        >
          {digit}
        </button>
      ))}

      <button
        type="button"
        disabled={disabled || value.length === 0}
        onClick={clearAll}
        className={`${keyClass} text-xs font-bold text-mistara-brown/80`}
      >
        مسح الكل
      </button>

      <button type="button" disabled={disabled} onClick={() => appendDigit('0')} className={keyClass}>
        0
      </button>

      <button
        type="button"
        disabled={disabled || value.length === 0}
        onClick={backspace}
        aria-label="حذف آخر رقم"
        className={`${keyClass} text-mistara-warm flex items-center justify-center`}
      >
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M12 9.75 14.25 12m0 0 2.25 2.25M14.25 12l2.25-2.25M14.25 12 12 14.25m-2.58 4.92-6.374-6.375a1.125 1.125 0 0 1 0-1.59L9.42 4.83c.21-.21.497-.33.795-.33H19.5a2.25 2.25 0 0 1 2.25 2.25v10.5a2.25 2.25 0 0 1-2.25 2.25h-9.284c-.298 0-.585-.119-.795-.33Z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </div>
  );
}
