import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/supabase/server';

const Inputs = z.object({
  openingCash: z.number().nonnegative(),
  monthlyRevenue: z.number().nonnegative(),
  monthlyRevenueGrowth: z.number().min(-0.99).max(2),
  monthlyOpexExPayroll: z.number().nonnegative(),
  monthlyOpexGrowth: z.number().min(-0.99).max(2),
  cogsRatio: z.number().min(0).max(1),
  existingMonthlyPayroll: z.number().nonnegative(),
  existingOtherNetCashAdjustments: z.number(),
});

const Schema = z.object({
  organizationId: z.string().uuid(),
  name: z.string().trim().min(2).max(100),
  status: z.enum(['draft', 'approved']).default('draft'),
  assumptions: Inputs,
});

export async function GET(request: Request) {
  try {
    const { supabase, user } = await requireUser();
    const organizationId = z.string().uuid().safeParse(
      new URL(request.url).searchParams.get('organizationId'),
    );
    if (!organizationId.success) {
      return NextResponse.json({ error: 'A valid organizationId is required' }, { status: 400 });
    }

    const { data: member, error: membershipError } = await supabase
      .from('organization_members')
      .select('role')
      .eq('organization_id', organizationId.data)
      .eq('user_id', user.id)
      .maybeSingle();

    if (membershipError) {
      return NextResponse.json({ error: 'Could not verify workspace access' }, { status: 500 });
    }
    if (!member) {
      return NextResponse.json({ error: 'Organization access denied' }, { status: 403 });
    }

    const { data, error } = await supabase
      .from('model_versions')
      .select('id,name,status,assumptions,created_at')
      .eq('organization_id', organizationId.data)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      return NextResponse.json({ error: 'Could not load models' }, { status: 500 });
    }
    return NextResponse.json({ models: data ?? [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const unauthenticated = message === 'UNAUTHENTICATED';
    return NextResponse.json(
      { error: unauthenticated ? 'Authentication required' : 'Service unavailable' },
      { status: unauthenticated ? 401 : 503 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const { supabase, user } = await requireUser();
    const parsed = Schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid model assumptions', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const payload = parsed.data;
    const { data: member, error: membershipError } = await supabase
      .from('organization_members')
      .select('role')
      .eq('organization_id', payload.organizationId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (membershipError) {
      return NextResponse.json({ error: 'Could not verify workspace access' }, { status: 500 });
    }
    if (!member) {
      return NextResponse.json({ error: 'Organization access denied' }, { status: 403 });
    }
    if (!['owner', 'admin', 'finance'].includes(member.role)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    // The database function archives the former approved version and inserts
    // the new version in one transaction, serialised per workspace.
    const { data, error } = await supabase.rpc('save_model_version', {
      p_organization_id: payload.organizationId,
      p_name: payload.name,
      p_status: payload.status,
      p_assumptions: payload.assumptions,
    });

    if (error || !data || typeof data !== 'object') {
      return NextResponse.json({ error: 'Could not save model version' }, { status: 500 });
    }

    return NextResponse.json({ model: data }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const unauthenticated = message === 'UNAUTHENTICATED';
    return NextResponse.json(
      { error: unauthenticated ? 'Authentication required' : 'Service unavailable' },
      { status: unauthenticated ? 401 : 503 },
    );
  }
}
