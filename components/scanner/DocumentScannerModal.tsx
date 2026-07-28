'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  computeOutputSize,
  warpPerspective,
  type Quad,
} from '@/lib/document-scanner/geometry';
import { detectDocumentQuad, quadsAreClose } from '@/lib/document-scanner/detect-document';
import { enhanceDocumentCanvas, softEnhanceCanvas } from '@/lib/document-scanner/enhance';
import { canvasToDocumentPdfBlob } from '@/lib/document-scanner/to-pdf';
import {
  CAMERA_START_TIMEOUT_MS,
  CAPTURE_DETECTION_SAMPLE_WIDTH,
  DETECTION_INTERVAL_MS,
  DETECTION_SAMPLE_WIDTH,
  FALLBACK_MARGIN_X_RATIO,
  FALLBACK_MARGIN_Y_RATIO,
  MAX_MISSED_DETECTION_STREAK,
  MAX_OUTPUT_DIMENSION,
  OVERLAY_SMOOTHING_ALPHA,
  SCAN_JPEG_QUALITY,
  STABILITY_FRAME_COUNT,
} from '@/lib/document-scanner/constants';

export type DocumentScanResult = { jpegBlob: Blob; pdfBlob: Blob };

type DocumentScannerModalProps = {
  onClose: () => void;
  /** يُنفَّذ عند تأكيد المستخدم للمستند؛ يجب أن يرمي خطأ عند فشل الرفع كي تعرضه النافذة. */
  onConfirm: (result: DocumentScanResult) => Promise<void>;
};

type Phase = 'starting' | 'live' | 'processing' | 'preview' | 'preview-uncertain' | 'uploading' | 'error';
type DetectionStatus = 'none' | 'searching' | 'stable';

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

/**
 * إطار احتياطي مركزي آمن يُستخدم فقط حين يتعذّر اكتشاف حواف المستند بثقة.
 * بدل استخدام إطار الكاميرا كاملاً حرفياً (حواف-إلى-حواف) — وما قد يظهر
 * فيه من أرضية/أثاث/أطراف جسم عند تصوير مستند بالطول على خلفية غير محايدة —
 * نقتصّ هامشاً آمناً من كل جهة، فنقلّل احتمال ظهور خلفية واضحة في الناتج.
 */
function centeredFallbackQuad(width: number, height: number): Quad {
  const marginX = width * FALLBACK_MARGIN_X_RATIO;
  const marginY = height * FALLBACK_MARGIN_Y_RATIO;
  return [
    { x: marginX, y: marginY },
    { x: width - marginX, y: marginY },
    { x: width - marginX, y: height - marginY },
    { x: marginX, y: height - marginY },
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

function drawOverlayQuad(canvas: HTMLCanvasElement, frameW: number, frameH: number, quad: Quad | null, stable: boolean) {
  if (canvas.width !== frameW || canvas.height !== frameH) {
    canvas.width = frameW;
    canvas.height = frameH;
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, frameW, frameH);
  if (!quad) return;

  const color = stable ? 'rgba(16,185,129,0.95)' : 'rgba(34,211,238,0.9)';
  const fill = stable ? 'rgba(16,185,129,0.16)' : 'rgba(34,211,238,0.12)';

  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(3, frameW * 0.006);
  ctx.strokeStyle = color;
  ctx.fillStyle = fill;
  ctx.shadowColor = color;
  ctx.shadowBlur = 20;

  ctx.beginPath();
  ctx.moveTo(quad[0].x, quad[0].y);
  ctx.lineTo(quad[1].x, quad[1].y);
  ctx.lineTo(quad[2].x, quad[2].y);
  ctx.lineTo(quad[3].x, quad[3].y);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.shadowBlur = 0;
  const r = Math.max(5, frameW * 0.011);
  for (const pt of quad) {
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }
}

/**
 * ماسح ضوئي ذكي للمستندات/الفواتير: كاميرا حية + اكتشاف حواف تلقائي مع إطار
 * تفاعلي متوهّج، التقاط تلقائي عند الثبات أو زر التقاط يدوي، تصحيح منظور
 * وتحسين تلقائي للنتيجة، ثم تحويلها إلى PDF جاهز للرفع — تجربة شبيهة بماسح
 * المستندات في واتساب.
 */
export function DocumentScannerModal({ onClose, onConfirm }: DocumentScannerModalProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const workCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const correctedCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);

  const historyRef = useRef<Quad[]>([]);
  const autoCapturedRef = useRef(false);
  /** موضع الإطار التفاعلي بعد التنعيم الزمني (EMA) — يُستخدم للرسم وفحص الثبات فقط، لا لدقة القصّ النهائية. */
  const smoothedQuadRef = useRef<Quad | null>(null);
  /** عدّاد محاولات الاكتشاف الفاشلة المتتالية (لإتاحة فترة سماح قبل إخفاء الإطار). */
  const missStreakRef = useRef(0);
  /** هل نتج الالتقاط الحالي عن اكتشاف حواف واثق (يُستخدم لاختيار صيغة تصدير PDF الأنسب لاحقاً — PNG للمسح الثنائي المُحسَّن، JPEG للمعاينة اللطيفة الاحترازية). */
  const confidentCaptureRef = useRef(false);
  /** يُضبَط فوراً عند ضغط زر الإغلاق (X) — يمنع أي متابعة لعمليات غير متزامنة قيد التنفيذ (بدء الكاميرا، معالجة الالتقاط...) من تحديث الحالة بعد إغلاق المستخدم للماسح صراحة. */
  const isClosingRef = useRef(false);
  /** معرِّف مؤقّت انتهاء مهلة تشغيل الكاميرا — يُلغى فوراً عند الإغلاق اليدوي كي لا يُفعَّل بعد فوات الأوان. */
  const cameraTimeoutIdRef = useRef<number | null>(null);

  const [phase, setPhase] = useState<Phase>('starting');
  const [detectionStatus, setDetectionStatus] = useState<DetectionStatus>('none');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null);

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
    // فعلياً خلالها (نافذة إذن متأخرة الاستجابة، أو أي عائق آخر يحجب
    // استكمال الـ Promise)، نفكّ التعليق تلقائياً بدل ترك المستخدم أمام شاشة
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

      // إمّا أُغلق الماسح صراحة، أو سبق أن انتهت المهلة وعُرض خطأ للمستخدم
      // بالفعل — في الحالتين نُحرِّر الكاميرا فوراً بدل تركها مشغَّلة (مؤشر
      // الكاميرا مضاء) دون أي استخدام فعلي لبثّها.
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

  const finishCapture = useCallback(async (fullCanvas: HTMLCanvasElement) => {
    const vw = fullCanvas.width;
    const vh = fullCanvas.height;

    // نُجري دائماً اكتشافاً دقيقاً وطازجاً على كامل دقة الإطار الملتقط في هذه
    // اللحظة بالذات (خوارزمية يدوية خفيفة قائمة على Canvas 2D/ImageData: تحسين
    // تباين محلي + عتبة Otsu + إغلاق مورفولوجي + فحص نسيج داخلي يرفض الكتل
    // المشبوهة) — لا نعتمد إطلاقاً على آخر اكتشاف حي منخفض الدقة، فهو معرَّض
    // لنفس مصدر الخطأ (خلفية قريبة الإضاءة من الورقة).
    const precise = detectDocumentQuad(fullCanvas, vw, vh, getOrCreateCanvas(workCanvasRef), {
      sampleWidth: CAPTURE_DETECTION_SAMPLE_WIDTH,
      denoise: true,
    });

    // ثقة كاملة فقط عند نجاح اكتشاف دقيق وطازج لحواف حقيقية. غير ذلك، بدل
    // استخدام إطار الكاميرا بكامله (حواف-إلى-حواف، وما يحمله من أرضية/خلفية
    // واضحة عند تصوير طويل)، نتراجع لإطار مركزي احترازي أضيق، ونتجنّب كلياً
    // تطبيق تحويل المسح الثنائي (أبيض/أسود) القاسي عليه — لأنه مصمَّم لصفحة
    // بيضاء نظيفة فقط، وسيُنتج ضجيجاً كثيفاً فوق أي خلفية واقعية غير مسطّحة.
    if (isClosingRef.current) return;

    const confident = Boolean(precise);
    confidentCaptureRef.current = confident;
    const quad = precise?.points ?? centeredFallbackQuad(vw, vh);

    const { width, height } = computeOutputSize(quad);
    const scaleDown = Math.min(1, MAX_OUTPUT_DIMENSION / Math.max(width, height));
    const outW = Math.max(1, Math.round(width * scaleDown));
    const outH = Math.max(1, Math.round(height * scaleDown));

    // تصحيح منظور يدوي خفيف (Canvas 2D خالص — Homography + أخذ عيّنة ثنائية الخطية).
    const corrected = warpPerspective(fullCanvas, quad, outW, outH);

    if (confident) {
      enhanceDocumentCanvas(corrected);
    } else {
      softEnhanceCanvas(corrected);
    }

    if (isClosingRef.current) return;

    correctedCanvasRef.current = corrected;
    setPreviewDataUrl(corrected.toDataURL('image/jpeg', SCAN_JPEG_QUALITY));
    setPhase(confident ? 'preview' : 'preview-uncertain');
  }, []);

  const handleCapture = useCallback(() => {
    const video = videoRef.current;
    if (!video || phase !== 'live') return;
    setPhase('processing');

    // مهلة قصيرة جداً كي تُعاد رسم الواجهة (سبينر "جاري المعالجة") قبل حساب
    // تصحيح المنظور نسبياً الثقيل على الخيط الرئيسي.
    window.setTimeout(() => {
      void (async () => {
        try {
          if (isClosingRef.current) return;
          const vw = video.videoWidth;
          const vh = video.videoHeight;
          if (!vw || !vh) throw new Error('تعذّر قراءة إطار الكاميرا.');
          const fullCanvas = drawFullFrame(video, vw, vh);
          await finishCapture(fullCanvas);
        } catch (err) {
          if (isClosingRef.current) return;
          console.error('[scanner] capture failed', err);
          setErrorMessage('تعذّرت معالجة المستند. حاول مجدداً بإضاءة أفضل وثبات أكبر.');
          setPhase('live');
        }
      })();
    }, 30);
  }, [phase, finishCapture]);

  // حلقة الاكتشاف الحي (Edge Detection) + رسم الإطار التفاعلي + الالتقاط التلقائي عند الثبات
  useEffect(() => {
    if (phase !== 'live') return;

    let rafId = 0;
    let lastRun = 0;

    const loop = (ts: number) => {
      rafId = requestAnimationFrame(loop);
      const video = videoRef.current;
      const overlay = overlayCanvasRef.current;
      if (!video || !overlay || video.readyState < 2) return;
      if (ts - lastRun < DETECTION_INTERVAL_MS) return;
      lastRun = ts;

      const vw = video.videoWidth;
      const vh = video.videoHeight;
      if (!vw || !vh) return;

      const detected = detectDocumentQuad(video, vw, vh, getOrCreateCanvas(workCanvasRef), {
        sampleWidth: DETECTION_SAMPLE_WIDTH,
      });

      // تنعيم زمني (Exponential Moving Average) لموضع زوايا الإطار التفاعلي
      // بين الإطارات المتتالية — يُقلِّل الاهتزاز الناتج عن ضجيج بسيط في
      // الاكتشاف اللحظي دون التأثير على دقة القصّ النهائي (الذي يعتمد دوماً
      // على اكتشاف طازج عالي الدقة عند الالتقاط الفعلي، لا على هذا التنعيم).
      if (detected) {
        missStreakRef.current = 0;
        const prevSmoothed = smoothedQuadRef.current;
        smoothedQuadRef.current = !prevSmoothed
          ? detected.points
          : (prevSmoothed.map((p, i) => ({
              x: p.x + (detected.points[i].x - p.x) * OVERLAY_SMOOTHING_ALPHA,
              y: p.y + (detected.points[i].y - p.y) * OVERLAY_SMOOTHING_ALPHA,
            })) as Quad);
      } else {
        missStreakRef.current += 1;
        // فترة سماح قصيرة قبل إخفاء الإطار تماماً: يمنع الوميض المزعج عند فشل
        // الاكتشاف للحظة واحدة (إضاءة ضعيفة/اهتزاز يد بسيط) بدل اعتباره فقداناً فورياً.
        if (missStreakRef.current > MAX_MISSED_DETECTION_STREAK) {
          smoothedQuadRef.current = null;
        }
      }

      const smoothedQuad = smoothedQuadRef.current;

      const history = historyRef.current;
      if (smoothedQuad) {
        history.push(smoothedQuad);
        if (history.length > STABILITY_FRAME_COUNT) history.shift();
      } else {
        history.length = 0;
      }

      const tolerance = Math.min(vw, vh) * 0.025;
      const stable =
        history.length >= STABILITY_FRAME_COUNT &&
        history.every((q, i) => i === 0 || quadsAreClose(q, history[i - 1], tolerance));

      setDetectionStatus(smoothedQuad ? (stable ? 'stable' : 'searching') : 'none');
      drawOverlayQuad(overlay, vw, vh, smoothedQuad, stable);

      if (stable && smoothedQuad && !autoCapturedRef.current) {
        autoCapturedRef.current = true;
        handleCapture();
      }
    };

    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [phase, handleCapture]);

  const handleGalleryPick = () => galleryInputRef.current?.click();

  const handleGalleryFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setPhase('processing');
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const img = await loadImageElement(dataUrl);
      const fullCanvas = drawFullFrame(img, img.naturalWidth || img.width, img.naturalHeight || img.height);
      await finishCapture(fullCanvas);
    } catch (err) {
      console.error('[scanner] gallery import failed', err);
      setErrorMessage('تعذّر تحميل الصورة المختارة. جرّب صورة أخرى.');
      setPhase(streamRef.current ? 'live' : 'error');
    }
  };

  const handleRetake = () => {
    setPreviewDataUrl(null);
    correctedCanvasRef.current = null;
    autoCapturedRef.current = false;
    historyRef.current = [];
    smoothedQuadRef.current = null;
    missStreakRef.current = 0;
    setDetectionStatus('none');
    setErrorMessage(null);

    // نظّف أي إطار متبقٍّ مرسوماً من قبل على الكانفاس التفاعلي قبل العودة
    // للبث الحي، كي لا يظهر إطار قديم للحظة قبل أن تلتقط الحلقة الحية إطاراً جديداً.
    const overlay = overlayCanvasRef.current;
    if (overlay) {
      overlay.getContext('2d')?.clearRect(0, 0, overlay.width, overlay.height);
    }

    // الفيديو والبث (stream) يبقيان متصلين طوال الوقت (لم يُوقَفا أو يُفصَلا)
    // لأن عنصر <video> لم يُزَل من الشجرة أصلاً؛ إعادة الحالة إلى 'live' تكفي
    // لعودة المعاينة الحية فوراً وبسلاسة دون أي تجميد.
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
      // PNG (ضغط بلا فقد) فقط للمسح الثنائي المُحسَّن (مناطق مسطّحة واسعة
      // تضغط ممتازاً وبلا تشويش حواف)؛ JPEG للمعاينة اللطيفة الاحترازية
      // (صورة فوتوغرافية عادية الألوان) حيث يبقى أصغر حجماً بكثير من PNG.
      const pdfBlob = await canvasToDocumentPdfBlob(canvas, { preferPng: confidentCaptureRef.current });

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
    autoCapturedRef.current = false;
    historyRef.current = [];
    smoothedQuadRef.current = null;
    missStreakRef.current = 0;
    void startCamera({ cancelled: false });
  };

  const handleClose = () => {
    // يُضبَط أولاً وفوراً — قبل أي عملية أخرى — كي تتوقف كل العمليات غير
    // المتزامنة الجارية (بدء الكاميرا، مهلتها، الاكتشاف/الالتقاط) عن تحديث
    // حالة هذا المكوّن بمجرّد اكتمالها لاحقاً، مهما كانت المرحلة الحالية.
    isClosingRef.current = true;
    if (cameraTimeoutIdRef.current !== null) {
      window.clearTimeout(cameraTimeoutIdRef.current);
      cameraTimeoutIdRef.current = null;
    }
    stopStream();
    onClose();
  };

  const statusHint =
    detectionStatus === 'stable'
      ? '✅ ثبّت الكاميرا... جارٍ الالتقاط تلقائياً'
      : detectionStatus === 'searching'
        ? '🔍 حواف المستند مكتشفة، ثبّت الكاميرا قليلاً'
        : '📄 وجّه الكاميرا نحو المستند أو الفاتورة';

  return (
    <div className="fixed inset-0 z-[70] bg-slate-950 flex flex-col" dir="rtl">
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleGalleryFile}
      />

      {/*
        شريط علوي: موضعه `fixed` (لا `absolute`) وبأعلى ترتيب طبقات (z-[100])
        عمداً — مستقل تماماً عن أي طبقة تحميل/معالجة داخل منطقة الكاميرا
        (`starting`/`processing`/`error`...)، فيبقى زر الإغلاق (X) ظاهراً
        وقابلاً للنقر فوق كل شيء دوماً، أياً كانت حالة المكوّن الداخلية.
      */}
      <div className="fixed top-0 inset-x-0 z-[100] flex items-center justify-between px-4 py-3 bg-gradient-to-b from-black/70 to-transparent pointer-events-none">
        <button
          type="button"
          onClick={handleClose}
          className="pointer-events-auto w-11 h-11 rounded-full bg-slate-900/70 backdrop-blur border border-white/10 text-white flex items-center justify-center text-lg active:scale-95 transition-transform"
          aria-label="إغلاق الماسح الضوئي"
        >
          ✕
        </button>
        <span className="text-sm sm:text-base font-bold text-white/90">ماسح المستندات الذكي</span>
        <span className="w-11" aria-hidden />
      </div>

      {/* منطقة الكاميرا/المعاينة — النقر عليها أثناء البث الحي يلتقط المستند فوراً أيضاً (مثل زر الالتقاط تماماً) */}
      <div
        className={`relative flex-1 overflow-hidden bg-black ${phase === 'live' ? 'cursor-pointer' : ''}`}
        onClick={phase === 'live' ? handleCapture : undefined}
        role={phase === 'live' ? 'button' : undefined}
        aria-label={phase === 'live' ? 'اضغط في أي مكان لالتقاط المستند' : undefined}
      >
        {/*
          الفيديو وكانفاس الإطار التفاعلي يبقيان مثبَّتين (Mounted) دائماً طوال
          حياة المكوّن — لا نزيلهما من الشجرة عند الانتقال لمرحلة المعاينة/الخطأ،
          بل نُخفيهما بصرياً فقط (invisible). هذا يمنع مشكلة "الشاشة المجمّدة"
          عند الضغط على "إعادة الالتقاط": فرصة إعادة تركيب <video> جديد كلياً
          بلا `srcObject` (لأن العنصر القديم أُزيل من الشجرة) كانت تجعل البث لا
          يظهر أبداً رغم أن الكاميرا لا تزال تعمل فعلياً في الخلفية.
        */}
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          className={`absolute inset-0 w-full h-full object-cover ${
            phase === 'starting' || phase === 'live' || phase === 'processing' ? '' : 'invisible'
          }`}
        />
        <canvas
          ref={overlayCanvasRef}
          className={`absolute inset-0 w-full h-full object-cover pointer-events-none ${phase === 'live' ? '' : 'invisible'}`}
        />

        {phase === 'starting' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-950/70">
            <span className="h-10 w-10 rounded-full border-2 border-cyan-500/30 border-t-cyan-400 animate-spin" />
            <p className="text-sm text-cyan-300 font-bold">جاري تشغيل الكاميرا...</p>
          </div>
        )}

        {phase === 'processing' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-950/80">
            <span className="h-10 w-10 rounded-full border-2 border-emerald-500/30 border-t-emerald-400 animate-spin" />
            <p className="text-sm text-emerald-300 font-bold">جاري تحسين ومعالجة المستند...</p>
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

        {(phase === 'preview' || phase === 'preview-uncertain') && previewDataUrl && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-4 bg-slate-950">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewDataUrl}
              alt="معاينة المستند الممسوح"
              className="max-h-[62vh] w-auto max-w-full rounded-2xl border-2 border-cyan-400/60 shadow-[0_25px_70px_-15px_rgba(8,145,178,0.5)] object-contain bg-white"
            />
            {phase === 'preview-uncertain' && (
              <div className="w-full max-w-sm rounded-2xl border border-amber-400/40 bg-amber-500/10 px-3.5 py-2.5 text-center">
                <p className="text-xs sm:text-sm font-bold text-amber-200">
                  ⚠️ تعذّر تحديد حواف المستند بدقة (قد تظهر خلفية). للحصول على
                  أفضل نتيجة، أعد الالتقاط مع وضع الورقة على خلفية داكنة موحّدة
                  وإضاءة جيدة.
                </p>
              </div>
            )}
            <p className="text-sm text-slate-300 text-center font-bold">
              راجع وضوح المستند والحواف قبل الاعتماد النهائي — لن يُحفظ أو يُرسل تلقائياً
            </p>
          </div>
        )}

        {(phase === 'live' || phase === 'starting') && (
          <div className="absolute bottom-28 inset-x-0 flex justify-center px-4 pointer-events-none">
            <span
              className={`pointer-events-auto text-xs sm:text-sm font-bold px-4 py-2 rounded-full backdrop-blur border ${
                detectionStatus === 'stable'
                  ? 'bg-emerald-500/20 border-emerald-400/40 text-emerald-200'
                  : 'bg-slate-900/70 border-white/10 text-white'
              }`}
            >
              {statusHint}
            </span>
          </div>
        )}
      </div>

      {/* شريط التحكم السفلي */}
      <div className="relative z-20 bg-gradient-to-t from-black/80 to-transparent px-6 pb-8 pt-4">
        {phase === 'live' && (
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={handleGalleryPick}
              className="w-12 h-12 rounded-full bg-slate-900/70 border border-white/10 text-white flex items-center justify-center text-lg"
              aria-label="اختيار صورة من المعرض"
            >
              📁
            </button>

            <button
              type="button"
              onClick={handleCapture}
              className="w-20 h-20 rounded-full bg-white border-[6px] border-cyan-400 shadow-[0_0_30px_rgba(34,211,238,0.6)] active:scale-95 transition-transform"
              aria-label="التقاط المستند يدوياً"
            />

            <span className="w-12 h-12" aria-hidden />
          </div>
        )}

        {(phase === 'preview' || phase === 'preview-uncertain') && (
          <div className="space-y-3">
            {errorMessage && (
              <div
                role="alert"
                className="rounded-2xl border border-rose-500/40 bg-rose-500/10 text-rose-100 text-sm px-3.5 py-3"
              >
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
