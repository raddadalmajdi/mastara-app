import { getFirebaseAdminFirestore } from '@/lib/firebase-admin';
import {
  buildOrganizationSlug,
  defaultOrganizationNameFromEmail,
  type OrganizationContext,
  type OrganizationRecord,
} from '@/lib/organization';
import { ensureStarterSubscription } from '@/lib/subscription-server';

export type EnsureOrganizationResult =
  | { ok: true; organizationId: string; created: boolean }
  | { ok: false; message: string };

function mapOrganizationDoc(id: string, data: FirebaseFirestore.DocumentData): OrganizationRecord {
  return {
    id,
    name: String(data.name ?? ''),
    slug: String(data.slug ?? ''),
    owner_id: String(data.owner_id ?? ''),
    created_at: data.created_at != null ? String(data.created_at) : undefined,
    updated_at: data.updated_at != null ? String(data.updated_at) : undefined,
  };
}

async function findExistingMembership(
  userId: string
): Promise<{ organizationId: string; role: 'owner' | 'member' } | null> {
  const db = getFirebaseAdminFirestore();
  const snap = await db
    .collection('organization_members')
    .where('user_id', '==', userId)
    .limit(1)
    .get();

  if (snap.empty) return null;

  const doc = snap.docs[0]!;
  const data = doc.data();
  return {
    organizationId: String(data.organization_id ?? ''),
    role: (data.role as 'owner' | 'member') ?? 'owner',
  };
}

async function insertOrganizationWithRetry(params: {
  userId: string;
  email: string;
  shopName?: string;
}): Promise<string> {
  const db = getFirebaseAdminFirestore();
  const baseName = params.shopName?.trim() || defaultOrganizationNameFromEmail(params.email);
  let slug = buildOrganizationSlug(params.email, params.userId);
  const now = new Date().toISOString();

  for (let attempt = 0; attempt < 5; attempt++) {
    const slugSnap = await db.collection('organizations').where('slug', '==', slug).limit(1).get();
    if (!slugSnap.empty) {
      slug = `${buildOrganizationSlug(params.email, params.userId)}-${attempt + 2}`;
      continue;
    }

    const orgRef = db.collection('organizations').doc();
    const orgId = orgRef.id;

    await orgRef.set({
      name: baseName,
      slug,
      owner_id: params.userId,
      created_at: now,
      updated_at: now,
    });

    await db.collection('organization_members').add({
      organization_id: orgId,
      user_id: params.userId,
      role: 'owner',
      created_at: now,
    });

    return orgId;
  }

  throw new Error('تعذّر إنشاء slug فريد للمنظمة.');
}

/** ينشئ منظمة للمستخدم الجديد أو يُرجع الموجودة (idempotent). */
export async function getOrCreateOrganizationForUser(params: {
  userId: string;
  email: string;
  shopName?: string;
}): Promise<EnsureOrganizationResult> {
  const userId = params.userId.trim();
  const email = params.email.trim().toLowerCase();

  if (!userId || !email) {
    return { ok: false, message: 'userId و email مطلوبان لإنشاء المنظمة.' };
  }

  try {
    const existing = await findExistingMembership(userId);
    if (existing?.organizationId) {
      await ensureStarterSubscription(existing.organizationId).catch(() => undefined);
      return { ok: true, organizationId: existing.organizationId, created: false };
    }

    const organizationId = await insertOrganizationWithRetry({
      userId,
      email,
      shopName: params.shopName,
    });

    await ensureStarterSubscription(organizationId).catch(() => undefined);

    return { ok: true, organizationId, created: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'تعذّر إعداد المنظمة.';
    console.error('[organization-server] getOrCreateOrganizationForUser failed', {
      userId,
      email,
      message,
    });
    return { ok: false, message };
  }
}

/** يجلب سياق المنظمة النشطة للمستخدم (Admin SDK — للخادم). */
export async function fetchOrganizationContextForUser(
  userId: string
): Promise<OrganizationContext | null> {
  const db = getFirebaseAdminFirestore();
  const memberSnap = await db
    .collection('organization_members')
    .where('user_id', '==', userId)
    .limit(1)
    .get();

  if (memberSnap.empty) return null;

  const memberDoc = memberSnap.docs[0]!;
  const memberData = memberDoc.data();
  const organizationId = String(memberData.organization_id ?? '');
  if (!organizationId) return null;

  const orgSnap = await db.collection('organizations').doc(organizationId).get();
  if (!orgSnap.exists) return null;

  const organization = mapOrganizationDoc(orgSnap.id, orgSnap.data()!);

  return {
    organizationId,
    role: (memberData.role as OrganizationContext['role']) ?? 'owner',
    organization,
  };
}

/** يُحدّث organization_id على tailor_profiles إن وُجد. */
export async function backfillTailorProfileOrganizationId(
  userId: string,
  organizationId: string
): Promise<void> {
  const db = getFirebaseAdminFirestore();
  const ref = db.collection('tailor_profiles').doc(userId);
  const snap = await ref.get();
  if (!snap.exists) return;

  const data = snap.data();
  if (data?.organization_id) return;

  await ref.set({ organization_id: organizationId, updated_at: new Date().toISOString() }, { merge: true });
}
