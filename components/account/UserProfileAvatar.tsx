'use client';

type UserProfileAvatarProps = {
  src?: string | null;
  alt?: string;
  size?: 'sm' | 'md';
  className?: string;
};

const SIZE_CLASS = {
  sm: 'h-11 w-11',
  md: 'h-14 w-14',
} as const;

const ICON_CLASS = {
  sm: 'h-5 w-5',
  md: 'h-6 w-6',
} as const;

function UserProfileIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="8.5" r="3.75" stroke="currentColor" strokeWidth="1.75" />
      <path
        d="M5.5 19.25c.85-3.1 3.35-5 6.5-5s5.65 1.9 6.5 5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
      <circle cx="12" cy="12" r="10.25" stroke="currentColor" strokeWidth="1.5" opacity="0.35" />
    </svg>
  );
}

/** صورة حساب دائرية — صورة المستخدم أو أيقونة ملف شخصي افتراضية بأسلوب إيصالك الأزرق. */
export function UserProfileAvatar({
  src,
  alt = '',
  size = 'sm',
  className = '',
}: UserProfileAvatarProps) {
  const trimmed = src?.trim();

  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-primary/25 bg-primary/8 shadow-md ring-2 ring-primary/15 ${SIZE_CLASS[size]} ${className}`}
    >
      {trimmed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={trimmed} alt={alt} className="h-full w-full object-cover" />
      ) : (
        <UserProfileIcon className={`${ICON_CLASS[size]} text-primary`} />
      )}
    </span>
  );
}
