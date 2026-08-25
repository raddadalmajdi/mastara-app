import { getFirebaseAdminAuth, getFirebaseAdminFirestore } from '@/lib/firebase-admin';

export type FirebaseAuthUser = {
  id: string;
  email?: string | null;
  emailVerified?: boolean;
};

export async function getUserFromBearerToken(
  request: Request
): Promise<FirebaseAuthUser | null> {
  const header = request.headers.get('authorization') ?? '';
  const token = header.replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;

  try {
    const decoded = await getFirebaseAdminAuth().verifyIdToken(token);
    const user = await getFirebaseAdminAuth().getUser(decoded.uid);
    return {
      id: user.uid,
      email: user.email ?? null,
      emailVerified: user.emailVerified,
    };
  } catch {
    return null;
  }
}

export async function assertUserOrganizationAccess(
  userId: string,
  organizationId: string
): Promise<{ role: 'owner' | 'member' }> {
  const db = getFirebaseAdminFirestore();
  const snap = await db
    .collection('organization_members')
    .where('user_id', '==', userId)
    .where('organization_id', '==', organizationId)
    .limit(1)
    .get();

  if (snap.empty) {
    throw new Error('FORBIDDEN_ORG');
  }

  const role = (snap.docs[0]?.data()?.role as 'owner' | 'member') ?? 'member';
  return { role };
}

export async function requireBillingOwner(
  userId: string,
  organizationId: string
): Promise<void> {
  const access = await assertUserOrganizationAccess(userId, organizationId);
  if (access.role !== 'owner') {
    throw new Error('FORBIDDEN_NOT_OWNER');
  }
}
