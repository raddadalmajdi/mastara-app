import Image from 'next/image';

const SIZES = {
  xs: 28,
  sm: 36,
  md: 48,
  lg: 64,
  xl: 80,
} as const;

type AppLogoProps = {
  size?: keyof typeof SIZES;
  className?: string;
  priority?: boolean;
};

export function AppLogo({ size = 'md', className = '', priority = false }: AppLogoProps) {
  const px = SIZES[size];

  return (
    <Image
      src="/logo.png"
      alt="مسطرة"
      width={px}
      height={px}
      priority={priority}
      className={`object-contain drop-shadow-sm ${className}`}
    />
  );
}
