'use client';

import { collection, doc, getDoc, getDocs, limit, query, where } from 'firebase/firestore';
import type { OrganizationContext, OrganizationRecord } from '@/lib/organization';
import { getFirebaseFirestoreClient, isFirebaseConfigured } from '@/lib/firebase';

function mapOrganizationDoc(id: string, data: Record<string, unknown>): OrganizationRecord {
  return {
    id,
    name: String(data.name ?? ''),
    slug: String(data.slug ?? ''),
    owner_id: String(data.owner_id ?? ''),
    created_at: data.created_at != null ? String(data.created_at) : undefined,
    updated_at: data.updated_at != null ? String(data.updated_at) : undefined,
  };
}

/** يجلب سياق المنظمة النشطة للمستخدم (Firestore client). */
export async function fetchOrganizationContextForUser(
  userId: string
): Promise<OrganizationContext | null> {
  if (!isFirebaseConfigured()) return null;

  const db = getFirebaseFirestoreClient();
  const memberQuery = query(
    collection(db, 'organization_members'),
    where('user_id', '==', userId),
    limit(1)
  );
  const memberSnap = await getDocs(memberQuery);
  if (memberSnap.empty) return null;

  const memberDoc = memberSnap.docs[0]!;
  const memberData = memberDoc.data();
  const organizationId = String(memberData.organization_id ?? '');
  if (!organizationId) return null;

  const orgSnap = await getDoc(doc(db, 'organizations', organizationId));
  if (!orgSnap.exists()) return null;

  const organization = mapOrganizationDoc(orgSnap.id, orgSnap.data() as Record<string, unknown>);

  return {
    organizationId,
    role: (memberData.role as OrganizationContext['role']) ?? 'owner',
    organization,
  };
}
