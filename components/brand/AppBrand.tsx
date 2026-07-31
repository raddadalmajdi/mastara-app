import { AppLogo } from './AppLogo';

type AppBrandProps = {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showTitle?: boolean;
  subtitle?: string;
  layout?: 'row' | 'column';
  priority?: boolean;
  className?: string;
};

export function AppBrand({
  size = 'lg',
  showTitle = true,
  subtitle,
  layout = 'column',
  priority = false,
  className = '',
}: AppBrandProps) {
  const isRow = layout === 'row';

  return (
    <div
      className={`flex ${isRow ? 'flex-row items-center gap-2.5' : 'flex-col items-center gap-2'} ${className}`}
    >
      <AppLogo size={size} priority={priority} />
      {showTitle && (
        <div className={isRow ? 'text-right' : 'text-center space-y-1'}>
          <h1
            className={`font-black bg-gradient-to-l from-mistara-gold-light via-mistara-gold to-mistara-gold-dark bg-clip-text text-transparent tracking-tight ${
              isRow ? 'text-xl' : 'text-3xl sm:text-4xl'
            }`}
          >
            مسطرة 2030
          </h1>
          {subtitle && (
            <p className={`text-mistara-brown/80 ${isRow ? 'text-xs' : 'text-sm sm:text-base'}`}>{subtitle}</p>
          )}
        </div>
      )}
    </div>
  );
}
