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
import type { SupabaseClient, User } from '@supabase/supabase-js';
import type { OrganizationContext } from '@/lib/organization';
import { fetchOrganizationContextForUser } from '@/lib/organization-server';
import {
  diagnoseSupabasePublicConfig,
  formatSupabaseConfigIssues,
} from '@/lib/supabase/env';
import { getSupabaseBrowserClient, isSupabaseConfigured } from '@/lib/supabase-browser';

type OrganizationProviderState = {
  organizationId: string | null;
  organization: OrganizationContext['organization'] | null;
  role: OrganizationContext['role'] | null;
  loading: boolean;
  refreshOrganization: () => Promise<void>;
};

const OrganizationContextReact = createContext<OrganizationProviderState | null>(null);

async function ensureOrganizationViaApi(
  supabase: SupabaseClient,
  user: User
): Promise<OrganizationContext | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    return null;
  }

  const response = await fetch('/api/auth/ensure-organization', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    credentials: 'include',
    body: JSON.stringify({
      userId: user.id,
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

async function loadOrganizationForUser(
  supabase: SupabaseClient,
  user: User
): Promise<OrganizationContext | null> {
  let context = await fetchOrganizationContextForUser(supabase, user.id);
  if (context) return context;

  return ensureOrganizationViaApi(supabase, user);
}

export function OrganizationProvider({ children }: { children: ReactNode }) {
  const supabase = useMemo(() => (isSupabaseConfigured() ? getSupabaseBrowserClient() : null), []);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [organization, setOrganization] = useState<OrganizationContext['organization'] | null>(null);
  const [role, setRole] = useState<OrganizationContext['role'] | null>(null);
  const [loading, setLoading] = useState(Boolean(supabase));

  const applyContext = useCallback((ctx: OrganizationContext | null) => {
    setOrganizationId(ctx?.organizationId ?? null);
    setOrganization(ctx?.organization ?? null);
    setRole(ctx?.role ?? null);
  }, []);

  const refreshOrganization = useCallback(async () => {
    if (!supabase) {
      applyContext(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        applyContext(null);
        return;
      }

      const ctx = await loadOrganizationForUser(supabase, user);
      applyContext(ctx);
    } catch (error) {
      console.warn('[OrganizationProvider] refresh failed', error);
      applyContext(null);
    } finally {
      setLoading(false);
    }
  }, [applyContext, supabase]);

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      const diagnostic = diagnoseSupabasePublicConfig();
      console.error(
        '[OrganizationProvider] Supabase not configured:',
        formatSupabaseConfigIssues(diagnostic.issues)
      );
      setLoading(false);
      return;
    }

    if (!supabase) {
      setLoading(false);
      return;
    }

    void refreshOrganization();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        applyContext(null);
        setLoading(false);
        return;
      }

      if (session?.user && (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED')) {
        void loadOrganizationForUser(supabase, session.user)
          .then(applyContext)
          .catch(() => applyContext(null))
          .finally(() => setLoading(false));
      }
    });

    return () => subscription.unsubscribe();
  }, [applyContext, refreshOrganization, supabase]);

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

/** آمن خارج المزوّد — يُرجع null بدل رمي خطأ. */
export function useOrganizationOptional(): OrganizationProviderState | null {
  return useContext(OrganizationContextReact);
}
