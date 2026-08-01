'use client';

export type AuthMode = 'signin' | 'signup';

type AuthModeTabsProps = {
  mode: AuthMode;
  onModeChange: (mode: AuthMode) => void;
  disabled?: boolean;
};

export function AuthModeTabs({ mode, onModeChange, disabled = false }: AuthModeTabsProps) {
  const baseTabClass =
    'relative z-10 w-full rounded-xl py-3 text-sm font-bold transition-all duration-150 ' +
    'touch-manipulation select-none disabled:opacity-50 disabled:cursor-not-allowed';

  const activeClass = 'auth-tab-active';
  const inactiveClass = 'text-mistara-brown/80 hover:text-mistara-espresso hover:bg-white/60';

  return (
    <div
      role="tablist"
      aria-label="وضع المصادقة: تسجيل الدخول أو إنشاء حساب"
      className="grid grid-cols-2 gap-1 p-1 rounded-2xl bg-white/70 border border-primary/10"
    >
      <button
        type="button"
        role="tab"
        id="auth-tab-signin"
        aria-selected={mode === 'signin'}
        aria-controls="auth-panel-form"
        tabIndex={0}
        disabled={disabled}
        onClick={() => onModeChange('signin')}
        className={`${baseTabClass} ${mode === 'signin' ? activeClass : inactiveClass}`}
      >
        تسجيل الدخول
      </button>

      <button
        type="button"
        role="tab"
        id="auth-tab-signup"
        aria-selected={mode === 'signup'}
        aria-controls="auth-panel-form"
        tabIndex={0}
        disabled={disabled}
        onClick={() => onModeChange('signup')}
        className={`${baseTabClass} ${mode === 'signup' ? activeClass : inactiveClass}`}
      >
        إنشاء حساب
      </button>
    </div>
  );
}
