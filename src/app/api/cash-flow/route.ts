import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/supabase/server';
import { build13WeekCashForecast, type CashForecastInvoice } from '@/lib/cash-flow-forecast';
import { validateModelInputs, type ModelInputs } from '@/lib/finance';

const Query = z.string().uuid();
export async function GET(request: Request) {
  try {
    const { supabase, user } = await requireUser();
    const parsed = Query.safeParse(new URL(request.url).searchParams.get('organizationId'));
    if (!parsed.success) return NextResponse.json({ error: 'A valid organizationId is required' }, { status: 400 });
    const organizationId = parsed.data;
    const { data: member } = await supabase.from('organization_members').select('role')
      .eq('organization_id', organizationId).eq('user_id', user.id).maybeSingle();
    if (!member) return NextResponse.json({ error: 'Workspace access denied' }, { status: 403 });

    const [{ data: organization }, { data: cashPosition }, { data: approved }] = await Promise.all([
      supabase.from('organizations').select('base_currency').eq('id', organizationId).maybeSingle(),
      supabase.from('financial_cash_positions').select('balance,as_of_date,currency,source,updated_at').eq('organization_id', organizationId).maybeSingle(),
      supabase.from('model_versions').select('id,name,status,assumptions,created_at').eq('organization_id', organizationId).eq('status', 'approved').order('created_at', { ascending: false }).limit(1).maybeSingle(),
    ]);
    const currency = String(organization?.base_currency ?? 'EUR').toUpperCase();
    const { data: invoices, error: invoiceError } = await supabase.from('financial_invoices')
      .select('id,direction,category,due_date,expected_cash_date,amount,currency,included_in_model,status')
      .eq('organization_id', organizationId).eq('status', 'open').order('due_date', { ascending: true }).limit(1_000);
    if (invoiceError) return NextResponse.json({ error: 'Could not load invoice commitments' }, { status: 500 });

    let forecast = null;
    let missing: string[] = [];
    if (!cashPosition) missing.push('Set the current cash balance and the date it represents.');
    if (!approved) missing.push('Approve a financial model to provide the recurring operating baseline.');
    if (cashPosition && approved) {
      try {
        validateModelInputs(approved.assumptions as ModelInputs);
        forecast = build13WeekCashForecast({
          openingCash: Number(cashPosition.balance),
          asOfDate: cashPosition.as_of_date,
          currency,
          inputs: approved.assumptions as ModelInputs,
          invoices: (invoices ?? []).map((row) => ({ ...row, amount: Number(row.amount) })) as CashForecastInvoice[],
        });
      } catch {
        missing.push('Review the approved model or cash position; the 13-week forecast could not be calculated.');
      }
    }
    return NextResponse.json({
      forecast,
      cashPosition: cashPosition ?? null,
      model: approved ? { id: approved.id, name: approved.name, createdAt: approved.created_at } : null,
      invoiceCount: (invoices ?? []).length,
      missing,
      basis: 'Daily operating-model cash flows are spread across each month. Invoices marked “included in model” shift the timing of the relevant model line rather than being added twice. Other invoices are incremental.',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const unauthenticated = message === 'UNAUTHENTICATED';
    return NextResponse.json({ error: unauthenticated ? 'Authentication required' : 'Service unavailable' }, { status: unauthenticated ? 401 : 503 });
  }
}
