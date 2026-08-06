export type OrganizationRecord = {
  id: string;
  name: string;
  slug: string;
  owner_id: string;
  created_at?: string;
  updated_at?: string;
};

export type OrganizationMemberRecord = {
  id: string;
  organization_id: string;
  user_id: string;
  role: 'owner' | 'member';
};

export type OrganizationContext = {
  organizationId: string;
  organization: OrganizationRecord;
  role: OrganizationMemberRecord['role'];
};

/** يستخرج جزء البريد قبل @ لاستخدامه في الاسم الافتراضي. */
export function defaultOrganizationNameFromEmail(email: string): string {
  const local = email.trim().toLowerCase().split('@')[0] ?? 'shop';
  const cleaned = local.replace(/[^a-z0-9\u0600-\u06FF]+/gi, ' ').trim();
  if (!cleaned) return 'محل جديد';
  return `محل ${cleaned}`;
}

/** يُولّد slug URL-safe من البريد أو الاسم. */
export function slugifyOrganizationSeed(seed: string): string {
  const base = seed
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);

  return base || 'shop';
}

export function buildOrganizationSlug(email: string, userId: string): string {
  const fromEmail = slugifyOrganizationSeed(email.split('@')[0] ?? 'shop');
  const suffix = userId.replace(/-/g, '').slice(0, 8);
  return `${fromEmail}-${suffix}`;
}

export function isMissingOrganizationColumn(message: string, column = 'organization_id'): boolean {
  const msg = message.toLowerCase();
  const col = column.toLowerCase();
  return msg.includes(col) || (msg.includes('column') && msg.includes('organization'));
}
