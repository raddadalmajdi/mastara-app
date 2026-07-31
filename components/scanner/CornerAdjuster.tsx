'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Quad } from '@/lib/document-scanner/geometry';
import { detectDocumentQuad } from '@/lib/document-scanner/detect-document';
import { CAPTURE_DETECTION_SAMPLE_WIDTH } from '@/lib/document-scanner/constants';

export type AutoDetectResult = { quad: Quad; coverage: number } | null;

/**
 * خوارزمية الاكتشاف التلقائي (Auto-Detect) لحواف المستند — نقطة الدخول
 * الموحَّدة التي يستدعيها زر «Auto» (سواء عند الالتقاط الأولي أو عند إعادة
 * الضغط عليه صراحةً في شاشة كشف الحواف). تحلّل الصورة الخام الملتقطة كاملة
 * الدقة (كانفاس أو عنصر صورة/فيديو) بحثاً عن أكبر شبه منحرف رباعي محتمل أن
 * يمثّل ورقة/مستنداً: تدرّج رمادي، تحسين تباين محلي، عتبة Otsu تكيّفية،
 * تنظيف مورفولوجي (Close→Open)، ثم اختيار أفضل كتلة متصلة وفق حجمها ونسبة
 * امتلائها ونسيجها الداخلي (`lib/document-scanner/detect-document.ts`) —
 * خوارزمية Canvas 2D خفيفة بلا أي مكتبة رؤية حاسوبية خارجية، مُعايَرة خصيصاً
 * لأداء دقيق على خلفيات متباينة (إضاءة/ألوان مختلفة) مثل Auto في HP Smart.
 *
 * تُعيد `null` صراحةً عند تعذّر العثور على حواف واثقة (بدل تخمين خاطئ) كي
 * يتمكّن المستدعي من إشعار المستخدم والإبقاء على الوضع الحالي دون تغيير.
 */
export function detectDocumentEdgesAuto(
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  workCanvas: HTMLCanvasElement
): AutoDetectResult {
  if (!sourceWidth || !sourceHeight) return null;
  const detected = detectDocumentQuad(source, sourceWidth, sourceHeight, workCanvas, {
    sampleWidth: CAPTURE_DETECTION_SAMPLE_WIDTH,
    denoise: true,
  });
  return detected ? { quad: detected.points, coverage: detected.coverage } : null;
}

type ContainRect = { renderW: number; renderH: number; offsetX: number; offsetY: number };

/**
 * يحسب مستطيل عرض الصورة الفعلي داخل حاوية بنمط `object-contain` (بلا قصّ،
 * قد تظهر أشرطة فارغة أفقياً/رأسياً حسب نسبة الأبعاد) — ضروري لترجمة دقيقة
 * بين إحداثيات الشاشة (نقرة/سحب) وبكسلات الصورة الأصلية عالية الدقة.
 */
function computeContainRect(containerW: number, containerH: number, imgW: number, imgH: number): ContainRect {
  if (!containerW || !containerH || !imgW || !imgH) {
    return { renderW: 0, renderH: 0, offsetX: 0, offsetY: 0 };
  }
  const containerRatio = containerW / containerH;
  const imgRatio = imgW / imgH;
  let renderW: number;
  let renderH: number;
  if (imgRatio > containerRatio) {
    renderW = containerW;
    renderH = containerW / imgRatio;
  } else {
    renderH = containerH;
    renderW = containerH * imgRatio;
  }
  return { renderW, renderH, offsetX: (containerW - renderW) / 2, offsetY: (containerH - renderH) / 2 };
}

export type CornerAdjusterProps = {
  /** رابط بيانات (Data URL) للصورة الخام الملتقطة بدقتها الكاملة، بلا أي قصّ أو معالجة بعد. */
  imageSrc: string;
  naturalWidth: number;
  naturalHeight: number;
  /** شبه المنحرف الحالي (بإحداثيات بكسلات الصورة الأصلية) — عنصر متحكَّم به بالكامل من الأب. */
  quad: Quad;
  onQuadChange: (quad: Quad) => void;
  /** يزداد عند تطبيق اكتشاف تلقائي لتحريك المقابض بانتقال بصري نحو الزوايا المكتشفة. */
  quadRevision?: number;
};

/** ترتيب شبه المنحرف ثابت دائماً: [أعلى-يسار، أعلى-يمين، أسفل-يمين، أسفل-يسار] — راجع `lib/document-scanner/geometry.ts`. */
const HANDLE_LABELS = ['الزاوية العلوية اليسرى', 'الزاوية العلوية اليمنى', 'الزاوية السفلية اليمنى', 'الزاوية السفلية اليسرى'];

/**
 * شاشة "كشف الحواف" التفاعلية (أسلوب HP Smart): صورة ثابتة مُلتقطة بدقتها
 * الكاملة، فوقها شبه منحرف أزرق متصل الأضلاع بأربع مقابض مربعة قابلة للسحب
 * بحرية (لمس أو ماوس عبر Pointer Events موحَّدة) لضبط حواف المستند بدقة قبل
 * القصّ وتصحيح المنظور النهائي.
 */
export function CornerAdjuster({
  imageSrc,
  naturalWidth,
  naturalHeight,
  quad,
  onQuadChange,
  quadRevision = 0,
}: CornerAdjusterProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containRect, setContainRect] = useState<ContainRect>({ renderW: 0, renderH: 0, offsetX: 0, offsetY: 0 });
  const draggingIndexRef = useRef<number | null>(null);
  const [animateQuad, setAnimateQuad] = useState(false);
  const prevQuadRevisionRef = useRef(quadRevision);

  useEffect(() => {
    if (quadRevision === prevQuadRevisionRef.current) return;
    prevQuadRevisionRef.current = quadRevision;
    setAnimateQuad(true);
    const timer = window.setTimeout(() => setAnimateQuad(false), 320);
    return () => window.clearTimeout(timer);
  }, [quadRevision]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const rect = el.getBoundingClientRect();
      setContainRect(computeContainRect(rect.width, rect.height, naturalWidth, naturalHeight));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [naturalWidth, naturalHeight]);

  const screenToImage = useCallback(
    (localX: number, localY: number) => {
      if (!containRect.renderW || !containRect.renderH) return { x: 0, y: 0 };
      const rawX = ((localX - containRect.offsetX) / containRect.renderW) * naturalWidth;
      const rawY = ((localY - containRect.offsetY) / containRect.renderH) * naturalHeight;
      return {
        x: Math.min(naturalWidth, Math.max(0, rawX)),
        y: Math.min(naturalHeight, Math.max(0, rawY)),
      };
    },
    [containRect, naturalWidth, naturalHeight]
  );

  const imageToScreen = useCallback(
    (p: { x: number; y: number }) => ({
      x: containRect.offsetX + (p.x / naturalWidth) * containRect.renderW,
      y: containRect.offsetY + (p.y / naturalHeight) * containRect.renderH,
    }),
    [containRect, naturalWidth, naturalHeight]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      const idx = draggingIndexRef.current;
      if (idx === null) return;
      const containerEl = containerRef.current;
      if (!containerEl) return;
      const rect = containerEl.getBoundingClientRect();
      const point = screenToImage(e.clientX - rect.left, e.clientY - rect.top);
      const next = quad.map((p, i) => (i === idx ? point : p)) as Quad;
      onQuadChange(next);
    },
    [screenToImage, onQuadChange, quad]
  );

  const endDrag = useCallback((e: React.PointerEvent) => {
    if (draggingIndexRef.current === null) return;
    draggingIndexRef.current = null;
    try {
      (e.target as Element).releasePointerCapture(e.pointerId);
    } catch {
      // تجاهل: قد يكون الالتقاط قد أُلغي بالفعل.
    }
  }, []);

  const startDrag = (index: number) => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    draggingIndexRef.current = index;
    try {
      (e.target as Element).setPointerCapture(e.pointerId);
    } catch {
      // تجاهل: بعض المتصفحات القديمة لا تدعم Pointer Capture — السحب يستمر عبر مستمعي الحاوية على أي حال.
    }
  };

  const screenPoints = quad.map(imageToScreen);
  const ready = containRect.renderW > 0;

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 touch-none select-none pt-1"
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={imageSrc}
        alt="حدّد حواف المستند"
        className="absolute inset-0 w-full h-full object-contain pointer-events-none select-none"
        draggable={false}
      />

      {ready && (
        <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ overflow: 'visible' }}>
          <polygon
            points={screenPoints.map((p) => `${p.x},${p.y}`).join(' ')}
            fill="rgba(166,124,82,0.18)"
            stroke="#D4AF37"
            strokeWidth={3}
            strokeLinejoin="round"
            style={animateQuad ? { transition: 'all 0.28s ease-out' } : undefined}
          />
          {screenPoints.map((p, i) => {
            const next = screenPoints[(i + 1) % 4];
            return (
              <circle
                key={`mid-${i}`}
                cx={(p.x + next.x) / 2}
                cy={(p.y + next.y) / 2}
                r={5}
                fill="#8B6914"
                stroke="#FAFBFC"
                strokeWidth={1.5}
              />
            );
          })}
        </svg>
      )}

      {ready &&
        screenPoints.map((p, i) => (
          <div
            key={i}
            role="button"
            tabIndex={0}
            aria-label={`مقبض ${HANDLE_LABELS[i]} — اسحب لضبط حافة المستند`}
            onPointerDown={startDrag(i)}
            className="absolute w-8 h-8 -translate-x-1/2 -translate-y-1/2 rounded-md bg-mistara-gold border-2 border-mistara-cream shadow-[0_2px_12px_rgba(139,105,20,0.35)] active:scale-110 touch-none cursor-grab active:cursor-grabbing"
            style={{
              left: p.x,
              top: p.y,
              transition: animateQuad ? 'left 0.28s ease-out, top 0.28s ease-out' : undefined,
            }}
          />
        ))}
    </div>
  );
}
