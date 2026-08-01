'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { orderCorners, type Quad } from '@/lib/document-scanner/geometry';
import { processDocumentCanvas } from '@/lib/document-scanner/process-document';
import { canvasToDocumentPdfBlob } from '@/lib/document-scanner/to-pdf';
import { CornerAdjuster, detectDocumentEdgesAuto } from './CornerAdjuster';
import {
  CAMERA_START_TIMEOUT_MS,
  MAX_COVERAGE_RATIO,
  MIN_COVERAGE_RATIO,
  SCAN_JPEG_QUALITY,
} from '@/lib/document-scanner/constants';
import type { DocumentScanResult } from '@/lib/document-scanner/scan-result';

export type { DocumentScanResult } from '@/lib/document-scanner/scan-result';

type DocumentScannerModalProps = {
  onClose: () => void;
  /** يُنفَّذ عند تأكيد المستخدم للمستند؛ يجب أن يرمي خطأ عند فشل الرفع كي تعرضه النافذة. */
  onConfirm: (result: DocumentScanResult) => Promise<void>;
};

/**
 * مراحل الماسح — تجربة من خطوتين مطابقة لتطبيق HP Smart:
 *   live      → كاميرا حية بإطار إرشادي ثابت (بلا تتبّع حي)، زر التقاط واحد واضح.
 *   capturing → لحظة قصيرة فور الالتقاط (شارة "Processing..." فوق المعاينة الحية).
 *   edges     → شاشة "كشف الحواف" الثابتة: صورة عالية الدقة + شبه منحرف أزرق
 *               قابل للسحب بحرية + أزرار Auto/Full + زر التالي.
 *   processing→ القصّ الهندسي (Perspective) وتحسين ألوان المستند قبل المعاينة.
 *   preview   → مراجعة نهائية + Auto Crop قبل الحفظ.
 *   uploading → رفع PDF + JPEG وحفظ السجل.
 */
type Phase = 'starting' | 'live' | 'capturing' | 'edges' | 'processing' | 'preview' | 'uploading' | 'error';
type EdgesMode = 'auto' | 'full' | 'manual';
/** ارتفاع محجوز أسفل شريط العنوان وآخر الشاشة في مرحلة كشف الحواف (px تقريباً). */
const EDGES_SAFE_TOP_PX = 68;
const EDGES_SAFE_BOTTOM_PX = 200;
/** مدة ظهور تنبيه فشل الاكتشاف (ms) — قصيرة ولا تُثبَّت على الشاشة. */
const EDGES_TOAST_DURATION_MS = 2000;

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error('تعذّر قراءة الصورة المختارة.'));
    reader.readAsDataURL(file);
  });
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('تعذّر تحميل الصورة المختارة.'));
    img.src = src;
  });
}

function getOrCreateCanvas(ref: React.MutableRefObject<HTMLCanvasElement | null>): HTMLCanvasElement {
  if (!ref.current) ref.current = document.createElement('canvas');
  return ref.current;
}

/** شبه منحرف يغطي الصورة كاملةً حافة-إلى-حافة — يقابل زر «Full» وأيضاً الإطار الافتراضي عند تعذّر الاكتشاف التلقائي. */
function fullFrameQuad(width: number, height: number): Quad {
  return [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: height },
    { x: 0, y: height },
  ];
}

function drawFullFrame(source: CanvasImageSource, width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx?.drawImage(source, 0, 0, width, height);
  return canvas;
}

/** زاوية إرشادية ثابتة (شكل "L") — إطار توجيهي بصري بسيط فوق الكاميرا الحية، بلا أي تتبّع أو تفاعل، تماماً كما في HP Smart. */
function CornerGuide({ position }: { position: 'tl' | 'tr' | 'bl' | 'br' }) {
  const base = 'absolute w-10 h-10 sm:w-14 sm:h-14 border-mistara-cream/95';
  const styles: Record<typeof position, string> = {
    tl: 'top-0 left-0 border-t-[3px] border-l-[3px] rounded-tl-2xl',
    tr: 'top-0 right-0 border-t-[3px] border-r-[3px] rounded-tr-2xl',
    bl: 'bottom-0 left-0 border-b-[3px] border-l-[3px] rounded-bl-2xl',
    br: 'bottom-0 right-0 border-b-[3px] border-r-[3px] rounded-br-2xl',
  };
  return <div className={`${base} ${styles[position]} drop-shadow-[0_0_6px_rgba(0,0,0,0.6)]`} aria-hidden />;
}

/**
 * ماسح ضوئي ذكي للمستندات/الفواتير بتجربة مطابقة لتطبيق HP Smart: التقاط
 * سريع بإطار إرشادي ثابت، فشاشة "كشف حواف" مخصَّصة لضبط شبه منحرف أزرق
 * بأربع مقابض قابلة للسحب بدقة فوق صورة ثابتة عالية الدقة، ثم قصّ هندسي
 * وتحسين ألوان (Document Enhance)، فمعاينة نهائية واعتماد، فرفع PDF+JPEG.
 */
export function DocumentScannerModal({ onClose, onConfirm }: DocumentScannerModalProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const workCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const rawCaptureCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const correctedCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);

  /** يُضبَط فوراً عند ضغط زر الإغلاق (X) — يمنع أي متابعة لعمليات غير متزامنة قيد التنفيذ من تحديث الحالة بعد إغلاق المستخدم للماسح صراحة. */
  const isClosingRef = useRef(false);
  /** معرِّف مؤقّت انتهاء مهلة تشغيل الكاميرا — يُلغى فوراً عند الإغلاق اليدوي كي لا يُفعَّل بعد فوات الأوان. */
  const cameraTimeoutIdRef = useRef<number | null>(null);

  const [phase, setPhase] = useState<Phase>('starting');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null);

  // حالة شاشة "كشف الحواف": صورة ثابتة عالية الدقة + شبه منحرف قابل للتعديل.
  const [rawPreviewUrl, setRawPreviewUrl] = useState<string | null>(null);
  const [rawDims, setRawDims] = useState<{ width: number; height: number } | null>(null);
  const [edgesQuad, setEdgesQuad] = useState<Quad | null>(null);
  const [edgesMode, setEdgesMode] = useState<EdgesMode>('auto');
  /** مؤشر تحميل أثناء Auto Crop في المعاينة أو شاشة الحواف. */
  const [isAutoDetecting, setIsAutoDetecting] = useState(false);
  const [previewToast, setPreviewToast] = useState<string | null>(null);
  /** رسالة تنبيه قصيرة (تختفي تلقائياً) عند فشل الاكتشاف التلقائي — يبقى شبه المنحرف الحالي كما هو دون تغيير. */
  const [edgesToast, setEdgesToast] = useState<string | null>(null);
  /** يُزاد عند تطبيق زوايا مكتشفة تلقائياً لتحريك المقابض الزرقاء بانتقال بصري. */
  const [edgesQuadRevision, setEdgesQuadRevision] = useState(0);

  // إخفاء تنبيه فشل الاكتشاف بعد ثانيتين — أو فور نجاح الضبط/السحب اليدوي.
  useEffect(() => {
    if (!edgesToast) return;
    const id = window.setTimeout(() => setEdgesToast(null), EDGES_TOAST_DURATION_MS);
    return () => window.clearTimeout(id);
  }, [edgesToast]);

  useEffect(() => {
    if (!previewToast) return;
    const id = window.setTimeout(() => setPreviewToast(null), 3800);
    return () => window.clearTimeout(id);
  }, [previewToast]);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const startCamera = useCallback(async (signal: { cancelled: boolean }) => {
    setPhase('starting');
    setErrorMessage(null);

    if (!navigator.mediaDevices?.getUserMedia) {
      if (!signal.cancelled && !isClosingRef.current) {
        setErrorMessage('لا يدعم هذا المتصفح الوصول إلى الكاميرا. استخدم صورة من المعرض بدلاً منها.');
        setPhase('error');
      }
      return;
    }

    // مهلة زمنية قصوى صريحة: إن لم تُحلّ نافذة إذن الكاميرا أو تبدأ الكاميرا
    // فعلياً خلالها، نفكّ التعليق تلقائياً بدل ترك المستخدم أمام شاشة
    // "جاري تشغيل الكاميرا..." إلى ما لا نهاية.
    let timedOut = false;
    cameraTimeoutIdRef.current = window.setTimeout(() => {
      timedOut = true;
      if (signal.cancelled || isClosingRef.current) return;
      console.warn('[scanner] انتهت مهلة تشغيل الكاميرا —', CAMERA_START_TIMEOUT_MS, 'ms بلا استجابة.');
      setErrorMessage('تعذّر تشغيل الكاميرا خلال المهلة المسموحة. انقر «إعادة المحاولة»، أو استخدم صورة من المعرض.');
      setPhase('error');
    }, CAMERA_START_TIMEOUT_MS);

    const clearCameraTimeout = () => {
      if (cameraTimeoutIdRef.current !== null) {
        window.clearTimeout(cameraTimeoutIdRef.current);
        cameraTimeoutIdRef.current = null;
      }
    };

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });
      clearCameraTimeout();

      if (signal.cancelled || isClosingRef.current || timedOut) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      streamRef.current = stream;
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        await video.play().catch(() => undefined);
      }
      if (!signal.cancelled && !isClosingRef.current) setPhase('live');
    } catch (err) {
      clearCameraTimeout();
      if (signal.cancelled || isClosingRef.current || timedOut) return;
      console.error('[scanner] getUserMedia failed', err);
      const name = err instanceof Error ? err.name : '';
      setErrorMessage(
        name === 'NotAllowedError'
          ? 'تم رفض إذن الوصول إلى الكاميرا. فعّله من إعدادات المتصفح، أو اختر صورة من المعرض.'
          : 'تعذّر تشغيل الكاميرا. تحقق من توصيلها أو استخدم صورة من المعرض بدلاً منها.'
      );
      setPhase('error');
    }
  }, []);

  // تشغيل الكاميرا عند فتح الماسح — التأجيل عبر queueMicrotask يفصل استدعاء
  // startCamera (وما بداخله من setState فوري) عن تنفيذ جسم الـ effect نفسه.
  useEffect(() => {
    const signal = { cancelled: false };
    queueMicrotask(() => {
      if (!signal.cancelled) void startCamera(signal);
    });
    return () => {
      signal.cancelled = true;
      isClosingRef.current = true;
      if (cameraTimeoutIdRef.current !== null) {
        window.clearTimeout(cameraTimeoutIdRef.current);
        cameraTimeoutIdRef.current = null;
      }
      stopStream();
    };
  }, [startCamera, stopStream]);

  const resetEdgesState = useCallback(() => {
    rawCaptureCanvasRef.current = null;
    setRawPreviewUrl(null);
    setRawDims(null);
    setEdgesQuad(null);
    setEdgesMode('auto');
    setIsAutoDetecting(false);
    setEdgesToast(null);
    setPreviewToast(null);
    setEdgesQuadRevision(0);
  }, []);

  /** يطبّق زوايا المستند المكتشفة برمجياً — كأن المستخدم سحب المقابض الأربعة — مع إخفاء التنبيه. */
  const applyAutoDetectedQuad = useCallback((quad: Quad) => {
    const ordered = orderCorners(quad);
    setEdgesQuad(ordered);
    setEdgesMode('auto');
    setEdgesToast(null);
    setEdgesQuadRevision((n) => n + 1);
    return ordered;
  }, []);

  const applyProcessedPreview = useCallback((quad: Quad) => {
    const rawCanvas = rawCaptureCanvasRef.current;
    if (!rawCanvas || isClosingRef.current) return false;

    const corrected = processDocumentCanvas(rawCanvas, quad);
    correctedCanvasRef.current = corrected;
    setPreviewDataUrl(corrected.toDataURL('image/jpeg', SCAN_JPEG_QUALITY));
    setEdgesQuad(quad);
    return true;
  }, []);

  const shouldAutoSkipToPreview = (coverage: number): boolean =>
    coverage >= MIN_COVERAGE_RATIO && coverage <= MAX_COVERAGE_RATIO;

  /** ينتقل لشاشة "كشف الحواف" من إطار خام (كاميرا أو صورة من المعرض): اكتشاف أولي سريع لتحديد شبه منحرف بادئ، ثم عرض الصورة كاملة الدقة قابلة للتعديل اليدوي. */
  const beginEdgesFromRawCanvas = useCallback((rawCanvas: HTMLCanvasElement) => {
    if (isClosingRef.current) return;
    const vw = rawCanvas.width;
    const vh = rawCanvas.height;

    rawCaptureCanvasRef.current = rawCanvas;

    const result = detectDocumentEdgesAuto(rawCanvas, vw, vh, getOrCreateCanvas(workCanvasRef));

    const detectedQuad = result ? applyAutoDetectedQuad(result.quad) : null;
    if (!result) {
      setEdgesMode('full');
      setEdgesQuad(fullFrameQuad(vw, vh));
    }
    setEdgesToast(result ? null : 'تعذّر العثور على حواف واضحة تلقائياً — تم اعتماد الصورة كاملة، اضبط الزوايا يدوياً أو اضغط Auto Crop مجدداً.');
    setRawDims({ width: vw, height: vh });
    setRawPreviewUrl(rawCanvas.toDataURL('image/jpeg', 0.92));

    if (isClosingRef.current) return;

    if (result && detectedQuad && shouldAutoSkipToPreview(result.coverage)) {
      setPhase('processing');
      window.setTimeout(() => {
        try {
          if (isClosingRef.current) return;
          if (applyProcessedPreview(detectedQuad)) {
            setPhase('preview');
          } else {
            setPhase('edges');
          }
        } catch (err) {
          console.error('[scanner] auto crop failed', err);
          setPhase('edges');
        }
      }, 30);
      return;
    }

    setPhase('edges');
  }, [applyAutoDetectedQuad, applyProcessedPreview]);

  const handleCapture = useCallback(() => {
    const video = videoRef.current;
    if (!video || phase !== 'live') return;
    setPhase('capturing');

    // مهلة قصيرة جداً كي تُعاد رسم الواجهة (شارة "Processing...") قبل قراءة
    // إطار الفيديو وتشغيل اكتشاف الحواف الأولي.
    window.setTimeout(() => {
      try {
        if (isClosingRef.current) return;
        const vw = video.videoWidth;
        const vh = video.videoHeight;
        if (!vw || !vh) throw new Error('تعذّر قراءة إطار الكاميرا.');
        const rawCanvas = drawFullFrame(video, vw, vh);
        beginEdgesFromRawCanvas(rawCanvas);
      } catch (err) {
        if (isClosingRef.current) return;
        console.error('[scanner] capture failed', err);
        setErrorMessage('تعذّرت قراءة إطار الكاميرا. حاول مجدداً بإضاءة أفضل وثبات أكبر.');
        setPhase('live');
      }
    }, 30);
  }, [phase, beginEdgesFromRawCanvas]);

  const handleGalleryPick = () => galleryInputRef.current?.click();

  const handleGalleryFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setPhase('capturing');
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const img = await loadImageElement(dataUrl);
      const rawCanvas = drawFullFrame(img, img.naturalWidth || img.width, img.naturalHeight || img.height);
      beginEdgesFromRawCanvas(rawCanvas);
    } catch (err) {
      console.error('[scanner] gallery import failed', err);
      setErrorMessage('تعذّر تحميل الصورة المختارة. جرّب صورة أخرى.');
      setPhase(streamRef.current ? 'live' : 'error');
    }
  };

  /** زر «Auto Crop» — إعادة اكتشاف الحواف على الصورة الخام. */
  const handleAutoDetectEdges = useCallback(() => {
    const rawCanvas = rawCaptureCanvasRef.current;
    if (!rawCanvas || isAutoDetecting) return;

    setIsAutoDetecting(true);
    setEdgesToast(null);

    window.setTimeout(() => {
      try {
        if (isClosingRef.current) return;
        const result = detectDocumentEdgesAuto(rawCanvas, rawCanvas.width, rawCanvas.height, getOrCreateCanvas(workCanvasRef));
        if (result) {
          applyAutoDetectedQuad(result.quad);
        } else {
          setEdgesToast('تعذّر العثور على حواف واضحة تلقائياً. جرّب إضاءة أفضل أو خلفية داكنة موحّدة، أو اضبط الزوايا يدوياً.');
        }
      } finally {
        if (!isClosingRef.current) setIsAutoDetecting(false);
      }
    }, 250);
  }, [applyAutoDetectedQuad, isAutoDetecting]);

  /** زر «Full» في شاشة كشف الحواف: يعتمد الصورة بالكامل حافة-إلى-حافة بلا أي اكتشاف. */
  const handleFullFrameEdges = useCallback(() => {
    const rawCanvas = rawCaptureCanvasRef.current;
    if (!rawCanvas) return;
    setEdgesMode('full');
    setEdgesQuad(fullFrameQuad(rawCanvas.width, rawCanvas.height));
    setEdgesToast(null);
  }, []);

  /** أي سحب يدوي لأحد المقابض الأربعة يُحوِّل الوضع إلى «يدوي» (يُلغي تحديد Auto/Full بصرياً). */
  const handleEdgesQuadChange = useCallback((next: Quad) => {
    setEdgesQuad(next);
    setEdgesMode('manual');
    setEdgesToast(null);
  }, []);

  /** زر الرجوع من شاشة كشف الحواف: تجاهل الالتقاط الحالي والعودة للكاميرا الحية مباشرة. */
  const handleBackFromEdges = useCallback(() => {
    resetEdgesState();
    setErrorMessage(null);
    setPhase(streamRef.current ? 'live' : 'error');
  }, [resetEdgesState]);

  /** زر «التالي»: قصّ منظور + تحسين ألوان المستند (Document Enhance). */
  const handleConfirmEdges = useCallback(() => {
    const rawCanvas = rawCaptureCanvasRef.current;
    const quad = edgesQuad;
    if (!rawCanvas || !quad) return;

    setPhase('processing');

    window.setTimeout(() => {
      try {
        if (isClosingRef.current) return;
        if (!applyProcessedPreview(quad)) {
          throw new Error('تعذّرت معالجة المستند.');
        }
        setPhase('preview');
      } catch (err) {
        if (isClosingRef.current) return;
        console.error('[scanner] perspective correction failed', err);
        setErrorMessage('تعذّرت معالجة المستند. حاول ضبط الزوايا مجدداً.');
        setPhase('edges');
      }
    }, 30);
  }, [edgesQuad, applyProcessedPreview]);

  /** Auto Crop من شاشة المعاينة — إعادة اكتشاف الحواف ومعالجة الصورة. */
  const handlePreviewAutoCrop = useCallback(() => {
    const rawCanvas = rawCaptureCanvasRef.current;
    if (!rawCanvas || isAutoDetecting) return;

    setIsAutoDetecting(true);
    setPreviewToast(null);

    window.setTimeout(() => {
      try {
        if (isClosingRef.current) return;
        const result = detectDocumentEdgesAuto(
          rawCanvas,
          rawCanvas.width,
          rawCanvas.height,
          getOrCreateCanvas(workCanvasRef)
        );
        if (result) {
          const ordered = applyAutoDetectedQuad(result.quad);
          if (applyProcessedPreview(ordered)) {
            setPreviewToast('تم قصّ المستند تلقائياً.');
          }
        } else {
          setPreviewToast('تعذّر العثور على حواف واضحة — جرّب «ضبط القص» يدوياً.');
        }
      } finally {
        if (!isClosingRef.current) setIsAutoDetecting(false);
      }
    }, 250);
  }, [applyAutoDetectedQuad, isAutoDetecting, applyProcessedPreview]);

  const handleAdjustCropFromPreview = useCallback(() => {
    setPreviewToast(null);
    setPhase('edges');
  }, []);

  const handleRetake = () => {
    setPreviewDataUrl(null);
    correctedCanvasRef.current = null;
    resetEdgesState();
    setErrorMessage(null);
    setPhase(streamRef.current ? 'live' : 'error');
  };

  const handleConfirm = async () => {
    const canvas = correctedCanvasRef.current;
    if (!canvas) return;
    setPhase('uploading');
    setErrorMessage(null);

    try {
      const jpegBlob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error('تعذّر إنشاء صورة المستند.'))),
          'image/jpeg',
          SCAN_JPEG_QUALITY
        );
      });
      // PNG (ضغط بلا فقد): المستند مُحسَّن بالألوان مع خلفية بيضاء وتباين عالٍ.
      const pdfBlob = await canvasToDocumentPdfBlob(canvas, { preferPng: true, highQuality: true });

      await onConfirm({
        jpegBlob,
        pdfBlob,
      });
      stopStream();
      onClose();
    } catch (err) {
      console.error('[scanner] confirm/upload failed', err);
      setErrorMessage(err instanceof Error ? err.message : 'تعذّر رفع المستند. حاول مجدداً.');
      setPhase('preview');
    }
  };

  const handleRetryCamera = () => {
    resetEdgesState();
    void startCamera({ cancelled: false });
  };

  const handleClose = () => {
    // يُضبَط أولاً وفوراً — قبل أي عملية أخرى — كي تتوقف كل العمليات غير
    // المتزامنة الجارية عن تحديث حالة هذا المكوّن بمجرّد اكتمالها لاحقاً،
    // مهما كانت المرحلة الحالية.
    isClosingRef.current = true;
    if (cameraTimeoutIdRef.current !== null) {
      window.clearTimeout(cameraTimeoutIdRef.current);
      cameraTimeoutIdRef.current = null;
    }
    stopStream();
    onClose();
  };

  const isEdgesPhase = phase === 'edges';

  return (
    <div className="fixed inset-0 z-[70] bg-mistara-cream flex flex-col" dir="rtl">
      <input ref={galleryInputRef} type="file" accept="image/*" className="hidden" onChange={handleGalleryFile} />

      {/*
        شريط علوي: موضعه `fixed` (لا `absolute`) وبأعلى ترتيب طبقات (z-[100])
        عمداً — مستقل تماماً عن أي طبقة تحميل/معالجة داخل منطقة الكاميرا،
        فيبقى زر الإغلاق/الرجوع ظاهراً وقابلاً للنقر فوق كل شيء دوماً. في
        شاشة "كشف الحواف" يظهر زر الرجوع والعنوان فقط — زر «التالي» في الأسفل.
      */}
      <div className="fixed top-0 inset-x-0 z-[100] flex items-center justify-between px-4 py-3 bg-gradient-to-b from-black/70 to-transparent pointer-events-none">
        {isEdgesPhase ? (
          <button
            type="button"
            onClick={handleBackFromEdges}
            className="pointer-events-auto flex items-center gap-1.5 rounded-full bg-mistara-beige/85 backdrop-blur border border-mistara-brown/12 text-mistara-espresso px-3.5 h-11 text-sm font-bold active:scale-95 transition-transform"
            aria-label="رجوع لالتقاط صورة جديدة"
          >
            <span aria-hidden>→</span> رجوع
          </button>
        ) : (
          <button
            type="button"
            onClick={handleClose}
            className="pointer-events-auto w-11 h-11 rounded-full bg-mistara-beige/70 backdrop-blur border border-mistara-brown/12 text-white flex items-center justify-center text-lg active:scale-95 transition-transform"
            aria-label="إغلاق الماسح الضوئي"
          >
            ✕
          </button>
        )}

        <span className="text-sm sm:text-base font-bold text-mistara-espresso/90">{isEdgesPhase ? 'كشف الحواف' : 'مسح مستند'}</span>

        <span className="w-11" aria-hidden />
      </div>

      {/* منطقة الكاميرا/كشف الحواف/المعاينة */}
      <div
        className={`relative flex-1 overflow-hidden bg-black ${phase === 'live' ? 'cursor-pointer' : ''}`}
        onClick={phase === 'live' ? handleCapture : undefined}
        role={phase === 'live' ? 'button' : undefined}
        aria-label={phase === 'live' ? 'اضغط في أي مكان لالتقاط المستند' : undefined}
      >
        {/*
          الفيديو يبقى مثبَّتاً (Mounted) دائماً طوال حياة المكوّن — لا نزيله
          من الشجرة عند الانتقال لمرحلة أخرى، بل نُخفيه بصرياً فقط
          (invisible)، لضمان بقاء بثّ MediaStream متصلاً وعودة سلسة للمعاينة
          الحية دون أي تجميد عند "إعادة الالتقاط".
        */}
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          className={`absolute inset-0 w-full h-full object-cover ${
            phase === 'starting' || phase === 'live' || phase === 'capturing' ? '' : 'invisible'
          }`}
        />

        {/* إطار إرشادي ثابت بأربع زوايا (شكل HP Smart) — توجيه بصري بسيط بلا أي تتبّع أو تفاعل مباشرة على الكاميرا الحية. */}
        {(phase === 'live' || phase === 'starting' || phase === 'capturing') && (
          <div className="absolute inset-8 sm:inset-14 pointer-events-none">
            <CornerGuide position="tl" />
            <CornerGuide position="tr" />
            <CornerGuide position="bl" />
            <CornerGuide position="br" />
          </div>
        )}

        {phase === 'starting' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-mistara-cream/70">
            <span className="h-10 w-10 rounded-full border-2 border-mistara-gold/30 border-t-mistara-gold animate-spin" />
            <p className="text-sm text-mistara-warm font-bold">جاري تشغيل الكاميرا...</p>
          </div>
        )}

        {/* شارة "Processing..." علوية على البث الحي فور الالتقاط — قبل الانتقال لشاشة كشف الحواف. */}
        {phase === 'capturing' && (
          <div className="absolute bottom-32 inset-x-0 flex justify-center px-4 pointer-events-none">
            <span className="flex items-center gap-2 bg-white text-slate-900 text-sm font-bold px-4 py-2 rounded-full shadow-xl">
              <span className="h-3.5 w-3.5 rounded-full border-2 border-slate-300 border-t-slate-600 animate-spin" />
              جارِ المعالجة...
            </span>
          </div>
        )}

        {phase === 'edges' && rawPreviewUrl && rawDims && edgesQuad && (
          <>
            <div
              className="absolute inset-x-2 z-0"
              style={{ top: EDGES_SAFE_TOP_PX, bottom: EDGES_SAFE_BOTTOM_PX }}
            >
              <CornerAdjuster
                imageSrc={rawPreviewUrl}
                naturalWidth={rawDims.width}
                naturalHeight={rawDims.height}
                quad={edgesQuad}
                quadRevision={edgesQuadRevision}
                onQuadChange={handleEdgesQuadChange}
              />
            </div>
            {edgesToast && (
              <div
                className="absolute inset-x-4 flex justify-center pointer-events-none z-10"
                style={{ top: EDGES_SAFE_TOP_PX + 8 }}
              >
                <div className="pointer-events-none max-w-sm rounded-2xl border border-primary/40 bg-primary/10 backdrop-blur px-3.5 py-2.5 text-center shadow-lg">
                  <p className="text-xs sm:text-sm font-bold text-mistara-brown">⚠️ {edgesToast}</p>
                </div>
              </div>
            )}
          </>
        )}

        {phase === 'processing' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-mistara-cream/80">
            <span className="h-10 w-10 rounded-full border-2 border-mistara-gold-dark/30 border-t-mistara-gold animate-spin" />
            <p className="text-sm text-mistara-gold-dark font-bold">جاري القصّ وتحسين الألوان...</p>
          </div>
        )}

        {phase === 'error' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-6 text-center bg-mistara-cream">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-800/10 ring-4 ring-red-800/25">
              <svg className="h-8 w-8 text-red-800" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M8 8l8 8M16 8l-8 8" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
              </svg>
            </div>
            <p className="text-base font-bold text-red-700">{errorMessage ?? 'تعذّر تشغيل الكاميرا.'}</p>
            <div className="flex gap-2 w-full max-w-xs">
              <button
                type="button"
                onClick={handleRetryCamera}
                className="flex-1 rounded-2xl bg-mistara-gold text-mistara-cream font-bold text-sm py-3"
              >
                🔄 إعادة المحاولة
              </button>
              <button
                type="button"
                onClick={handleGalleryPick}
                className="flex-1 rounded-2xl bg-mistara-beige text-mistara-espresso font-bold text-sm py-3 border border-mistara-brown/12"
              >
                📁 من المعرض
              </button>
            </div>
          </div>
        )}

        {phase === 'preview' && previewDataUrl && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-4 pt-20 bg-mistara-cream">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewDataUrl}
              alt="معاينة المستند الممسوح"
              className="max-h-[62vh] w-auto max-w-full rounded-2xl border-2 border-mistara-gold/50 shadow-[0_16px_48px_-12px_rgba(74,55,40,0.18)] object-contain bg-white"
            />
            {previewToast && (
              <p className="text-xs font-bold text-mistara-warm text-center px-4">{previewToast}</p>
            )}
            <p className="text-sm text-mistara-brown text-center font-bold">تأكد من وضوح المستند والألوان قبل الاعتماد</p>
          </div>
        )}

        {phase === 'live' && (
          <div className="absolute bottom-28 inset-x-0 flex justify-center px-4 pointer-events-none">
            <span className="pointer-events-auto text-xs sm:text-sm font-bold px-4 py-2 rounded-full backdrop-blur border bg-mistara-beige/70 border-mistara-brown/12 text-white">
              📄 ضع المستند داخل الإطار والتقط الصورة
            </span>
          </div>
        )}
      </div>

      {/* شريط التحكم السفلي */}
      <div className="relative z-20 bg-gradient-to-t from-black/80 to-transparent px-6 pb-8 pt-4">
        {phase === 'live' && (
          <div className="flex items-center justify-between">
            <div className="flex flex-col items-center gap-1.5">
              <button
                type="button"
                onClick={handleGalleryPick}
                className="w-12 h-12 rounded-full bg-mistara-beige/70 border border-mistara-brown/12 text-white flex items-center justify-center text-lg"
                aria-label="اختيار صورة من المعرض"
              >
                📁
              </button>
              <span className="text-[11px] font-bold text-mistara-cream/75">المصدر</span>
            </div>

            <button
              type="button"
              onClick={handleCapture}
              className="w-20 h-20 rounded-full bg-white border-[6px] border-primary shadow-[0_0_30px_rgba(24,119,242,0.35)] active:scale-95 transition-transform"
              aria-label="التقاط المستند"
            />

            <span className="w-12" aria-hidden />
          </div>
        )}

        {phase === 'edges' && (
          <div className="flex flex-col items-center gap-3 w-full max-w-sm mx-auto">
            <button
              type="button"
              onClick={handleConfirmEdges}
              disabled={isAutoDetecting}
              className="w-full rounded-2xl bg-mistara-gold text-mistara-cream py-3.5 text-sm font-black shadow-lg shadow-mistara-gold/25 active:scale-[0.98] transition-transform disabled:opacity-60"
            >
              التالي
            </button>
            <div className="flex items-center justify-center gap-4 w-full">
              <button
                type="button"
                onClick={handleAutoDetectEdges}
                disabled={isAutoDetecting}
                aria-busy={isAutoDetecting}
                className={`flex flex-1 flex-col items-center gap-1.5 rounded-2xl px-4 py-2.5 border transition-colors disabled:opacity-70 ${
                  edgesMode === 'auto'
                    ? 'bg-mistara-gold/15 border-mistara-gold/50 text-mistara-gold-light'
                    : 'bg-mistara-beige/70 border-mistara-brown/12 text-mistara-cream/85'
                }`}
              >
                {isAutoDetecting ? (
                  <span className="h-4 w-4 rounded-full border-2 border-mistara-gold-light/40 border-t-mistara-gold-light animate-spin" aria-hidden />
                ) : (
                  <span className="text-lg" aria-hidden>
                    ✨
                  </span>
                )}
                <span className="text-xs font-bold">{isAutoDetecting ? '...جارِ القص' : 'Auto Crop'}</span>
              </button>
              <button
                type="button"
                onClick={handleFullFrameEdges}
                disabled={isAutoDetecting}
                className={`flex flex-1 flex-col items-center gap-1.5 rounded-2xl px-4 py-2.5 border transition-colors disabled:opacity-70 ${
                  edgesMode === 'full'
                    ? 'bg-mistara-gold/15 border-mistara-gold/50 text-mistara-gold-light'
                    : 'bg-mistara-beige/70 border-mistara-brown/12 text-mistara-cream/85'
                }`}
              >
                <span className="text-lg" aria-hidden>
                  ⤢
                </span>
                <span className="text-xs font-bold">Full</span>
              </button>
            </div>
          </div>
        )}

        {phase === 'preview' && (
          <div className="space-y-3">
            {errorMessage && (
              <div role="alert" className="rounded-2xl border border-red-800/35 bg-red-800/8 text-red-900 text-sm px-3.5 py-3">
                {errorMessage}
              </div>
            )}
            <div className="flex gap-2 justify-center">
              <button
                type="button"
                onClick={handlePreviewAutoCrop}
                disabled={isAutoDetecting}
                aria-busy={isAutoDetecting}
                className="flex flex-col items-center gap-1 rounded-2xl px-4 py-2.5 border bg-mistara-beige/70 border-mistara-brown/12 text-mistara-cream/90 text-xs font-bold disabled:opacity-60"
              >
                {isAutoDetecting ? (
                  <span className="h-4 w-4 rounded-full border-2 border-mistara-gold-light/40 border-t-mistara-gold-light animate-spin" aria-hidden />
                ) : (
                  <span aria-hidden>✨</span>
                )}
                Auto Crop
              </button>
              <button
                type="button"
                onClick={handleAdjustCropFromPreview}
                disabled={isAutoDetecting}
                className="flex flex-col items-center gap-1 rounded-2xl px-4 py-2.5 border bg-mistara-beige/70 border-mistara-brown/12 text-mistara-cream/90 text-xs font-bold disabled:opacity-60"
              >
                <span aria-hidden>✂️</span>
                ضبط القص
              </button>
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleRetake}
                className="flex-1 rounded-2xl bg-mistara-beige/80 hover:bg-mistara-beige py-3.5 text-sm text-mistara-espresso font-bold border border-mistara-brown/12"
              >
                🔁 إعادة الالتقاط
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                className="flex-1 rounded-2xl bg-gradient-to-l from-mistara-gold to-mistara-gold-dark py-3.5 text-mistara-cream font-black text-sm shadow-lg shadow-mistara-gold/15"
              >
                ✅ اعتماد المستند وحفظه
              </button>
            </div>
          </div>
        )}

        {phase === 'uploading' && (
          <div className="flex items-center justify-center gap-3 py-3">
            <span className="h-5 w-5 rounded-full border-2 border-mistara-gold/30 border-t-mistara-gold animate-spin" />
            <p className="text-sm font-bold text-mistara-warm">جاري رفع وحفظ المستند...</p>
          </div>
        )}
      </div>
    </div>
  );
}
