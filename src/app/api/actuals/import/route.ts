import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/supabase/server';
import { normalizeActuals } from '@/lib/csv';

const Schema = z.object({ organizationId: z.string().uuid(), csv: z.string().min(1).max(2_000_000) });
export async function POST(req: Request) {
  try {
    const { supabase, user } = await requireUser();
    const body = Schema.safeParse(await req.json());
    if (!body.success) return NextResponse.json({ error: 'Invalid import payload' }, { status: 400 });
    const { data: membership } = await supabase.from('organization_members').select('role').eq('organization_id', body.data.organizationId).eq('user_id', user.id).maybeSingle();
    if (!membership) return NextResponse.json({ error: 'Organization access denied' }, { status: 403 });
    if (!['owner','admin','finance'].includes(membership.role)) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    const actuals = normalizeActuals(body.data.csv);
    const records = actuals.map((a, i) => ({ organization_id: body.data.organizationId, period: a.period, metric_key: `${a.direction}:${a.category.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`, amount: a.direction === 'inflow' ? a.amount : -a.amount, currency: 'EUR', source: a.source, source_reference: `${user.id}:${Date.now()}:${i}` }));
    const { error } = await supabase.from('financial_actuals').insert(records);
    if (error) return NextResponse.json({ error: 'Could not save imported records' }, { status: 500 });
    await supabase.from('audit_events').insert({ organization_id: body.data.organizationId, actor_id: user.id, event_type: 'financial_actuals.imported', entity_type: 'financial_actuals', after_state: { row_count: records.length } });
    return NextResponse.json({ imported: records.length });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: message === 'UNAUTHENTICATED' ? 'Authentication required' : message }, { status: message === 'UNAUTHENTICATED' ? 401 : 503 });
  }
}
