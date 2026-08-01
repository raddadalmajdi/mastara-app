import { createSupabaseAdminClient } from '@/lib/delete-auth-user-admin';

/** يبحث عن مستخدم Auth بالبريد (Admin API — للاستخدام على الخادم فقط). */
export async function findAuthUserByEmail(
  email: string
): Promise<{ id: string; email?: string } | null> {
  const admin = createSupabaseAdminClient();
  const normalized = email.trim().toLowerCase();

  if (!normalized) {
    return null;
  }

  let page = 1;
  const perPage = 200;

  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) {
      throw error;
    }

    const matched =
      data.users.find((user) => user.email?.trim().toLowerCase() === normalized) ?? null;

    if (matched) {
      return { id: matched.id, email: matched.email ?? undefined };
    }

    if (data.users.length < perPage) {
      break;
    }
    page += 1;
  }

  return null;
}

export const DUPLICATE_EMAIL_MESSAGE =
  'هذا البريد الإلكتروني مسجل مسبقاً، يرجى استخدام بريد آخر أو تسجيل الدخول.';

export function isDuplicateEmailMessage(message: string): boolean {
  return message === DUPLICATE_EMAIL_MESSAGE || message.includes('مسجل مسبقاً');
}
