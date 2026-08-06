import { NextResponse } from 'next/server';
import {
  backfillTailorProfileOrganizationId,
  fetchOrganizationContextForUser,
  getOrCreateOrganizationForUser,
} from '@/lib/organization-server';
import { createSupabaseAdminClient } from '@/lib/delete-auth-user-admin';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  let body: { userId?: string; email?: string; shopName?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { ok: false, code: 'invalid_json', message: 'طلب غير صالح.' },
      { status: 400 }
    );
  }

  const userId = body.userId?.trim() ?? '';
  const email = body.email?.trim().toLowerCase() ?? '';
  const shopName = body.shopName?.trim();

  if (!userId || !email) {
    return NextResponse.json(
      { ok: false, code: 'validation', message: 'userId و email مطلوبان.' },
      { status: 400 }
    );
  }

  try {
    const ensured = await getOrCreateOrganizationForUser({ userId, email, shopName });
    if (!ensured.ok) {
      return NextResponse.json(
        { ok: false, code: 'organization_failed', message: ensured.message },
        { status: 500 }
      );
    }

    const admin = createSupabaseAdminClient();

    if (ensured.created) {
      await backfillTailorProfileOrganizationId(admin, userId, ensured.organizationId);
    }

    const context = await fetchOrganizationContextForUser(admin, userId);

    if (!context) {
      return NextResponse.json(
        { ok: false, code: 'organization_not_found', message: 'تعذّر جلب المنظمة بعد الإنشاء.' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      organizationId: context.organizationId,
      organization: context.organization,
      role: context.role,
      created: ensured.created,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'خطأ داخلي أثناء إعداد المنظمة.';
    console.error('[api/auth/ensure-organization]', message);
    return NextResponse.json(
      { ok: false, code: 'internal_error', message },
      { status: 500 }
    );
  }
}
