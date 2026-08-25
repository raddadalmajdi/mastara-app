import { NextResponse } from 'next/server';
import { getUserFromBearerToken } from '@/lib/billing-auth-server';
import {
  backfillTailorProfileOrganizationId,
  fetchOrganizationContextForUser,
  getOrCreateOrganizationForUser,
} from '@/lib/organization-server';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const user = await getUserFromBearerToken(request);
  if (!user?.email) {
    return NextResponse.json(
      { ok: false, code: 'unauthorized', message: 'يجب تسجيل الدخول.' },
      { status: 401 }
    );
  }

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

  if (user.id !== userId || user.email.toLowerCase() !== email) {
    return NextResponse.json(
      { ok: false, code: 'forbidden', message: 'غير مصرّح.' },
      { status: 403 }
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

    if (ensured.created) {
      await backfillTailorProfileOrganizationId(userId, ensured.organizationId);
    }

    const context = await fetchOrganizationContextForUser(userId);

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
