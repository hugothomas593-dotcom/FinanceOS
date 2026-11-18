import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { validateModelInputs, type ModelInputs } from '@/lib/finance';
import { buildCfoBrief } from '@/lib/cfo-brief';
import { build13WeekCashForecast, type CashForecastInvoice } from '@/lib/cash-flow-forecast';

export const runtime = 'nodejs';
export const maxDuration = 60;

function safeText(value: unknown) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] ?? char));
}
function mondayOfWeek(date: Date) {
  const result = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = result.getUTCDay();
  result.setUTCDate(result.getUTCDate() - ((day + 6) % 7));
  return result.toISOString().slice(0, 10);
}
function money(value: number, currency: string) {
  try { return new Intl.NumberFormat('en-GB', { style: 'currency', currency, maximumFractionDigits: 0 }).format(value); }
  catch { return Math.round(value).toLocaleString('en-GB') + ' ' + currency; }
}
function emailHtml(args: {
  company: string; currency: string; weekStart: string; brief: ReturnType<typeof buildCfoBrief>;
  cashForecast: ReturnType<typeof build13WeekCashForecast> | null; cashBalance: number | null;
  upcomingInvoices: Array<{ counterparty: string; direction: string; amount: number; due_date: string }>;
  decisionsForReview: Array<{ name: string; owner: string; reviewDate: string; status: string }>;
}) {
  const alerts = args.brief.alerts.slice(0, 4).map((alert) =>
    '<li style="margin:0 0 10px"><strong>' + safeText(alert.title) + '</strong><br><span style="color:#58665e">' + safeText(alert.description) + '</span></li>',
  ).join('');
  const cashLine = args.cashForecast
    ? '<p><strong>13-week projected closing cash:</strong> ' + money(args.cashForecast.endingCash, args.currency) + (args.cashForecast.firstNegativeWeek ? ' · First negative week: ' + args.cashForecast.firstNegativeWeek : '') + '</p>'
    : '<p><strong>13-week cash forecast:</strong> not available — enter a dated cash balance and approve a financial model.</p>';
  const decisionRows = args.decisionsForReview.map((decision) =>
    '<li><strong>' + safeText(decision.name) + '</strong> · Review ' + safeText(decision.reviewDate) +
    (decision.owner ? ' · Owner: ' + safeText(decision.owner) : '') +
    ' · ' + safeText(decision.status.replaceAll('_', ' ')) + '</li>',
  ).join('');
  const invoiceRows = args.upcomingInvoices.map((invoice) =>
    '<li>' + safeText(invoice.due_date) + ' · ' + safeText(invoice.counterparty) + ' · ' +
    (invoice.direction === 'receivable' ? 'To collect ' : 'To pay ') + money(invoice.amount, args.currency) + '</li>',
  ).join('');
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  return '<div style="font-family:Arial,sans-serif;color:#1f3227;max-width:640px;margin:auto">' +
    '<p style="color:#6e7d72;font-size:12px">AVENOR · WEEKLY FINANCE CHECK-IN · ' + safeText(args.weekStart) + '</p>' +
    '<h1 style="font-size:24px">Your week in finance</h1><p>' + safeText(args.company) + '</p>' +
    (args.cashBalance === null ? '' : '<p><strong>Recorded cash position:</strong> ' + money(args.cashBalance, args.currency) + '</p>') +
    cashLine + '<h2 style="font-size:16px;margin-top:24px">Signals to review</h2><ul style="padding-left:18px">' + alerts + '</ul>' +
    '<h2 style="font-size:16px;margin-top:24px">Recommended next actions</h2><ol>' + args.brief.priorities.slice(0,3).map(x => '<li>' + safeText(x) + '</li>').join('') + '</ol>' +
    (decisionRows ? '<h2 style="font-size:16px;margin-top:24px">Decisions due for review</h2><ul>' + decisionRows + '</ul>' : '') +
    (invoiceRows ? '<h2 style="font-size:16px;margin-top:24px">Upcoming invoice dates</h2><ul>' + invoiceRows + '</ul>' : '') +
    (appUrl ? '<p style="margin-top:28px"><a href="' + safeText(appUrl.replace(/\/+$/, '') + '/app') + '" style="background:#285c42;color:white;padding:12px 17px;text-decoration:none;border-radius:6px">Open Avenor</a></p>' : '') +
    '<p style="font-size:11px;color:#819087">Planning information based on the latest saved workspace data. Verify source records and assumptions before taking action.</p></div>';
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || request.headers.get('authorization') !== 'Bearer ' + secret) {
    return NextResponse.json({ error: 'Scheduled report endpoint is not authorized or CRON_SECRET is missing' }, { status: secret ? 401 : 503 });
  }
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM_EMAIL?.trim();
  if (!apiKey || !from) return NextResponse.json({ error: 'Email delivery is not configured. Set RESEND_API_KEY and RESEND_FROM_EMAIL.' }, { status: 503 });

  try {
    const admin = createSupabaseAdminClient();
    const weekStart = mondayOfWeek(new Date());
    const { data: preferences, error } = await admin.from('weekly_report_preferences')
      .select('organization_id,user_id,recipient_email,timezone').eq('enabled', true).limit(500);
    if (error) throw new Error('Could not load report preferences');
    let sent = 0, skipped = 0, failed = 0;

    for (const preference of preferences ?? []) {
      try {
        const { data: already } = await admin.from('weekly_report_deliveries').select('status')
          .eq('organization_id', preference.organization_id).eq('user_id', preference.user_id).eq('week_start', weekStart).maybeSingle();
        if (already?.status === 'sent') { skipped += 1; continue; }

        const [{ data: subscription }, { data: organization }, { data: model }, { data: actuals }, { data: cashPosition }, { data: invoices }, { data: scenarios }] = await Promise.all([
          admin.from('subscriptions').select('status,current_period_end').eq('organization_id', preference.organization_id).maybeSingle(),
          admin.from('organizations').select('name,base_currency').eq('id', preference.organization_id).maybeSingle(),
          admin.from('model_versions').select('id,name,status,assumptions').eq('organization_id', preference.organization_id).eq('status','approved').order('created_at',{ascending:false}).limit(1).maybeSingle(),
          admin.from('financial_actuals').select('period,metric_key,amount,currency,source').eq('organization_id',preference.organization_id).neq('source','manual_business_metrics').order('period',{ascending:false}).limit(5_000),
          admin.from('financial_cash_positions').select('balance,as_of_date,currency').eq('organization_id',preference.organization_id).maybeSingle(),
          admin.from('financial_invoices').select('id,direction,category,due_date,expected_cash_date,amount,currency,included_in_model,status,counterparty').eq('organization_id',preference.organization_id).eq('status','open').order('due_date',{ascending:true}).limit(500),
          admin.from('scenarios').select('name,assumptions').eq('organization_id', preference.organization_id).limit(100),
        ]);
        if (!organization || !subscription || !['active','trialing'].includes(subscription.status)
          || !subscription.current_period_end || new Date(subscription.current_period_end).getTime() <= Date.now()) {
          skipped += 1; continue;
        }
        const currency = String(organization.base_currency ?? 'EUR').toUpperCase();
        const safeActuals = (actuals ?? []).map((row) => ({
          period: row.period, metric_key: row.metric_key, amount: Number(row.amount),
          currency: String(row.currency || currency), source: row.source ?? undefined,
        }));
        let inputs: ModelInputs | null = null;
        if (model?.assumptions && typeof model.assumptions === 'object') {
          try { validateModelInputs(model.assumptions as ModelInputs); inputs = model.assumptions as ModelInputs; } catch { inputs = null; }
        }
        const brief = buildCfoBrief({ inputs, modelStatus: inputs ? 'approved' : 'none', actuals: safeActuals, currency });
        let cashForecast = null;
        if (inputs && cashPosition && String(cashPosition.currency).toUpperCase() === currency) {
          cashForecast = build13WeekCashForecast({
            openingCash: Number(cashPosition.balance), asOfDate: cashPosition.as_of_date,
            currency, inputs, invoices: (invoices ?? []).map((row) => ({ ...row, amount: Number(row.amount) })) as CashForecastInvoice[],
          });
        }
        const reviewCutoff = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
        const decisionsForReview = (scenarios ?? []).flatMap((scenario) => {
          const assumptions = scenario.assumptions && typeof scenario.assumptions === 'object' && !Array.isArray(scenario.assumptions)
            ? scenario.assumptions as Record<string, unknown>
            : {};
          const tracking = assumptions.decisionTracking && typeof assumptions.decisionTracking === 'object' && !Array.isArray(assumptions.decisionTracking)
            ? assumptions.decisionTracking as Record<string, unknown>
            : {};
          const reviewDate = typeof tracking.reviewDate === 'string' ? tracking.reviewDate : '';
          const status = typeof tracking.status === 'string' ? tracking.status : 'planned';
          if (!reviewDate || reviewDate > reviewCutoff || ['completed', 'paused'].includes(status)) return [];
          return [{
            name: String(scenario.name),
            owner: typeof tracking.owner === 'string' ? tracking.owner : '',
            reviewDate,
            status,
          }];
        }).sort((a, b) => a.reviewDate.localeCompare(b.reviewDate)).slice(0, 5);

        const upcomingInvoices = (invoices ?? []).filter((invoice) => {
          const due = invoice.expected_cash_date || invoice.due_date;
          return due >= weekStart && due < new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0,10);
        }).slice(0, 6).map((invoice) => ({
          counterparty: String(invoice.counterparty), direction: String(invoice.direction),
          amount: Number(invoice.amount), due_date: String(invoice.expected_cash_date || invoice.due_date),
        }));

        const html = emailHtml({
          company: String(organization.name), currency, weekStart, brief, cashForecast,
          cashBalance: cashPosition && String(cashPosition.currency).toUpperCase() === currency ? Number(cashPosition.balance) : null,
          upcomingInvoices,
          decisionsForReview,
        });
        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from, to: [preference.recipient_email],
            subject: 'Avenor weekly finance check-in · ' + organization.name,
            html,
          }),
        });
        const delivery = await response.json().catch(() => null);
        if (!response.ok) throw new Error(typeof delivery?.message === 'string' ? delivery.message : 'Email provider rejected the report');
        await admin.from('weekly_report_deliveries').upsert({
          organization_id: preference.organization_id, user_id: preference.user_id,
          week_start: weekStart, recipient_email: preference.recipient_email,
          status: 'sent', provider_message_id: delivery?.id ?? null,
          error_message: null, sent_at: new Date().toISOString(),
        }, { onConflict: 'organization_id,user_id,week_start' });
        sent += 1;
      } catch (cause) {
        failed += 1;
        const message = cause instanceof Error ? cause.message : 'Weekly report failed';
        await admin.from('weekly_report_deliveries').upsert({
          organization_id: preference.organization_id, user_id: preference.user_id,
          week_start: weekStart, recipient_email: preference.recipient_email,
          status: 'failed', error_message: message.slice(0, 300),
        }, { onConflict: 'organization_id,user_id,week_start' });
      }
    }
    return NextResponse.json({ weekStart, sent, skipped, failed, configured: true });
  } catch {
    return NextResponse.json({ error: 'Could not generate weekly finance reports' }, { status: 503 });
  }
}
