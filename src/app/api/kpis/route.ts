import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/supabase/server';

const Period = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Period must use YYYY-MM');

const KpisSchema = z.object({
  mrr: z.number().nonnegative().max(1_000_000_000).optional(),
  activeCustomers: z.number().int().nonnegative().max(100_000_000).optional(),
  newCustomers: z.number().int().nonnegative().max(100_000_000).optional(),
  churnedCustomers: z.number().int().nonnegative().max(100_000_000).optional(),
  marketingSpend: z.number().nonnegative().max(1_000_000_000).optional(),
  salesSpend: z.number().nonnegative().max(1_000_000_000).optional(),
  grossMarginPct: z.number().min(0).max(100).optional(),
}).strict().refine(
  (values) => Object.values(values).some((value) => value !== undefined),
  { message: 'Enter at least one business metric.' },
);

const MetricKeys = [
  'mrr',
  'activeCustomers',
  'newCustomers',
  'churnedCustomers',
  'marketingSpend',
  'salesSpend',
  'grossMarginPct',
] as const;

type MetricKey = typeof MetricKeys[number];

export async function GET(request: Request) {
  try {
    const { supabase, user } = await requireUser();
    const url = new URL(request.url);
    const orgId = z.string().uuid().safeParse(url.searchParams.get('organizationId'));
    const period = Period.safeParse(url.searchParams.get('period'));
    if (!orgId.success || !period.success) {
      return NextResponse.json({ error: 'A valid organizationId and YYYY-MM period are required' }, { status: 400 });
    }

    const { data: member } = await supabase
      .from('organization_members')
      .select('role')
      .eq('organization_id', orgId.data)
      .eq('user_id', user.id)
      .maybeSingle();
    if (!member) return NextResponse.json({ error: 'Workspace access denied' }, { status: 403 });

    const { data: organization, error: organizationError } = await supabase
      .from('organizations')
      .select('base_currency')
      .eq('id', orgId.data)
      .maybeSingle();
    if (organizationError || !organization) {
      return NextResponse.json({ error: 'Could not load workspace currency' }, { status: 404 });
    }

    const periodStart = `${period.data}-01`;
    const { data, error } = await supabase
      .from('financial_actuals')
      .select('metric_key,amount,source,imported_at')
      .eq('organization_id', orgId.data)
      .eq('period', periodStart)
      .like('metric_key', 'kpi:%')
      .order('imported_at', { ascending: false });

    if (error) return NextResponse.json({ error: 'Could not load business metrics' }, { status: 500 });

    const kpis: Partial<Record<MetricKey, number>> = {};
    for (const row of data ?? []) {
      const key = row.metric_key.replace(/^kpi:/, '') as MetricKey;
      if (MetricKeys.includes(key) && kpis[key] === undefined) {
        kpis[key] = Number(row.amount);
      }
    }

    return NextResponse.json({
      period: period.data,
      currency: organization.base_currency,
      kpis,
      hasData: Object.keys(kpis).length > 0,
      lastUpdatedAt: data?.[0]?.imported_at ?? null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
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
    const payload = z.object({
      organizationId: z.string().uuid(),
      period: Period,
      kpis: KpisSchema,
    }).safeParse(await request.json().catch(() => null));

    if (!payload.success) {
      return NextResponse.json({ error: 'Invalid business metrics', details: payload.error.flatten() }, { status: 400 });
    }

    const { organizationId, period, kpis } = payload.data;
    const { data: member } = await supabase
      .from('organization_members')
      .select('role')
      .eq('organization_id', organizationId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (!member) return NextResponse.json({ error: 'Workspace access denied' }, { status: 403 });
    if (!['owner', 'admin', 'finance'].includes(member.role)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const { data: organization, error: organizationError } = await supabase
      .from('organizations')
      .select('base_currency')
      .eq('id', organizationId)
      .maybeSingle();
    if (organizationError || !organization) {
      return NextResponse.json({ error: 'Could not load workspace currency' }, { status: 404 });
    }

    const periodStart = `${period}-01`;
    const records = Object.entries(kpis)
      .filter((entry): entry is [MetricKey, number] => entry[1] !== undefined)
      .map(([key, value]) => ({
        organization_id: organizationId,
        period: periodStart,
        metric_key: `kpi:${key}`,
        amount: value,
        currency: organization.base_currency,
        source: 'manual_business_metrics',
        source_reference: `manual-kpi:${key}:${period}`,
      }));

    const { error } = await supabase
      .from('financial_actuals')
      .upsert(records, {
        onConflict: 'organization_id,period,metric_key,source_reference',
      });

    if (error) return NextResponse.json({ error: 'Could not save business metrics' }, { status: 500 });

    await supabase.from('audit_events').insert({
      organization_id: organizationId,
      actor_id: user.id,
      event_type: 'business_metrics.saved',
      entity_type: 'business_metrics',
      after_state: { period, metric_keys: records.map((row) => row.metric_key) },
    });

    return NextResponse.json({ saved: records.length, period, currency: organization.base_currency });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const unauthenticated = message === 'UNAUTHENTICATED';
    return NextResponse.json(
      { error: unauthenticated ? 'Authentication required' : 'Service unavailable' },
      { status: unauthenticated ? 401 : 503 },
    );
  }
}
