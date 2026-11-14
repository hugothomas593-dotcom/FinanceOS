import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/supabase/server';
import { normalizeActuals } from '@/lib/csv';
import { createStableActualReferences } from '@/lib/actuals';

const Schema = z.object({
  organizationId: z.string().uuid(),
  csv: z.string().min(1).max(2_000_000),
});

export async function POST(req: Request) {
  try {
    const { supabase, user } = await requireUser();
    const body = Schema.safeParse(await req.json());
    if (!body.success) {
      return NextResponse.json({ error: 'Invalid import payload' }, { status: 400 });
    }

    const { data: membership } = await supabase
      .from('organization_members')
      .select('role')
      .eq('organization_id', body.data.organizationId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (!membership) {
      return NextResponse.json({ error: 'Organization access denied' }, { status: 403 });
    }
    if (!['owner', 'admin', 'finance'].includes(membership.role)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const { data: organization, error: organizationError } = await supabase
      .from('organizations')
      .select('base_currency')
      .eq('id', body.data.organizationId)
      .maybeSingle();

    if (organizationError || !organization) {
      return NextResponse.json({ error: 'Could not load workspace currency' }, { status: 404 });
    }

    const actuals = normalizeActuals(body.data.csv);
    const currency = String(organization.base_currency || 'EUR').trim().toUpperCase();
    const sourceReferences = createStableActualReferences(
      body.data.organizationId,
      currency,
      actuals,
    );

    const records = actuals.map((actual, index) => ({
      organization_id: body.data.organizationId,
      period: actual.period,
      metric_key: `${actual.direction}:${actual.category.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
      amount: actual.direction === 'inflow' ? actual.amount : -actual.amount,
      currency,
      source: actual.source,
      source_reference: sourceReferences[index],
    }));

    // Stable unique references make re-imports idempotent.
    const { data: inserted, error } = await supabase
      .from('financial_actuals')
      .upsert(records, {
        onConflict: 'organization_id,period,metric_key,source_reference',
        ignoreDuplicates: true,
      })
      .select('id');

    if (error) {
      return NextResponse.json({ error: 'Could not save imported records' }, { status: 500 });
    }

    const imported = inserted?.length ?? 0;
    const skipped = records.length - imported;

    await supabase.from('audit_events').insert({
      organization_id: body.data.organizationId,
      actor_id: user.id,
      event_type: 'financial_actuals.imported',
      entity_type: 'financial_actuals',
      after_state: { row_count: imported, skipped_duplicates: skipped, currency },
    });

    return NextResponse.json({ imported, skipped, currency });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json(
      { error: message === 'UNAUTHENTICATED' ? 'Authentication required' : message },
      { status: message === 'UNAUTHENTICATED' ? 401 : 503 },
    );
  }
}
