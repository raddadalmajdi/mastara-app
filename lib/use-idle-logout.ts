'use client';

import { useEffect, useRef } from 'react';

const IDLE_MS = 5 * 60 * 1000;

const ACTIVITY_EVENTS: (keyof WindowEventMap)[] = [
  'pointerdown',
  'keydown',
  'touchstart',
  'scroll',
  'mousemove',
];

/** يسجّل خروجاً تلقائياً بعد 5 دقائق بدون أي تفاعل. */
export function useIdleLogout(enabled: boolean, onIdle: () => void) {
  const timerRef = useRef<number | null>(null);
  const onIdleRef = useRef(onIdle);
  onIdleRef.current = onIdle;

  useEffect(() => {
    if (!enabled) return;

    const reset = () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
      timerRef.current = window.setTimeout(() => {
        onIdleRef.current();
      }, IDLE_MS);
    };

    reset();
    for (const ev of ACTIVITY_EVENTS) {
      window.addEventListener(ev, reset, { passive: true });
    }
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') reset();
    });

    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      for (const ev of ACTIVITY_EVENTS) {
        window.removeEventListener(ev, reset);
      }
    };
  }, [enabled]);
}
