type IconProps = {
  className?: string;
  'aria-hidden'?: boolean;
};

export function ReceiptIcon({ className = 'h-5 w-5', ...props }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" {...props}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M8 3h8a2 2 0 012 2v16l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5-2 1.5V5a2 2 0 012-2z"
      />
      <path strokeLinecap="round" d="M9 8h6M9 11h6M9 14h4" />
      <path strokeLinecap="round" strokeWidth="1.5" d="M9 17h6" />
    </svg>
  );
}

export function CameraScanIcon({ className = 'h-5 w-5', ...props }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" {...props}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4 8h3l1.5-2h7L17 8h3a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2v-8a2 2 0 012-2z"
      />
      <circle cx="12" cy="13" r="3.25" />
      <path strokeLinecap="round" d="M8 5.5h8" />
    </svg>
  );
}

export function DocumentStackIcon({ className = 'h-5 w-5', ...props }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 4h8l2 3v13H6V4h2z" />
      <path strokeLinecap="round" d="M8 9h8M8 12h8M8 15h5" />
    </svg>
  );
}

export function LockReceiptIcon({ className = 'h-5 w-5', ...props }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" {...props}>
      <rect x="5" y="10" width="14" height="10" rx="2" strokeLinecap="round" />
      <path strokeLinecap="round" d="M8 10V8a4 4 0 118 0v2" />
      <path strokeLinecap="round" d="M9 14h6M9 16.5h4" />
    </svg>
  );
}
