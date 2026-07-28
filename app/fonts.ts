import { Cairo } from 'next/font/google';

/**
 * خط "Cairo" — خط عربي/لاتيني عصري ونظيف (متعدد الأوزان، Variable Font) يوفّر
 * وضوحاً ممتازاً للعناوين والنصوص الأساسية بالعربية، مع أرقام لاتينية أنيقة
 * تُستخدم في التواريخ والمبالغ والعدادات. يُحمَّل ذاتياً عبر next/font/google
 * (بدون طلبات خارجية من المتصفح) ويُطبَّق عالمياً عبر متغير CSS في app/layout.tsx.
 */
export const cairo = Cairo({
  subsets: ['arabic', 'latin'],
  variable: '--font-cairo',
  display: 'swap',
});
