'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  firebaseSignOut,
  isFirebaseConfigured,
  subscribeFirebaseAuth,
} from '@/lib/firebase-auth-client';
import { isEmailVerifiedUser } from '@/lib/auth-confirmation-guard';
import { useIdleLogout } from '@/lib/use-idle-logout';
import type { AppUser, AuthFeedback } from '@/lib/home/types';

type UseAppSessionOptions = {
  onSessionCleared: () => void;
};

export function useAppSession({ onSessionCleared }: UseAppSessionOptions) {
  const [user, setUser] = useState<AppUser | null>(
    isFirebaseConfigured() ? null : { id: 'guest-local-user', email: 'guest@mistarh.local' }
  );
  const [loading, setLoading] = useState(false);
  const [authBootstrapping, setAuthBootstrapping] = useState(false);
  const [sessionCheckPending, setSessionCheckPending] = useState(() => isFirebaseConfigured());
  const [showWelcomeSuccess, setShowWelcomeSuccess] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [authFeedback, setAuthFeedback] = useState<AuthFeedback>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isFirebaseConfigured()) {
      setLoading(false);
      setAuthBootstrapping(false);
      setSessionCheckPending(false);
      return;
    }

    let cancelled = false;

    const unsubscribe = subscribeFirebaseAuth((currentUser) => {
      if (cancelled) return;

      if (currentUser && !isEmailVerifiedUser(currentUser)) {
        if (process.env.NODE_ENV === 'development') {
          console.warn('[auth bootstrap] session found but email not verified — signing out');
        }
        setUser(null);
        onSessionCleared();
        setLoading(false);
        setAuthBootstrapping(false);
        setSessionCheckPending(false);
        window.setTimeout(() => {
          void firebaseSignOut().catch(() => undefined);
        }, 0);
        return;
      }

      setUser(currentUser);
      if (!currentUser) {
        onSessionCleared();
        setLoading(false);
        setAuthBootstrapping(false);
        setSessionCheckPending(false);
      }
      setAuthBootstrapping(false);
      setLoading(false);
      setSessionCheckPending(false);
    });

    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      cancelled = true;
      unsubscribe();
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onSessionCleared]);

  useEffect(() => {
    if (!showWelcomeSuccess) return;
    const timer = window.setTimeout(() => setShowWelcomeSuccess(false), 2200);
    return () => window.clearTimeout(timer);
  }, [showWelcomeSuccess]);

  const performLogout = useCallback(
    async (idleReason?: boolean) => {
      if (isFirebaseConfigured()) {
        await firebaseSignOut();
      }
      setUser(null);
      onSessionCleared();
      setShowMenu(false);
      if (idleReason) {
        setAuthFeedback({
          type: 'error',
          message: 'انتهت الجلسة لعدم النشاط (5 دقائق). يرجى تسجيل الدخول مجدداً.',
        });
      }
    },
    [onSessionCleared]
  );

  useIdleLogout(Boolean(user && isFirebaseConfigured()), () => {
    void performLogout(true);
  });

  const enterGuestMode = useCallback(() => {
    setUser({ id: 'guest-local-user', email: 'guest@mistarh.local' });
  }, []);

  return {
    user,
    setUser,
    loading,
    setLoading,
    authBootstrapping,
    sessionCheckPending,
    showWelcomeSuccess,
    setShowWelcomeSuccess,
    showMenu,
    setShowMenu,
    menuRef,
    authFeedback,
    setAuthFeedback,
    performLogout,
    enterGuestMode,
  };
}
