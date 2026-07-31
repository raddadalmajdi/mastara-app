import Image from 'next/image';
import { APP_LOGO_PATH } from '@/lib/brand';

/** علامة مائية ضبابية ثابتة — تظهر خلف كل الشاشات دون تعطيل التفاعل. */
export function BrandWatermark() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-0 flex items-center justify-center overflow-hidden select-none"
    >
      <div className="relative h-[58vh] w-[58vh] min-h-[240px] min-w-[240px] max-h-[680px] max-w-[680px] sm:h-[64vh] sm:w-[64vh] md:h-[72vh] md:w-[72vh] opacity-[0.06] blur-[22px] sm:blur-[26px] md:blur-[30px]">
        <Image
          src={APP_LOGO_PATH}
          alt=""
          fill
          sizes="(max-width: 640px) 75vw, (max-width: 1024px) 65vw, 58vw"
          className="object-contain"
          draggable={false}
          priority={false}
        />
      </div>
    </div>
  );
}
