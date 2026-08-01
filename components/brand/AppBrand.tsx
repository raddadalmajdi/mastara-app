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

  if (size === 'hero' && !isRow) {
    return (
      <header className={`mx-auto flex w-full flex-col items-center text-center ${className}`}>
        <div className="flex flex-col items-center">
          <AppLogo size="hero" priority={priority} />
          {showTitle && (
            <h1 className="-mt-1 font-black text-[1.85rem] leading-none tracking-tight text-primary-dark sm:text-[2rem]">
              {APP_NAME}
            </h1>
          )}
        </div>
        {showTitle && tagline && (
          <p className="mt-2 max-w-[18rem] text-[13px] leading-[1.45] text-mistara-brown/75 sm:text-sm sm:leading-snug">
            {tagline}
          </p>
        )}
      </header>
    );
  }

  const gapClass = size === 'hero' ? 'gap-2' : 'gap-2.5';

  return (
    <div
      className={`flex ${isRow ? 'flex-row items-center' : 'flex-col items-center'} ${gapClass} ${className}`}
    >
      <AppLogo size={size} priority={priority} />
      {showTitle && (
        <div className={isRow ? 'min-w-0 text-right' : 'space-y-1 text-center'}>
          <h1
            className={`font-black bg-gradient-to-l from-primary-light via-primary to-primary-dark bg-clip-text text-transparent tracking-tight leading-none ${
              isRow ? 'text-xl sm:text-2xl' : 'text-3xl sm:text-[2.35rem]'
            }`}
          >
            {APP_NAME}
          </h1>
          {tagline && (
            <p
              className={`text-mistara-brown/80 leading-snug ${
                isRow ? 'max-w-[9rem] text-[11px] sm:max-w-none sm:text-xs' : 'mx-auto max-w-xs text-sm sm:text-base'
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
