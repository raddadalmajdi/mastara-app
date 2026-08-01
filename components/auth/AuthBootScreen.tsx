import { AppLogo } from '@/components/brand/AppLogo';

export function AuthBootScreen({ message = 'جاري التحميل...' }: { message?: string }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-mistara-sand px-5" dir="rtl">
      <div
        className="fixed top-0 left-0 right-0 h-1 bg-primary/15 overflow-hidden"
        aria-hidden
      >
        <div className="h-full w-1/3 bg-primary animate-[auth-boot-slide_1.2s_ease-in-out_infinite]" />
      </div>
      <AppLogo size="hero" priority className="mb-5" />
      <div className="h-10 w-10 rounded-full border-2 border-primary/30 border-t-primary animate-spin mb-4" />
      <p className="text-base text-primary font-mono text-center">{message}</p>
      <p className="text-xs text-mistara-brown/60 mt-2 text-center max-w-xs">
        إن استغرق الأمر أكثر من 10 ثوانٍ، حدّث الصفحة أو تحقق من الاتصال.
      </p>
    </div>
  );
}
