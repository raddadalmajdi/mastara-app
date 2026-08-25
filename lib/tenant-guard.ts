import { getFirebaseAuthClient } from '@/lib/firebase';

export async function assertAuthenticatedUserId(expectedUserId: string): Promise<string> {
  const auth = getFirebaseAuthClient();
  const user = auth.currentUser;
  if (!user) {
    throw new Error('يجب تسجيل الدخول للوصول إلى بيانات المحل.');
  }
  if (user.uid !== expectedUserId) {
    throw new Error('لا يمكن الوصول إلا إلى بيانات المحل الحالي.');
  }
  await user.getIdToken(true);
  return user.uid;
}

export function assertOrganizationScope(
  organizationId: string | null | undefined,
  allowedOrganizationId: string | null | undefined
): void {
  const requested = organizationId?.trim() || null;
  const allowed = allowedOrganizationId?.trim() || null;

  if (!requested) return;

  if (!allowed || requested !== allowed) {
    throw new Error('لا يمكن الوصول إلى بيانات منظمة أخرى.');
  }
}
