import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/supabase/server';
import { buildActualVsForecast, type BaselineRow, type ReconciliationActual, type CategoryMapping } from '@/lib/actual-vs-forecast';

const MappingSchema = z.object({
  organizationId: z.string().uuid(),
  metricKey: z.string().trim().min(3).max(180),
  forecastCategory: z.enum(['revenue','cogs','payroll','opex','other','exclude']),
});

export async function GET(request: Request) {
  try {
    const { supabase, user } = await requireUser();
    const organizationId = new URL(request.url).searchParams.get('organizationId') ?? '';
    if (!z.string().uuid().safeParse(organizationId).success) return NextResponse.json({ error: 'A valid organizationId is required' }, { status: 400 });
    const { data: member } = await supabase.from('organization_members').select('role')
      .eq('organization_id', organizationId).eq('user_id', user.id).maybeSingle();
    if (!member) return NextResponse.json({ error: 'Workspace access denied' }, { status: 403 });
    const [{ data: organization }, { data: baselines, error: baselineError }, { data: actuals, error: actualError }, { data: mappings, error: mappingError }] = await Promise.all([
      supabase.from('organizations').select('base_currency').eq('id', organizationId).maybeSingle(),
      supabase.from('financial_forecast_baselines').select('period,category,forecast_amount,currency,captured_at')
        .eq('organization_id', organizationId).order('captured_at', { ascending: false }).limit(2_000),
      supabase.from('financial_actuals').select('period,metric_key,amount,currency')
        .eq('organization_id', organizationId).neq('source','manual_business_metrics').order('period', { ascending: false }).limit(5_000),
      supabase.from('financial_category_mappings').select('metric_key,forecast_category').eq('organization_id', organizationId),
    ]);
    if (baselineError || actualError || mappingError) return NextResponse.json({ error: 'Could not load Actual vs Forecast data' }, { status: 500 });
    const result = buildActualVsForecast({
      baselines: (baselines ?? []).map((row) => ({ ...row, forecast_amount: Number(row.forecast_amount) })) as BaselineRow[],
      actuals: (actuals ?? []).map((row) => ({ ...row, amount: Number(row.amount) })) as ReconciliationActual[],
      mappings: (mappings ?? []) as CategoryMapping[],
      baseCurrency: String(organization?.base_currency ?? 'EUR'),
    });
    return NextResponse.json({ reconciliation: result, mappings: mappings ?? [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const unauthenticated = message === 'UNAUTHENTICATED';
    return NextResponse.json({ error: unauthenticated ? 'Authentication required' : 'Service unavailable' }, { status: unauthenticated ? 401 : 503 });
  }
}

export async function PUT(request: Request) {
  try {
    const { supabase, user } = await requireUser();
    const parsed = MappingSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Invalid category mapping' }, { status: 400 });
    const p = parsed.data;
    const { data: member } = await supabase.from('organization_members').select('role')
      .eq('organization_id', p.organizationId).eq('user_id', user.id).maybeSingle();
    if (!member) return NextResponse.json({ error: 'Workspace access denied' }, { status: 403 });
    if (!['owner','admin','finance'].includes(member.role)) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    const { error } = await supabase.from('financial_category_mappings').upsert({
      organization_id: p.organizationId, metric_key: p.metricKey,
      forecast_category: p.forecastCategory, updated_by: user.id, updated_at: new Date().toISOString(),
    }, { onConflict: 'organization_id,metric_key' });
    if (error) return NextResponse.json({ error: 'Could not save category mapping' }, { status: 500 });
    return NextResponse.json({ saved: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const unauthenticated = message === 'UNAUTHENTICATED';
    return NextResponse.json({ error: unauthenticated ? 'Authentication required' : 'Service unavailable' }, { status: unauthenticated ? 401 : 503 });
  }
}
