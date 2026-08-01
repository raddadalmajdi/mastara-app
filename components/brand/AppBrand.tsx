import { AppLogo } from './AppLogo';
import { APP_NAME, APP_TAGLINE } from '@/lib/brand';

type AppBrandProps = {
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'hero';
  showTitle?: boolean;
  /** اتركه `null` لإخفاء الوصف الفرعي (مثل الهيدر). */
  subtitle?: string | null;
  layout?: 'row' | 'column';
  priority?: boolean;
  className?: string;
};

export function AppBrand({
  size = 'lg',
  showTitle = true,
  subtitle = APP_TAGLINE,
  layout = 'column',
  priority = false,
  className = '',
}: AppBrandProps) {
  const isRow = layout === 'row';
  const tagline = subtitle === null ? null : (subtitle ?? APP_TAGLINE);
  const gapClass = size === 'hero' ? 'gap-3' : 'gap-2.5';

  return (
    <div
      className={`flex ${isRow ? 'flex-row items-center' : 'flex-col items-center'} ${gapClass} ${className}`}
    >
      <AppLogo size={size} priority={priority} />
      {showTitle && (
        <div className={isRow ? 'text-right min-w-0' : 'text-center space-y-1.5'}>
          <h1
            className={`font-black bg-gradient-to-l from-primary-light via-primary to-primary-dark bg-clip-text text-transparent tracking-tight leading-none ${
              isRow ? 'text-xl sm:text-2xl' : size === 'hero' ? 'text-3xl sm:text-4xl' : 'text-3xl sm:text-[2.35rem]'
            }`}
          >
            {APP_NAME}
          </h1>
          {tagline && (
            <p
              className={`text-mistara-brown/80 leading-snug ${
                isRow ? 'text-[11px] sm:text-xs max-w-[9rem] sm:max-w-none' : 'text-sm sm:text-base max-w-xs mx-auto'
              }`}
            >
              {tagline}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
