import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';

export const runtime = 'nodejs';
export const maxDuration = 60;

const QA_WORKSPACE_NAME = 'Avenor QA - Synthetic Dataset';

function isAuthorized(request: Request) {
  const expected = process.env.AVENOR_QA_SECRET ?? '';
  const supplied = request.headers.get('x-avenor-qa-secret') ?? '';
  if (process.env.VERCEL_ENV !== 'preview' || !expected || supplied.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
}

function csvEscape(value: string | number) {
  const text = String(value);
  return /[",\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
}

function buildSyntheticCsv() {
  const rows: Array<Array<string | number>> = [['Date', 'Description', 'Category', 'Amount', 'Currency']];
  const revenue = [100000, 104000, 106000, 108000, 110000, 113000, 115000, 118000, 120000, 123000, 126000, 130000];
  const payroll = [112000, 115000, 116000, 118000, 120000, 122000, 124000, 126000, 128000, 130000, 132000, 135000];
  const marketing = [10000, 10500, 11000, 11000, 11500, 12000, 12500, 12500, 13000, 13500, 14000, 14500];

  for (let month = 0; month < 12; month += 1) {
    const date = new Date(Date.UTC(2025, 10 + month, 15)).toISOString().slice(0, 10);
    rows.push([date, 'Monthly SaaS subscription collections', 'Revenue', revenue[month], 'EUR']);
    rows.push([date, 'Monthly employee payroll', 'Payroll', -payroll[month], 'EUR']);
    rows.push([date, 'Cloud hosting and payment processing', 'Cost of goods sold', -Math.round(revenue[month] * 0.22), 'EUR']);
    rows.push([date, 'Paid acquisition and campaigns', 'Marketing', -marketing[month], 'EUR']);
    rows.push([date, 'Product and finance software', 'Software', -5000, 'EUR']);
    rows.push([date, 'Office and coworking', 'Rent', -3500, 'EUR']);
    rows.push([date, 'Specialist contractors', 'Contractors', -8000, 'EUR']);
  }
  return rows.map((row) => row.map(csvEscape).join(',')).join('\n');
}

function makeCookieHeader(cookieJar: Map<string, string>) {
  return [...cookieJar.entries()]
    .map(([name, value]) => `${name}=${encodeURIComponent(value)}`)
    .join('; ');
}

async function deleteQaWorkspace(
  admin: ReturnType<typeof createClient>,
  organizationId: string,
  userId: string,
) {
  const { data: org } = await admin
    .from('organizations')
    .select('id,name')
    .eq('id', organizationId)
    .maybeSingle();

  if (!org || org.name !== QA_WORKSPACE_NAME) {
    throw new Error('Refusing to delete a workspace that is not the synthetic QA workspace');
  }

  const { data: threads } = await admin
    .from('copilot_threads')
    .select('id')
    .eq('organization_id', organizationId);
  const threadIds = (threads ?? []).map((thread) => thread.id as string);

  if (threadIds.length) {
    await admin.from('copilot_messages').delete().in('thread_id', threadIds);
  }

  for (const table of [
    'copilot_threads',
    'scenarios',
    'financial_actuals',
    'model_versions',
    'organization_contexts',
    'audit_events',
    'subscriptions',
    'billing_trial_claims',
    'organization_members',
  ]) {
    const { error } = await admin.from(table).delete().eq('organization_id', organizationId);
    if (error) throw new Error(`QA cleanup failed for ${table}: ${error.message}`);
  }

  const { error: organizationError } = await admin
    .from('organizations')
    .delete()
    .eq('id', organizationId);
  if (organizationError) throw new Error(`QA workspace cleanup failed: ${organizationError.message}`);

  await admin.from('api_rate_limits').delete().eq('user_id', userId);
  const { error: userError } = await admin.auth.admin.deleteUser(userId);
  if (userError) throw new Error(`QA user cleanup failed: ${userError.message}`);
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) return new NextResponse(null, { status: 404 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publicKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '')).replace(/\/$/, '');

  if (!url || !publicKey || !serviceRoleKey || !baseUrl) {
    return NextResponse.json({ error: 'QA environment is not configured' }, { status: 503 });
  }

  const admin = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const payload = await request.json().catch(() => ({})) as Record<string, unknown>;

  if (payload.action === 'cleanup') {
    const organizationId = typeof payload.organizationId === 'string' ? payload.organizationId : '';
    const userId = typeof payload.userId === 'string' ? payload.userId : '';
    if (!organizationId || !userId) return NextResponse.json({ error: 'Missing QA cleanup identifiers' }, { status: 400 });
    try {
      await deleteQaWorkspace(admin, organizationId, userId);
      return NextResponse.json({ cleaned: true });
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : 'QA cleanup failed' }, { status: 500 });
    }
  }

  if (payload.action !== 'setup') return NextResponse.json({ error: 'Unsupported QA action' }, { status: 400 });

  const email = `avenor-qa-${randomUUID()}@example.invalid`;
  const password = `Avenor-QA-${randomBytes(24).toString('base64url')}!aA9`;
  let userId = '';
  let organizationId = '';

  try {
    const { data: created, error: createUserError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: 'Avenor Synthetic QA' },
    });
    if (createUserError || !created.user) throw new Error(`Could not create QA user: ${createUserError?.message ?? 'No user returned'}`);
    userId = created.user.id;
    organizationId = randomUUID();

    const { error: organizationError } = await admin.from('organizations').insert({
      id: organizationId,
      name: QA_WORKSPACE_NAME,
      country_code: 'FR',
      base_currency: 'EUR',
    });
    if (organizationError) throw new Error(`Could not create QA workspace: ${organizationError.message}`);

    const { error: memberError } = await admin.from('organization_members').insert({
      organization_id: organizationId,
      user_id: userId,
      role: 'owner',
    });
    if (memberError) throw new Error(`Could not add QA owner: ${memberError.message}`);

    const assumptions = {
      openingCash: 650000,
      monthlyRevenue: 120000,
      monthlyRevenueGrowth: 0.02,
      monthlyOpexExPayroll: 42000,
      monthlyOpexGrowth: 0.015,
      cogsRatio: 0.22,
      existingMonthlyPayroll: 135000,
      existingOtherNetCashAdjustments: 0,
    };

    const { error: modelError } = await admin.from('model_versions').insert({
      organization_id: organizationId,
      name: 'Synthetic 18-month operating plan',
      status: 'approved',
      assumptions,
      created_by: userId,
    });
    if (modelError) throw new Error(`Could not create QA model: ${modelError.message}`);

    const context = {
      industry: 'B2B SaaS / finance operations',
      businessModel: 'saas',
      stage: 'seed',
      productDescription: 'Subscription finance operations software with an AI cash-flow and decision copilot.',
      targetCustomer: 'Seed-stage B2B SaaS founders in France and Europe.',
      geography: 'France and Europe',
      pricingModel: 'Monthly SaaS subscription; illustrative price point EUR 59 per month.',
      mainGoal: 'Reach break-even while protecting at least 12 months of runway.',
      nextMilestone: 'Reach 25 paying startup customers.',
      targetRunwayMonths: 12,
      churnWatchThresholdPct: 4,
      cacPaybackWatchMonths: 12,
      founderNotes: 'All figures are synthetic test assumptions. They are not audited accounts and must not be treated as real company results.',
    };

    const { error: contextError } = await admin.from('organization_contexts').insert({
      organization_id: organizationId,
      context,
      updated_by: userId,
    });
    if (contextError) throw new Error(`Could not create QA company context: ${contextError.message}`);

    const authClient = createClient(url, publicKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: authData, error: signInError } = await authClient.auth.signInWithPassword({ email, password });
    if (signInError || !authData.session) throw new Error(`Could not create QA session: ${signInError?.message ?? 'No session returned'}`);

    const cookieJar = new Map<string, string>();
    const ssrClient = createServerClient(url, publicKey, {
      cookies: {
        getAll() {
          return [...cookieJar.entries()].map(([name, value]) => ({ name, value }));
        },
        setAll(cookiesToSet) {
          for (const cookie of cookiesToSet) cookieJar.set(cookie.name, cookie.value);
        },
      },
    });
    const { error: sessionError } = await ssrClient.auth.setSession({
      access_token: authData.session.access_token,
      refresh_token: authData.session.refresh_token,
    });
    if (sessionError) throw new Error(`Could not prepare QA session cookie: ${sessionError.message}`);
    const cookieHeader = makeCookieHeader(cookieJar);
    if (!cookieHeader) throw new Error('Supabase did not produce an authenticated QA cookie');

    const csv = buildSyntheticCsv();
    const bypass = request.headers.get('x-vercel-protection-bypass') ?? '';
    const importResponse = await fetch(`${baseUrl}/api/actuals/import`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': baseUrl,
        'Referer': `${baseUrl}/app`,
        Cookie: cookieHeader,
        ...(bypass ? { 'x-vercel-protection-bypass': bypass } : {}),
      },
      body: JSON.stringify({ organizationId, csv }),
      cache: 'no-store',
    });
    const importResult = await importResponse.json().catch(() => null);
    if (!importResponse.ok) throw new Error(`CSV import endpoint failed (${importResponse.status}): ${JSON.stringify(importResult)}`);

    const kpiRows = [
      ['mrr', 130000],
      ['activeCustomers', 1050],
      ['newCustomers', 52],
      ['churnedCustomers', 34],
      ['marketingSpend', 14000],
      ['salesSpend', 9000],
      ['grossMarginPct', 78],
    ].map(([key, amount]) => ({
      organization_id: organizationId,
      period: '2026-10-31',
      metric_key: `kpi:${key}`,
      amount,
      currency: 'EUR',
      source: 'synthetic_qa',
    }));

    const { error: kpiError } = await admin.from('financial_actuals').insert(kpiRows);
    if (kpiError) throw new Error(`Could not add synthetic SaaS KPIs: ${kpiError.message}`);

    return NextResponse.json({
      ready: true,
      organizationId,
      userId,
      cookieHeader,
      importResult,
      actualRows: 84,
      kpiRows: kpiRows.length,
      modelStatus: 'approved',
    });
  } catch (error) {
    if (organizationId && userId) {
      try { await deleteQaWorkspace(admin, organizationId, userId); } catch { /* preserve the primary setup error */ }
    } else if (userId) {
      await admin.auth.admin.deleteUser(userId);
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'QA setup failed' },
      { status: 500 },
    );
  }
}
