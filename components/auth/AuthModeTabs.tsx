'use client';

export type AuthMode = 'signin' | 'signup';

type AuthModeTabsProps = {
  mode: AuthMode;
  onModeChange: (mode: AuthMode) => void;
  disabled?: boolean;
};

/**
 * تبويبات "تسجيل الدخول" / "إنشاء حساب".
 *
 * ترتيب ثابت ومقصود (لا يتغير مع اتجاه الصفحة):
 *   - "تسجيل الدخول" أولاً (يمين الشاشة في RTL) — الوضع الافتراضي عند فتح التطبيق.
 *   - "إنشاء حساب" ثانياً (يسار الشاشة في RTL).
 *
 * كل زر مستقل بالكامل: onClick يستدعي onModeChange مباشرة بقيمة صريحة
 * ('signin' | 'signup') — لا يوجد اعتماد على toggle أو state ضمني هنا،
 * لذا لا يمكن أن "يعلق" على وضع واحد.
 */
export function AuthModeTabs({ mode, onModeChange, disabled = false }: AuthModeTabsProps) {
  const baseTabClass =
    'relative z-10 w-full rounded-xl py-2.5 text-xs font-bold transition-all duration-150 ' +
    'touch-manipulation select-none disabled:opacity-50 disabled:cursor-not-allowed';

  const activeClass = 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20';
  const inactiveClass = 'text-slate-400 hover:text-white hover:bg-slate-900/80';

  return (
    <div
      role="tablist"
      aria-label="وضع المصادقة: تسجيل الدخول أو إنشاء حساب"
      className="grid grid-cols-2 gap-1 p-1 rounded-2xl bg-slate-950/70 border border-slate-800"
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
