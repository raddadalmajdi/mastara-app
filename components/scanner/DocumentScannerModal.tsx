'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { computeOutputSize, warpPerspective, type Quad } from '@/lib/document-scanner/geometry';
import { enhanceDocumentCanvas } from '@/lib/document-scanner/enhance';
import { canvasToDocumentPdfBlob } from '@/lib/document-scanner/to-pdf';
import { CornerAdjuster, detectDocumentEdgesAuto } from './CornerAdjuster';
import { CAMERA_START_TIMEOUT_MS, MAX_OUTPUT_DIMENSION, SCAN_JPEG_QUALITY } from '@/lib/document-scanner/constants';

export type DocumentScanResult = { jpegBlob: Blob; pdfBlob: Blob };

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
 *   processing→ القصّ الهندسي (Perspective) والتحويل لأبيض/أسود بعد "التالي".
 *   preview   → مراجعة نهائية قبل الحفظ (اعتماد/إعادة الالتقاط).
 *   uploading → رفع PDF + JPEG وحفظ السجل.
 */
type Phase = 'starting' | 'live' | 'capturing' | 'edges' | 'processing' | 'preview' | 'uploading' | 'error';
type EdgesMode = 'auto' | 'full' | 'manual';

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
  const base = 'absolute w-10 h-10 sm:w-14 sm:h-14 border-white/95';
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
 * وتحويل أبيض/أسود، فمعاينة نهائية واعتماد، فرفع PDF+JPEG إلى Supabase.
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
  /** مؤشر تحميل بسيط أثناء تشغيل زر «Auto» صراحةً في شاشة كشف الحواف. */
  const [isAutoDetecting, setIsAutoDetecting] = useState(false);
  /** رسالة تنبيه قصيرة (تختفي تلقائياً) عند فشل الاكتشاف التلقائي — يبقى شبه المنحرف الحالي كما هو دون تغيير. */
  const [edgesToast, setEdgesToast] = useState<string | null>(null);

  // إخفاء تلقائي لتنبيه فشل الاكتشاف بعد مدة قصيرة كي لا يبقى معلَّقاً على الشاشة.
  useEffect(() => {
    if (!edgesToast) return;
    const id = window.setTimeout(() => setEdgesToast(null), 3800);
    return () => window.clearTimeout(id);
  }, [edgesToast]);

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
  }, []);

  /** ينتقل لشاشة "كشف الحواف" من إطار خام (كاميرا أو صورة من المعرض): اكتشاف أولي سريع لتحديد شبه منحرف بادئ، ثم عرض الصورة كاملة الدقة قابلة للتعديل اليدوي. */
  const beginEdgesFromRawCanvas = useCallback((rawCanvas: HTMLCanvasElement) => {
    if (isClosingRef.current) return;
    const vw = rawCanvas.width;
    const vh = rawCanvas.height;

    rawCaptureCanvasRef.current = rawCanvas;

    const result = detectDocumentEdgesAuto(rawCanvas, vw, vh, getOrCreateCanvas(workCanvasRef));

    setEdgesMode(result ? 'auto' : 'full');
    setEdgesQuad(result?.quad ?? fullFrameQuad(vw, vh));
    setEdgesToast(result ? null : 'تعذّر العثور على حواف واضحة تلقائياً — تم اعتماد الصورة كاملة، اضبط الزوايا يدوياً أو اضغط Auto مجدداً.');
    setRawDims({ width: vw, height: vh });
    setRawPreviewUrl(rawCanvas.toDataURL('image/jpeg', 0.92));

    if (isClosingRef.current) return;
    setPhase('edges');
  }, []);

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

  /**
   * زر «Auto» في شاشة كشف الحواف: يعيد تشغيل الاكتشاف التلقائي على الصورة
   * الخام كاملة الدقة. يعرض مؤشر تحميل بسيط على الزر أثناء التشغيل (مهلة
   * قصيرة صريحة تضمن ظهوره فعلياً ولو للحظة، فالاكتشاف نفسه سريع جداً)،
   * ويُحدِّث المقابض الزرقاء فوراً عند النجاح. عند الفشل: يبقى شبه المنحرف
   * الحالي كما هو دون أي تغيير (لا يُستبدَل بالصورة كاملة تلقائياً)، مع
   * إشعار قصير يوجّه المستخدم للتعديل اليدوي أو إعادة المحاولة.
   */
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
          setEdgesMode('auto');
          setEdgesQuad(result.quad);
        } else {
          setEdgesToast('تعذّر العثور على حواف واضحة تلقائياً. جرّب إضاءة أفضل أو خلفية داكنة موحّدة، أو اضبط الزوايا يدوياً.');
        }
      } finally {
        if (!isClosingRef.current) setIsAutoDetecting(false);
      }
    }, 250);
  }, [isAutoDetecting]);

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

  /** زر «التالي»: قصّ هندسي حقيقي (Perspective Correction) وفق شبه المنحرف المضبوط فعلياً، ثم تحويل أبيض/أسود عالي التباين. */
  const handleConfirmEdges = useCallback(() => {
    const rawCanvas = rawCaptureCanvasRef.current;
    const quad = edgesQuad;
    if (!rawCanvas || !quad) return;

    setPhase('processing');

    window.setTimeout(() => {
      try {
        if (isClosingRef.current) return;

        const { width, height } = computeOutputSize(quad);
        const scaleDown = Math.min(1, MAX_OUTPUT_DIMENSION / Math.max(width, height));
        const outW = Math.max(1, Math.round(width * scaleDown));
        const outH = Math.max(1, Math.round(height * scaleDown));

        const corrected = warpPerspective(rawCanvas, quad, outW, outH);
        enhanceDocumentCanvas(corrected);

        if (isClosingRef.current) return;

        correctedCanvasRef.current = corrected;
        setPreviewDataUrl(corrected.toDataURL('image/jpeg', SCAN_JPEG_QUALITY));
        setPhase('preview');
      } catch (err) {
        if (isClosingRef.current) return;
        console.error('[scanner] perspective correction failed', err);
        setErrorMessage('تعذّرت معالجة المستند. حاول ضبط الزوايا مجدداً.');
        setPhase('edges');
      }
    }, 30);
  }, [edgesQuad]);

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
      // PNG (ضغط بلا فقد) دائماً هنا: المستند دوماً محوَّل فعلياً لأبيض/أسود
      // (مناطق مسطّحة واسعة تضغط ممتازاً وبلا تشويش حواف) بعد شاشة كشف
      // الحواف الصريحة — لا حاجة بعد الآن لمسار "غير واثق" منفصل.
      const pdfBlob = await canvasToDocumentPdfBlob(canvas, { preferPng: true, highQuality: true });

      await onConfirm({ jpegBlob, pdfBlob });
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
    <div className="fixed inset-0 z-[70] bg-slate-950 flex flex-col" dir="rtl">
      <input ref={galleryInputRef} type="file" accept="image/*" className="hidden" onChange={handleGalleryFile} />

      {/*
        شريط علوي: موضعه `fixed` (لا `absolute`) وبأعلى ترتيب طبقات (z-[100])
        عمداً — مستقل تماماً عن أي طبقة تحميل/معالجة داخل منطقة الكاميرا،
        فيبقى زر الإغلاق/الرجوع ظاهراً وقابلاً للنقر فوق كل شيء دوماً. في
        شاشة "كشف الحواف" فقط يتحوّل الشريط إلى (رجوع ← عنوان ← التالي) بأسلوب HP Smart.
      */}
      <div className="fixed top-0 inset-x-0 z-[100] flex items-center justify-between px-4 py-3 bg-gradient-to-b from-black/70 to-transparent pointer-events-none">
        {isEdgesPhase ? (
          <button
            type="button"
            onClick={handleBackFromEdges}
            className="pointer-events-auto flex items-center gap-1.5 rounded-full bg-slate-900/70 backdrop-blur border border-white/10 text-white px-3.5 h-11 text-sm font-bold active:scale-95 transition-transform"
            aria-label="رجوع لالتقاط صورة جديدة"
          >
            <span aria-hidden>→</span> رجوع
          </button>
        ) : (
          <button
            type="button"
            onClick={handleClose}
            className="pointer-events-auto w-11 h-11 rounded-full bg-slate-900/70 backdrop-blur border border-white/10 text-white flex items-center justify-center text-lg active:scale-95 transition-transform"
            aria-label="إغلاق الماسح الضوئي"
          >
            ✕
          </button>
        )}

        <span className="text-sm sm:text-base font-bold text-white/90">{isEdgesPhase ? 'كشف الحواف' : 'مسح مستند'}</span>

        {isEdgesPhase ? (
          <button
            type="button"
            onClick={handleConfirmEdges}
            className="pointer-events-auto rounded-full bg-blue-500 text-white px-5 h-11 text-sm font-black shadow-lg shadow-blue-500/30 active:scale-95 transition-transform"
          >
            التالي
          </button>
        ) : (
          <span className="w-11" aria-hidden />
        )}
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
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-950/70">
            <span className="h-10 w-10 rounded-full border-2 border-cyan-500/30 border-t-cyan-400 animate-spin" />
            <p className="text-sm text-cyan-300 font-bold">جاري تشغيل الكاميرا...</p>
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
            <CornerAdjuster
              imageSrc={rawPreviewUrl}
              naturalWidth={rawDims.width}
              naturalHeight={rawDims.height}
              quad={edgesQuad}
              onQuadChange={handleEdgesQuadChange}
            />
            {edgesToast && (
              <div className="absolute top-20 inset-x-4 flex justify-center pointer-events-none z-10">
                <div className="pointer-events-auto max-w-sm rounded-2xl border border-amber-400/40 bg-amber-500/15 backdrop-blur px-3.5 py-2.5 text-center shadow-lg">
                  <p className="text-xs sm:text-sm font-bold text-amber-100">⚠️ {edgesToast}</p>
                </div>
              </div>
            )}
          </>
        )}

        {phase === 'processing' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-950/80">
            <span className="h-10 w-10 rounded-full border-2 border-emerald-500/30 border-t-emerald-400 animate-spin" />
            <p className="text-sm text-emerald-300 font-bold">جاري القصّ والتحسين...</p>
          </div>
        )}

        {phase === 'error' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-6 text-center bg-slate-950">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-rose-500/15 ring-4 ring-rose-500/30">
              <svg className="h-8 w-8 text-rose-400" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M8 8l8 8M16 8l-8 8" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
              </svg>
            </div>
            <p className="text-base font-bold text-rose-300">{errorMessage ?? 'تعذّر تشغيل الكاميرا.'}</p>
            <div className="flex gap-2 w-full max-w-xs">
              <button
                type="button"
                onClick={handleRetryCamera}
                className="flex-1 rounded-2xl bg-cyan-500 text-slate-950 font-bold text-sm py-3"
              >
                🔄 إعادة المحاولة
              </button>
              <button
                type="button"
                onClick={handleGalleryPick}
                className="flex-1 rounded-2xl bg-slate-800 text-white font-bold text-sm py-3 border border-white/10"
              >
                📁 من المعرض
              </button>
            </div>
          </div>
        )}

        {phase === 'preview' && previewDataUrl && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-4 bg-slate-950">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewDataUrl}
              alt="معاينة المستند الممسوح"
              className="max-h-[62vh] w-auto max-w-full rounded-2xl border-2 border-cyan-400/60 shadow-[0_25px_70px_-15px_rgba(8,145,178,0.5)] object-contain bg-white"
            />
            <p className="text-sm text-slate-300 text-center font-bold">راجع وضوح المستند والحواف قبل الاعتماد النهائي</p>
          </div>
        )}

        {phase === 'live' && (
          <div className="absolute bottom-28 inset-x-0 flex justify-center px-4 pointer-events-none">
            <span className="pointer-events-auto text-xs sm:text-sm font-bold px-4 py-2 rounded-full backdrop-blur border bg-slate-900/70 border-white/10 text-white">
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
                className="w-12 h-12 rounded-full bg-slate-900/70 border border-white/10 text-white flex items-center justify-center text-lg"
                aria-label="اختيار صورة من المعرض"
              >
                📁
              </button>
              <span className="text-[11px] font-bold text-white/70">المصدر</span>
            </div>

            <button
              type="button"
              onClick={handleCapture}
              className="w-20 h-20 rounded-full bg-white border-[6px] border-cyan-400 shadow-[0_0_30px_rgba(34,211,238,0.6)] active:scale-95 transition-transform"
              aria-label="التقاط المستند"
            />

            <span className="w-12" aria-hidden />
          </div>
        )}

        {phase === 'edges' && (
          <div className="flex items-center justify-center gap-4">
            <button
              type="button"
              onClick={handleAutoDetectEdges}
              disabled={isAutoDetecting}
              aria-busy={isAutoDetecting}
              className={`flex flex-col items-center gap-1.5 rounded-2xl px-5 py-2.5 border transition-colors disabled:opacity-70 ${
                edgesMode === 'auto'
                  ? 'bg-blue-500/20 border-blue-400/60 text-blue-200'
                  : 'bg-slate-900/70 border-white/10 text-white/80'
              }`}
            >
              {isAutoDetecting ? (
                <span className="h-4 w-4 rounded-full border-2 border-blue-300/40 border-t-blue-300 animate-spin" aria-hidden />
              ) : (
                <span className="text-lg" aria-hidden>
                  ✨
                </span>
              )}
              <span className="text-xs font-bold">{isAutoDetecting ? '...جارِ الاكتشاف' : 'Auto'}</span>
            </button>
            <button
              type="button"
              onClick={handleFullFrameEdges}
              disabled={isAutoDetecting}
              className={`flex flex-col items-center gap-1.5 rounded-2xl px-5 py-2.5 border transition-colors disabled:opacity-70 ${
                edgesMode === 'full'
                  ? 'bg-blue-500/20 border-blue-400/60 text-blue-200'
                  : 'bg-slate-900/70 border-white/10 text-white/80'
              }`}
            >
              <span className="text-lg" aria-hidden>
                ⤢
              </span>
              <span className="text-xs font-bold">Full</span>
            </button>
          </div>
        )}

        {phase === 'preview' && (
          <div className="space-y-3">
            {errorMessage && (
              <div role="alert" className="rounded-2xl border border-rose-500/40 bg-rose-500/10 text-rose-100 text-sm px-3.5 py-3">
                {errorMessage}
              </div>
            )}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleRetake}
                className="flex-1 rounded-2xl bg-slate-800/80 hover:bg-slate-800 py-3.5 text-sm text-white font-bold border border-white/10"
              >
                🔁 إعادة الالتقاط
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                className="flex-1 rounded-2xl bg-gradient-to-l from-cyan-400 to-cyan-500 py-3.5 text-slate-950 font-black text-sm shadow-lg shadow-cyan-500/20"
              >
                ✅ اعتماد المستند وحفظه
              </button>
            </div>
          </div>
        )}

        {phase === 'uploading' && (
          <div className="flex items-center justify-center gap-3 py-3">
            <span className="h-5 w-5 rounded-full border-2 border-cyan-500/30 border-t-cyan-400 animate-spin" />
            <p className="text-sm font-bold text-cyan-300">جاري رفع وحفظ المستند...</p>
          </div>
        )}
      </div>
    </div>
  );
}
