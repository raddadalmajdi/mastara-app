'use client';

type AuthAlertProps = {
  type: 'success' | 'error';
  message: string;
};

export function AuthAlert({ type, message }: AuthAlertProps) {
  const isSuccess = type === 'success';

  return (
    <div
      role="alert"
      className={`flex items-start gap-2 rounded-xl border px-3 py-2.5 text-xs font-bold leading-relaxed sm:gap-3 sm:rounded-2xl sm:px-3 sm:py-3 sm:text-sm ${
        isSuccess
          ? 'border-primary-dark/35 bg-primary/8 text-mistara-brown'
          : 'border-red-200 bg-red-50 text-red-600'
      }`}
    >
      <span
        className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full sm:h-7 sm:w-7 ${
          isSuccess ? 'bg-primary/12 ring-2 ring-primary/30' : 'bg-red-100 ring-2 ring-red-200/80'
        }`}
      >
        {isSuccess ? (
          <svg className="h-3.5 w-3.5 text-primary-dark sm:h-4 sm:w-4" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M5 13l4 4L19 7"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : (
          <svg className="h-3.5 w-3.5 text-red-600 sm:h-4 sm:w-4" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M8 8l8 8M16 8l-8 8"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
          </svg>
        )}
      </span>
      <p className="flex-1">{message}</p>
    </div>
  );
}
