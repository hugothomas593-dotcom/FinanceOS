import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/supabase/server';
import { validateModelInputs, type ModelInputs } from '@/lib/finance';
import { buildCfoBrief } from '@/lib/cfo-brief';
import type { ActualRecord, CompanyKpis } from '@/lib/finance-intelligence';
import { CompanyContextSchema, EMPTY_COMPANY_CONTEXT } from '@/lib/company-context';

const QuerySchema = z.object({ organizationId: z.string().uuid() });

function safeModelInputs(value: unknown): ModelInputs | null {
  try {
    validateModelInputs(value as ModelInputs);
    return value as ModelInputs;
  } catch {
    return null;
  }
}

const KPI_KEYS = ['mrr', 'activeCustomers', 'newCustomers', 'churnedCustomers', 'marketingSpend', 'salesSpend', 'grossMarginPct'] as const;

export async function GET(request: Request) {
  try {
    const { supabase, user } = await requireUser();
    const parsed = QuerySchema.safeParse({ organizationId: new URL(request.url).searchParams.get('organizationId') });
    if (!parsed.success) return NextResponse.json({ error: 'A valid organizationId is required' }, { status: 400 });
    const { organizationId } = parsed.data;

    const { data: membership, error: membershipError } = await supabase
      .from('organization_members')
      .select('role, organizations(name,base_currency)')
      .eq('organization_id', organizationId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (membershipError) return NextResponse.json({ error: 'Could not verify workspace access' }, { status: 500 });
    if (!membership) return NextResponse.json({ error: 'Workspace access denied' }, { status: 403 });

    const { data: approvedModel, error: approvedModelError } = await supabase
      .from('model_versions')
      .select('id,name,status,assumptions,created_at')
      .eq('organization_id', organizationId)
      .eq('status', 'approved')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (approvedModelError) return NextResponse.json({ error: 'Could not load the approved financial model' }, { status: 500 });

    const modelResult = approvedModel ? { data: approvedModel, error: null } : await supabase
      .from('model_versions')
      .select('id,name,status,assumptions,created_at')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (modelResult.error) return NextResponse.json({ error: 'Could not load the latest financial model' }, { status: 500 });

    const [{ data: contextRow, error: contextError }, { data: actualRows, error: actualsError }] = await Promise.all([
      supabase
        .from('organization_contexts')
        .select('context')
        .eq('organization_id', organizationId)
        .maybeSingle(),
      supabase
        .from('financial_actuals')
      .select('period,metric_key,amount,currency,source')
      .eq('organization_id', organizationId)
        .order('period', { ascending: false })
        .limit(5_000),
    ]);
    if (contextError) return NextResponse.json({ error: 'Could not load saved company context' }, { status: 500 });
    if (actualsError) return NextResponse.json({ error: 'Could not load imported financial actuals' }, { status: 500 });
    const parsedContext = CompanyContextSchema.safeParse(contextRow?.context ?? EMPTY_COMPANY_CONTEXT);
    const companyContext = parsedContext.success ? parsedContext.data : EMPTY_COMPANY_CONTEXT;

    const organization = Array.isArray(membership.organizations) ? membership.organizations[0] : membership.organizations;
    const currency = organization?.base_currency?.trim().toUpperCase() || 'EUR';
    const kpiRows = (actualRows ?? []).filter((row) => row.metric_key.startsWith('kpi:'));
    const metricsPeriod = kpiRows.map((row) => row.period).sort((a, b) => b.localeCompare(a))[0]?.slice(0, 7) ?? null;
    const kpis: CompanyKpis = {};
    for (const row of kpiRows) {
      if (!metricsPeriod || row.period.slice(0, 7) !== metricsPeriod) continue;
      const key = row.metric_key.replace(/^kpi:/, '') as keyof CompanyKpis;
      if (KPI_KEYS.includes(key as typeof KPI_KEYS[number]) && kpis[key] === undefined) {
        const amount = Number(row.amount);
        if (Number.isFinite(amount)) kpis[key] = amount;
      }
    }

    const actuals = (actualRows ?? [])
      .filter((row) => !row.metric_key.startsWith('kpi:'))
      .map((row) => ({
        period: row.period,
        metric_key: row.metric_key,
        amount: Number(row.amount),
        currency: String(row.currency || currency),
        source: row.source ?? undefined,
      })) as ActualRecord[];
    const model = modelResult.data;
    const inputs = model ? safeModelInputs(model.assumptions) : null;
    const modelStatus = inputs ? (model?.status === 'approved' ? 'approved' : 'draft') : 'none';

    const brief = buildCfoBrief({ inputs, modelStatus, actuals, currency, kpis, metricsPeriod, context: companyContext });
    return NextResponse.json(
      { organization: { id: organizationId, name: organization?.name ?? 'Your company' }, brief },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const unauthenticated = message === 'UNAUTHENTICATED';
    return NextResponse.json(
      { error: unauthenticated ? 'Authentication required' : 'Could not build your financial brief' },
      { status: unauthenticated ? 401 : 503 },
    );
  }
}
