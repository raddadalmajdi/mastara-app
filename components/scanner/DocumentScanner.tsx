'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getOpenCvRuntime, loadOpenCv, OPENCV_SLOW_HINT_MS, retryLoadOpenCv } from '@/lib/opencv-loader';

type FilterMode = 'color' | 'gray' | 'bw' | 'original';

interface Point {
  x: number;
  y: number;
}

export interface DocumentScannerProps {
  onCapture?: (dataUrl: string) => void;
  onClose?: () => void;
  className?: string;
}

const FILTER_LABELS: Record<FilterMode, string> = {
  color: 'ألوان (مسح ضوئي)',
  gray: 'تدرّج رمادي',
  bw: 'أبيض/أسود',
  original: 'بدون تحسين',
};

function mapCameraError(err: unknown): string {
  if (err instanceof DOMException) {
    switch (err.name) {
      case 'NotAllowedError':
      case 'PermissionDeniedError':
        return 'تم رفض إذن الكاميرا. فعّل الكاميرا من إعدادات المتصفح ثم أعد المحاولة.';
      case 'NotFoundError':
      case 'DevicesNotFoundError':
        return 'لم يُعثر على كاميرا على هذا الجهاز.';
      case 'NotReadableError':
      case 'TrackStartError':
        return 'الكاميرا مستخدمة من تطبيق آخر. أغلِقه ثم أعد المحاولة.';
      case 'SecurityError':
        return 'المتصفح يمنع الوصول للكاميرا. تأكد من فتح الموقع عبر HTTPS.';
      case 'OverconstrainedError':
        return 'إعدادات الكاميرا غير مدعومة على هذا الجهاز — جرّب مجدداً.';
      default:
        return `تعذّر تشغيل الكاميرا: ${err.message}`;
    }
  }
  return err instanceof Error ? err.message : 'تعذّر الوصول إلى الكاميرا.';
}

export default function DocumentScanner({ onCapture, onClose, className = '' }: DocumentScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const resultCanvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastQuadRef = useRef<Point[] | null>(null);
  const capturedCornersRef = useRef<Point[] | null>(null);
  const sourceCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const warpedMatRef = useRef<unknown>(null);

  const [cvReady, setCvReady] = useState(false);
  const [cvLoading, setCvLoading] = useState(true);
  const [cvSlow, setCvSlow] = useState(false);
  const [cvError, setCvError] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);
  const [cameraOpening, setCameraOpening] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [documentFound, setDocumentFound] = useState(false);
  const [resultVisible, setResultVisible] = useState(false);
  const [activeFilter, setActiveFilter] = useState<FilterMode>('original');

  const beginOpenCvLoad = useCallback((force = false) => {
    setCvLoading(true);
    setCvSlow(false);
    setCvError(null);
    if (force) {
      setCvReady(false);
    }

    const slowTimer = window.setTimeout(() => setCvSlow(true), OPENCV_SLOW_HINT_MS);
    const loader = force ? retryLoadOpenCv() : loadOpenCv();

    void loader
      .then(() => {
        setCvReady(true);
      })
      .catch((err) => {
        setCvReady(false);
        setCvError(err instanceof Error ? err.message : 'تعذّر تحميل محرك المعالجة.');
      })
      .finally(() => {
        window.clearTimeout(slowTimer);
        setCvLoading(false);
      });
  }, []);

  useEffect(() => {
    beginOpenCvLoad(false);
  }, [beginOpenCvLoad]);

  useEffect(() => {
    if (cvReady && actionFeedback === 'جاري تجهيز محرك المعالجة، يرجى الانتظار قليلاً...') {
      setActionFeedback(null);
    }
  }, [cvReady, actionFeedback]);

  const orderPoints = (pts: Point[]): Point[] => {
    const sum = pts.map((p) => p.x + p.y);
    const diff = pts.map((p) => p.y - p.x);
    const tl = pts[sum.indexOf(Math.min(...sum))];
    const br = pts[sum.indexOf(Math.max(...sum))];
    const tr = pts[diff.indexOf(Math.min(...diff))];
    const bl = pts[diff.indexOf(Math.max(...diff))];
    return [tl, tr, br, bl];
  };

  const detectDocumentQuad = useCallback((canvas: HTMLCanvasElement): Point[] | null => {
    const cv = getOpenCvRuntime();
    let src: { delete: () => void } | undefined;
    let gray: { delete: () => void } | undefined;
    let blurred: { delete: () => void } | undefined;
    let edged: { delete: () => void } | undefined;
    let dilated: { delete: () => void } | undefined;

    try {
      src = cv.imread(canvas);
      gray = new cv.Mat();
      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
      blurred = new cv.Mat();
      cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);
      edged = new cv.Mat();
      cv.Canny(blurred, edged, 50, 150);
      dilated = new cv.Mat();
      const kernel = cv.Mat.ones(3, 3, cv.CV_8U);
      cv.dilate(edged, dilated, kernel, new cv.Point(-1, -1), 1);
      kernel.delete();

      const contours = new cv.MatVector();
      const hierarchy = new cv.Mat();
      cv.findContours(dilated, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

      let bestQuad: { rows: number; data32S: Int32Array; clone: () => { delete: () => void }; delete: () => void } | null =
        null;
      let maxArea = 0;
      const imgArea = canvas.width * canvas.height;

      for (let i = 0; i < contours.size(); i++) {
        const cnt = contours.get(i);
        const area = cv.contourArea(cnt);
        if (area < imgArea * 0.15) {
          cnt.delete();
          continue;
        }
        const peri = cv.arcLength(cnt, true);
        const approx = new cv.Mat();
        cv.approxPolyDP(cnt, approx, 0.02 * peri, true);
        if (approx.rows === 4 && area > maxArea) {
          maxArea = area;
          bestQuad?.delete();
          bestQuad = approx.clone();
        }
        approx.delete();
        cnt.delete();
      }

      let points: Point[] | null = null;
      if (bestQuad) {
        points = [];
        for (let i = 0; i < 4; i++) {
          points.push({ x: bestQuad.data32S[i * 2], y: bestQuad.data32S[i * 2 + 1] });
        }
        bestQuad.delete();
      }
      contours.delete();
      hierarchy.delete();
      return points;
    } catch {
      return null;
    } finally {
      src?.delete();
      gray?.delete();
      blurred?.delete();
      edged?.delete();
      dilated?.delete();
    }
  }, []);

  const drawOverlay = useCallback(
    (quadSmall: Point[] | null, scale: number) => {
      const overlay = overlayRef.current;
      const video = videoRef.current;
      if (!overlay || !video) return;
      const ctx = overlay.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, overlay.width, overlay.height);

      if (!quadSmall) {
        lastQuadRef.current = null;
        setDocumentFound(false);
        return;
      }

      const vidToOverlayX = overlay.width / video.videoWidth;
      const vidToOverlayY = overlay.height / video.videoHeight;
      const orderedSmall = orderPoints(quadSmall);
      const displayPts = orderedSmall.map((p) => ({
        x: (p.x / scale) * vidToOverlayX,
        y: (p.y / scale) * vidToOverlayY,
      }));
      lastQuadRef.current = orderedSmall.map((p) => ({ x: p.x / scale, y: p.y / scale }));

      ctx.strokeStyle = '#D4AF37';
      ctx.lineWidth = 3;
      ctx.fillStyle = 'rgba(166,124,82,0.16)';
      ctx.beginPath();
      ctx.moveTo(displayPts[0].x, displayPts[0].y);
      for (let i = 1; i < 4; i++) ctx.lineTo(displayPts[i].x, displayPts[i].y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      displayPts.forEach((p) => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
        ctx.fillStyle = '#8B6914';
        ctx.fill();
      });
      setDocumentFound(true);
    },
    []
  );

  const resizeOverlay = useCallback(() => {
    const video = videoRef.current;
    const overlay = overlayRef.current;
    if (!video || !overlay) return;
    const rect = video.getBoundingClientRect();
    overlay.width = rect.width;
    overlay.height = rect.height;
  }, []);

  const startDetectionLoop = useCallback(() => {
    const workCanvas = document.createElement('canvas');
    const SCALE_W = 480;
    let frameCount = 0;

    const loop = () => {
      rafRef.current = requestAnimationFrame(loop);
      frameCount++;
      if (frameCount % 3 !== 0) return;
      const video = videoRef.current;
      if (!video || video.videoWidth === 0 || !cvReady) return;

      const scale = SCALE_W / video.videoWidth;
      workCanvas.width = SCALE_W;
      workCanvas.height = video.videoHeight * scale;
      const wctx = workCanvas.getContext('2d');
      if (!wctx) return;
      wctx.drawImage(video, 0, 0, workCanvas.width, workCanvas.height);

      const quad = detectDocumentQuad(workCanvas);
      drawOverlay(quad, scale);
    };
    loop();
  }, [cvReady, detectDocumentQuad, drawOverlay]);

  const stopCamera = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraOn(false);
  }, []);

  const startCamera = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setActionFeedback('المتصفح لا يدعم الكاميرا. جرّب Safari أو Chrome على HTTPS.');
      return;
    }

    setActionFeedback(null);
    setCameraOpening(true);

    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
      } catch (primaryErr) {
        if (
          primaryErr instanceof DOMException &&
          (primaryErr.name === 'OverconstrainedError' || primaryErr.name === 'ConstraintNotSatisfiedError')
        ) {
          stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        } else {
          throw primaryErr;
        }
      }

      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) {
        throw new Error('تعذّر تهيئة معاينة الكاميرا.');
      }

      video.srcObject = stream;
      await video.play();
      resizeOverlay();
      setCameraOn(true);
    } catch (err) {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setCameraOn(false);
      setActionFeedback(mapCameraError(err));
    } finally {
      setCameraOpening(false);
    }
  }, [resizeOverlay]);

  const handleOpenCameraClick = useCallback(() => {
    if (cameraOpening) {
      return;
    }

    if (cvLoading || !cvReady) {
      setActionFeedback('جاري تجهيز محرك المعالجة، يرجى الانتظار قليلاً...');
      return;
    }

    if (cvError) {
      setActionFeedback('تعذّر تحميل محرك المعالجة. اضغط «إعادة المحاولة» ثم حاول فتح الكاميرا.');
      return;
    }

    void startCamera();
  }, [cameraOpening, cvLoading, cvReady, cvError, startCamera]);

  useEffect(() => {
    if (cameraOn && cvReady) {
      startDetectionLoop();
    }
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [cameraOn, cvReady, startDetectionLoop]);

  useEffect(() => {
    if (!cameraOn) return;
    const onResize = () => resizeOverlay();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [cameraOn, resizeOverlay]);

  useEffect(() => () => stopCamera(), [stopCamera]);

  const warpDocument = (srcCanvas: HTMLCanvasElement, corners: Point[]) => {
    const cv = getOpenCvRuntime();
    const src = cv.imread(srcCanvas);
    const [tl, tr, br, bl] = corners;
    const widthTop = Math.hypot(tr.x - tl.x, tr.y - tl.y);
    const widthBottom = Math.hypot(br.x - bl.x, br.y - bl.y);
    const maxWidth = Math.max(widthTop, widthBottom);
    const heightLeft = Math.hypot(bl.x - tl.x, bl.y - tl.y);
    const heightRight = Math.hypot(br.x - tr.x, br.y - tr.y);
    const maxHeight = Math.max(heightLeft, heightRight);

    const srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, [tl.x, tl.y, tr.x, tr.y, br.x, br.y, bl.x, bl.y]);
    const dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, maxWidth, 0, maxWidth, maxHeight, 0, maxHeight]);
    const M = cv.getPerspectiveTransform(srcTri, dstTri);
    const dst = new cv.Mat();
    cv.warpPerspective(src, dst, M, new cv.Size(maxWidth, maxHeight), cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar());

    src.delete();
    srcTri.delete();
    dstTri.delete();
    M.delete();
    return dst;
  };

  const enhanceScan = (mat: { clone: () => unknown }, mode: FilterMode) => {
    const cv = getOpenCvRuntime();
    if (mode === 'original') return mat.clone();

    if (mode === 'bw') {
      const gray = new cv.Mat();
      cv.cvtColor(mat, gray, cv.COLOR_RGBA2GRAY);
      const th = new cv.Mat();
      cv.adaptiveThreshold(gray, th, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY, 25, 15);
      const out = new cv.Mat();
      cv.cvtColor(th, out, cv.COLOR_GRAY2RGBA);
      gray.delete();
      th.delete();
      return out;
    }

    if (mode === 'gray') {
      const gray = new cv.Mat();
      cv.cvtColor(mat, gray, cv.COLOR_RGBA2GRAY);
      const clahe = new cv.CLAHE(2.5, new cv.Size(8, 8));
      const enhanced = new cv.Mat();
      clahe.apply(gray, enhanced);
      const out = new cv.Mat();
      cv.cvtColor(enhanced, out, cv.COLOR_GRAY2RGBA);
      gray.delete();
      enhanced.delete();
      clahe.delete();
      return out;
    }

    const lab = new cv.Mat();
    cv.cvtColor(mat, lab, cv.COLOR_RGBA2RGB);
    cv.cvtColor(lab, lab, cv.COLOR_RGB2Lab);
    const channels = new cv.MatVector();
    cv.split(lab, channels);
    const L = channels.get(0);
    const clahe = new cv.CLAHE(2.0, new cv.Size(8, 8));
    const Lenh = new cv.Mat();
    clahe.apply(L, Lenh);
    channels.set(0, Lenh);
    const merged = new cv.Mat();
    cv.merge(channels, merged);
    const rgbResult = new cv.Mat();
    cv.cvtColor(merged, rgbResult, cv.COLOR_Lab2RGB);
    const blurred = new cv.Mat();
    cv.GaussianBlur(rgbResult, blurred, new cv.Size(0, 0), 3);
    const sharp = new cv.Mat();
    cv.addWeighted(rgbResult, 1.5, blurred, -0.5, 0, sharp);
    const out = new cv.Mat();
    cv.cvtColor(sharp, out, cv.COLOR_RGB2RGBA);

    lab.delete();
    L.delete();
    Lenh.delete();
    merged.delete();
    rgbResult.delete();
    blurred.delete();
    sharp.delete();
    clahe.delete();
    channels.delete();
    return out;
  };

  const processAndShow = useCallback((mode: FilterMode) => {
    const cv = getOpenCvRuntime();
    if (!warpedMatRef.current || !sourceCanvasRef.current || !capturedCornersRef.current) return;
    const enhanced = enhanceScan(warpedMatRef.current as { clone: () => unknown }, mode) as { delete: () => void };
    if (resultCanvasRef.current) {
      cv.imshow(resultCanvasRef.current, enhanced);
    }
    enhanced.delete();
  }, []);

  useEffect(() => {
    if (!resultVisible || !warpedMatRef.current) return;

    const frameId = requestAnimationFrame(() => {
      if (resultCanvasRef.current) {
        processAndShow(activeFilter);
      }
    });

    return () => cancelAnimationFrame(frameId);
  }, [resultVisible, activeFilter, processAndShow]);

  const capturePhoto = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    const fullCanvas = document.createElement('canvas');
    fullCanvas.width = video.videoWidth;
    fullCanvas.height = video.videoHeight;
    fullCanvas.getContext('2d')?.drawImage(video, 0, 0);

    let corners = lastQuadRef.current;
    if (!corners) {
      const w = fullCanvas.width;
      const h = fullCanvas.height;
      corners = [
        { x: w * 0.05, y: h * 0.05 },
        { x: w * 0.95, y: h * 0.05 },
        { x: w * 0.95, y: h * 0.95 },
        { x: w * 0.05, y: h * 0.95 },
      ];
    }

    capturedCornersRef.current = corners;
    sourceCanvasRef.current = fullCanvas;
    warpedMatRef.current = warpDocument(fullCanvas, corners);

    stopCamera();
    setActiveFilter('original');
    setResultVisible(true);
  }, [stopCamera]);

  const handleFilterChange = (mode: FilterMode) => {
    setActiveFilter(mode);
  };

  const handleRetake = () => {
    const mat = warpedMatRef.current as { delete?: () => void } | null;
    mat?.delete?.();
    warpedMatRef.current = null;
    setActiveFilter('original');
    setResultVisible(false);
    void startCamera();
  };

  const handleSave = () => {
    const canvas = resultCanvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL('image/png');
    if (onCapture) {
      onCapture(dataUrl);
    } else {
      const link = document.createElement('a');
      link.download = `scanned-document-${Date.now()}.png`;
      link.href = dataUrl;
      link.click();
    }
  };

  return (
    <div className={`relative flex min-h-0 flex-1 flex-col bg-mistara-sand text-mistara-espresso ${className}`}>
      {/* حاوية الفيديو دائماً في DOM — مخفية قبل فتح الكاميرا لضمان videoRef */}
      <div
        className={
          cameraOn
            ? 'relative flex min-h-0 flex-1 flex-col'
            : 'pointer-events-none fixed left-0 top-0 z-[-1] h-px w-px overflow-hidden opacity-0'
        }
        aria-hidden={!cameraOn}
      >
        <div className="relative min-h-0 flex-1 overflow-hidden bg-black">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="absolute inset-0 z-0 h-full w-full object-cover"
          />
          {cameraOn && (
            <>
              <canvas
                ref={overlayRef}
                className="pointer-events-none absolute inset-0 z-10 h-full w-full"
              />
              <span
                className={`absolute left-1/2 top-4 z-20 -translate-x-1/2 rounded-full border px-4 py-2 text-xs font-bold backdrop-blur-md ${
                  documentFound
                    ? 'border-mistara-gold/45 bg-mistara-gold/12 text-mistara-warm'
                    : 'border-mistara-gold/30 bg-mistara-beige/70 text-mistara-gold-light'
                }`}
              >
                {documentFound ? 'تم العثور على المستند ✓' : 'جاري البحث عن المستند...'}
              </span>
            </>
          )}
        </div>

        {cameraOn && (
          <div className="flex shrink-0 justify-center bg-gradient-to-t from-black/90 to-transparent px-6 pb-8 pt-4">
            <button
              type="button"
              aria-label="التقاط المستند"
              onClick={capturePhoto}
              className={`h-20 w-20 rounded-full border-[6px] shadow-[0_0_30px_rgba(166,124,82,0.4)] transition-transform active:scale-95 ${
                documentFound ? 'border-mistara-gold bg-white' : 'border-mistara-gold bg-white/95'
              }`}
            />
          </div>
        )}
      </div>

      {!cameraOn && !resultVisible && (
        <div className="flex flex-1 flex-col items-center justify-center gap-5 px-6 py-10 text-center">
          <div className="w-full max-w-sm space-y-4 rounded-3xl border border-mistara-gold/30 glass-panel p-6 shadow-2xl backdrop-blur-md">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-mistara-gold/12 ring-4 ring-mistara-gold/25">
              <span className="text-3xl" aria-hidden>
                📄
              </span>
            </div>
            <h2 className="text-lg font-black text-mistara-gold">ماسح المستندات</h2>
            <p className="text-sm leading-relaxed text-mistara-brown/80">
              وجّه الكاميرا نحو المستند. عند ظهور الإطار السماوي اضغط زر الالتقاط.
            </p>
            {cvLoading && !cvError && (
              <p className="text-xs font-bold text-mistara-brown/70">
                {cvSlow
                  ? 'ما زال التحميل جارياً — الملف كبير (~10MB) وقد يستغرق دقيقة على شبكة بطيئة...'
                  : 'جاري تحميل محرك OpenCV.js...'}
              </p>
            )}
            {cvError && (
              <div
                role="alert"
                className="space-y-2 rounded-xl border border-red-800/35 bg-red-800/8 px-3 py-2 text-xs font-bold text-red-700"
              >
                <p>{cvError}</p>
                <button
                  type="button"
                  onClick={() => beginOpenCvLoad(true)}
                  className="w-full rounded-lg bg-mistara-gold/15 py-2 text-mistara-warm transition-colors hover:bg-mistara-gold/20"
                >
                  إعادة المحاولة
                </button>
              </div>
            )}
            {actionFeedback && (
              <p role="status" className="rounded-xl border border-mistara-gold/35 bg-mistara-gold/10 px-3 py-2 text-xs font-bold text-mistara-warm">
                {actionFeedback}
              </p>
            )}
            <div className="flex flex-col gap-2 pt-1">
              <button
                type="button"
                disabled={cameraOpening}
                onClick={handleOpenCameraClick}
                className="w-full rounded-2xl bg-gradient-to-r from-mistara-gold to-mistara-gold-light py-3.5 text-sm font-black text-mistara-cream shadow-lg shadow-mistara-gold/20 disabled:cursor-not-allowed disabled:opacity-60 active:scale-[0.98] transition-transform"
              >
                {cameraOpening
                  ? 'جاري فتح الكاميرا...'
                  : cvLoading
                    ? 'جاري تجهيز محرك المعالجة...'
                    : 'فتح الكاميرا'}
              </button>
              {onClose && (
                <button
                  type="button"
                  onClick={onClose}
                  className="w-full rounded-2xl border border-mistara-brown/20 bg-mistara-cream py-3 text-sm font-bold text-mistara-brown"
                >
                  إلغاء
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {resultVisible && (
        <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 py-5">
          <div className="rounded-2xl border border-mistara-gold/30 glass-panel p-3 shadow-xl backdrop-blur-md">
            <canvas ref={resultCanvasRef} className="mx-auto max-h-[52vh] w-auto max-w-full rounded-xl bg-white object-contain" />
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {(['original', 'color', 'gray', 'bw'] as FilterMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => handleFilterChange(mode)}
                className={`rounded-xl border px-2 py-2.5 text-xs font-bold transition-colors ${
                  activeFilter === mode
                    ? 'border-mistara-gold/50 bg-mistara-gold/15 text-mistara-gold-light'
                    : 'border-mistara-brown/20 bg-mistara-cream/80 text-mistara-brown/80 hover:border-mistara-brown/25'
                }`}
              >
                {FILTER_LABELS[mode]}
              </button>
            ))}
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleRetake}
              className="flex-1 rounded-2xl border border-mistara-brown/20 bg-mistara-cream py-3 text-sm font-bold text-mistara-brown"
            >
              إعادة الالتقاط
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="flex-1 rounded-2xl bg-gradient-to-r from-mistara-gold to-mistara-gold-dark py-3 text-sm font-black text-mistara-cream shadow-lg shadow-mistara-gold/20"
            >
              حفظ ورفع الفاتورة
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
