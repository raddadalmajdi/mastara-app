import Image from 'next/image';
import { APP_LOGO_PATH, APP_NAME } from '@/lib/brand';

const SIZES = {
  xs: 28,
  sm: 40,
  md: 52,
  lg: 88,
  xl: 120,
  hero: 140,
} as const;

type AppLogoProps = {
  size?: keyof typeof SIZES;
  className?: string;
  priority?: boolean;
};

/** شعار إيصالك — خلفية شفافة مع ظل خفيف للعمق البصري. */
export function AppLogo({ size = 'md', className = '', priority = false }: AppLogoProps) {
  const px = SIZES[size];

  return (
    <div
      className={`inline-flex shrink-0 items-center justify-center bg-transparent p-0 leading-none ${className}`}
      style={{ width: px, height: px }}
    >
      <Image
        src={APP_LOGO_PATH}
        alt={APP_NAME}
        width={px}
        height={px}
        priority={priority}
        className="h-full w-full object-contain bg-transparent [filter:drop-shadow(0_8px_20px_rgba(0,59,115,0.22))]"
        style={{ background: 'transparent' }}
      />
    </div>
  );
}
