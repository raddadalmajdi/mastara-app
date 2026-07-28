export function AuthBootScreen({ message = 'جاري التحميل...' }: { message?: string }) {
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center bg-[#030712] px-5"
      style={{ backgroundColor: '#030712', color: '#f1f5f9', minHeight: '100vh' }}
      dir="rtl"
    >
      <div
        className="fixed top-0 left-0 right-0 h-1 bg-emerald-500/20 overflow-hidden"
        aria-hidden
      >
        <div className="h-full w-1/3 bg-emerald-500 animate-[auth-boot-slide_1.2s_ease-in-out_infinite]" />
      </div>
      <div className="h-12 w-12 rounded-full border-2 border-cyan-500/30 border-t-cyan-400 animate-spin mb-4" />
      <p className="text-base text-cyan-400 font-mono text-center">{message}</p>
      <p className="text-xs text-slate-500 mt-2 text-center max-w-xs">
        إن استغرق الأمر أكثر من 10 ثوانٍ، حدّث الصفحة أو تحقق من الاتصال.
      </p>
    </div>
  );
}
