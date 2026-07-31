import Image from 'next/image';
import { APP_LOGO_PATH, APP_NAME } from '@/lib/brand';

const SIZES = {
  xs: 28,
  sm: 40,
  md: 52,
  lg: 72,
  xl: 88,
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
      src={APP_LOGO_PATH}
      alt={APP_NAME}
      width={px}
      height={px}
      priority={priority}
      className={`object-contain bg-transparent ${className}`}
      style={{ background: 'transparent' }}
    />
  );
}
