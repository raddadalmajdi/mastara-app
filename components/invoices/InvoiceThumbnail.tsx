'use client';

import { memo, useState } from 'react';

type InvoiceThumbnailProps = {
  src: string;
  alt: string;
  className?: string;
  /** معاينة كبيرة — تُحمَّل فوراً */
  priority?: boolean;
};

/** صورة فاتورة مع تحميل كسول وتجنّب layout shift. */
export const InvoiceThumbnail = memo(function InvoiceThumbnail({
  src,
  alt,
  className = '',
  priority = false,
}: InvoiceThumbnailProps) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div
        className={`flex items-center justify-center bg-mistara-cream/80 text-xs font-bold text-mistara-brown/70 ${className}`}
      >
        تعذّر تحميل المعاينة
      </div>
    );
  }

  return (
    <>
      {!loaded && (
        <div
          className={`absolute inset-0 animate-pulse bg-mistara-brown/10 ${className.includes('absolute') ? '' : 'rounded-inherit'}`}
          aria-hidden
        />
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        loading={priority ? 'eager' : 'lazy'}
        decoding="async"
        fetchPriority={priority ? 'high' : 'low'}
        onLoad={() => setLoaded(true)}
        onError={() => setFailed(true)}
        className={`${className} ${loaded ? 'opacity-100' : 'opacity-0'} transition-opacity duration-200`}
      />
    </>
  );
});
