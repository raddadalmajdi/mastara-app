'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { User } from 'firebase/auth';
import type { OrganizationContext } from '@/lib/organization';
import { fetchOrganizationContextForUser } from '@/lib/organization-client';
import {
  getFirebaseAuth,
  getFirebaseIdToken,
  isFirebaseConfigured,
  subscribeFirebaseAuth,
} from '@/lib/firebase-auth-client';

type OrganizationProviderState = {
  organizationId: string | null;
  organization: OrganizationContext['organization'] | null;
  role: OrganizationContext['role'] | null;
  loading: boolean;
  refreshOrganization: () => Promise<void>;
};

const OrganizationContextReact = createContext<OrganizationProviderState | null>(null);

async function ensureOrganizationViaApi(user: User): Promise<OrganizationContext | null> {
  const token = await getFirebaseIdToken();
  if (!token) return null;

  const response = await fetch('/api/auth/ensure-organization', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    credentials: 'include',
    body: JSON.stringify({
      userId: user.uid,
      email: user.email ?? '',
    }),
  });

  if (!response.ok) {
    console.warn('[OrganizationProvider] ensure-organization API failed', {
      status: response.status,
    });
    return null;
  }

  const payload = (await response.json()) as {
    ok?: boolean;
    organizationId?: string;
    organization?: OrganizationContext['organization'];
    role?: OrganizationContext['role'];
  };

  if (!payload.ok || !payload.organizationId || !payload.organization) {
    return null;
  }

  return {
    organizationId: payload.organizationId,
    organization: payload.organization,
    role: payload.role ?? 'owner',
  };
}

async function loadOrganizationForUser(user: User): Promise<OrganizationContext | null> {
  let context = await fetchOrganizationContextForUser(user.uid);
  if (context) return context;

  return ensureOrganizationViaApi(user);
}

export function OrganizationProvider({ children }: { children: ReactNode }) {
  const firebaseReady = useMemo(() => isFirebaseConfigured(), []);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [organization, setOrganization] = useState<OrganizationContext['organization'] | null>(null);
  const [role, setRole] = useState<OrganizationContext['role'] | null>(null);
  const [loading, setLoading] = useState(Boolean(firebaseReady));

  const applyContext = useCallback((ctx: OrganizationContext | null) => {
    setOrganizationId(ctx?.organizationId ?? null);
    setOrganization(ctx?.organization ?? null);
    setRole(ctx?.role ?? null);
  }, []);

  const refreshOrganization = useCallback(async () => {
    if (!firebaseReady) {
      applyContext(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const authUser = getFirebaseAuth()?.currentUser ?? null;

      if (!authUser) {
        applyContext(null);
        return;
      }

      const ctx = await loadOrganizationForUser(authUser);
      applyContext(ctx);
    } catch (error) {
      console.warn('[OrganizationProvider] refresh failed', error);
      applyContext(null);
    } finally {
      setLoading(false);
    }
  }, [applyContext, firebaseReady]);

  useEffect(() => {
    if (!firebaseReady) {
      setLoading(false);
      return;
    }

    void refreshOrganization();

    const unsubscribe = subscribeFirebaseAuth((user) => {
      if (!user) {
        applyContext(null);
        setLoading(false);
        return;
      }

      void loadOrganizationForUser(user)
        .then(applyContext)
        .catch(() => applyContext(null))
        .finally(() => setLoading(false));
    });

    return () => unsubscribe();
  }, [applyContext, firebaseReady, refreshOrganization]);

  const value = useMemo(
    () => ({
      organizationId,
      organization,
      role,
      loading,
      refreshOrganization,
    }),
    [organization, organizationId, loading, refreshOrganization, role]
  );

  return (
    <OrganizationContextReact.Provider value={value}>{children}</OrganizationContextReact.Provider>
  );
}

export function useOrganization(): OrganizationProviderState {
  const ctx = useContext(OrganizationContextReact);
  if (!ctx) {
    throw new Error('useOrganization must be used within OrganizationProvider');
  }
  return ctx;
}

export function useOrganizationOptional(): OrganizationProviderState | null {
  return useContext(OrganizationContextReact);
}
