import { NextResponse } from 'next/server';
import { listActivePlans } from '@/lib/subscription-server';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const plans = await listActivePlans();
    return NextResponse.json(
      { ok: true, plans },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
        },
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'تعذّر جلب الباقات.';
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
