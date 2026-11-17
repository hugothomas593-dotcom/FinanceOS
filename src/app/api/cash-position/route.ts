import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/supabase/server';

const Query = z.string().uuid();
const Update = z.object({
  organizationId: z.string().uuid(),
  balance: z.number().finite().min(-1_000_000_000_000).max(1_000_000_000_000),
  asOfDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function GET(request: Request) {
  try {
    const { supabase, user } = await requireUser();
    const parsed = Query.safeParse(new URL(request.url).searchParams.get('organizationId'));
    if (!parsed.success) return NextResponse.json({ error: 'A valid organizationId is required' }, { status: 400 });
    const organizationId = parsed.data;
    const { data: member } = await supabase.from('organization_members').select('role')
      .eq('organization_id', organizationId).eq('user_id', user.id).maybeSingle();
    if (!member) return NextResponse.json({ error: 'Workspace access denied' }, { status: 403 });
    const { data, error } = await supabase.from('financial_cash_positions')
      .select('balance,as_of_date,currency,source,updated_at')
      .eq('organization_id', organizationId).maybeSingle();
    if (error) return NextResponse.json({ error: 'Could not load current cash position' }, { status: 500 });
    return NextResponse.json({ cashPosition: data ?? null });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const unauthenticated = message === 'UNAUTHENTICATED';
    return NextResponse.json({ error: unauthenticated ? 'Authentication required' : 'Service unavailable' }, { status: unauthenticated ? 401 : 503 });
  }
}

export async function PUT(request: Request) {
  try {
    const { supabase, user } = await requireUser();
    const parsed = Update.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Invalid cash position' }, { status: 400 });
    const { organizationId, balance, asOfDate } = parsed.data;
    const { data: member } = await supabase.from('organization_members').select('role')
      .eq('organization_id', organizationId).eq('user_id', user.id).maybeSingle();
    if (!member) return NextResponse.json({ error: 'Workspace access denied' }, { status: 403 });
    if (!['owner','admin','finance'].includes(member.role)) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    if (asOfDate > new Date().toISOString().slice(0, 10)) return NextResponse.json({ error: 'Cash position date cannot be in the future' }, { status: 400 });
    const { data: organization } = await supabase.from('organizations').select('base_currency').eq('id', organizationId).maybeSingle();
    if (!organization) return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });
    const currency = String(organization.base_currency || 'EUR').trim().toUpperCase();
    const { data, error } = await supabase.from('financial_cash_positions').upsert({
      organization_id: organizationId, balance, as_of_date: asOfDate, currency,
      source: 'manual', updated_by: user.id, updated_at: new Date().toISOString(),
    }, { onConflict: 'organization_id' }).select('balance,as_of_date,currency,source,updated_at').single();
    if (error) return NextResponse.json({ error: 'Could not save current cash position' }, { status: 500 });
    await supabase.from('audit_events').insert({
      organization_id: organizationId, actor_id: user.id, event_type: 'cash_position.updated',
      entity_type: 'cash_position', after_state: { as_of_date: asOfDate, currency, source: 'manual' },
    });
    return NextResponse.json({ cashPosition: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const unauthenticated = message === 'UNAUTHENTICATED';
    return NextResponse.json({ error: unauthenticated ? 'Authentication required' : 'Service unavailable' }, { status: unauthenticated ? 401 : 503 });
  }
}
