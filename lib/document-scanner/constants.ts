/** إعدادات مشتركة لخط أنابيب ماسح OpenCV (التقاط → JPEG/PDF). */

/** أعلى بُعد للمستند النهائي — يُوازَن مع STORAGE_JPEG_MAX_DIMENSION للتخزين. */
export const MAX_OUTPUT_DIMENSION = 2000;

/** جودة ضغط JPEG للمعاينة والرفع. */
export const SCAN_JPEG_QUALITY = 0.92;

/** جودة JPEG داخل PDF — أقل قليلاً لتقليل تكلفة التخزين مع وضوح مقروء. */
export const PDF_FALLBACK_JPEG_QUALITY = 0.78;
