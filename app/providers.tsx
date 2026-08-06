'use client';

import { OrganizationProvider } from '@/components/organization/OrganizationProvider';

export function AppProviders({ children }: { children: React.ReactNode }) {
  return <OrganizationProvider>{children}</OrganizationProvider>;
}
