import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { requireUser } from '@/lib/supabase/server';

const QuerySchema = z.object({ organizationId: z.string().uuid() });
const LIMITS = {
  members: 1_000,
  actuals: 10_000,
  models: 1_000,
  scenarios: 5_000,
  threads: 1_000,
  messages: 20_000,
  auditEvents: 10_000,
} as const;

export async function GET(request: Request) {
  try {
    const { supabase, user } = await requireUser();
    const parsed = QuerySchema.safeParse({
      organizationId: new URL(request.url).searchParams.get('organizationId'),
    });
    if (!parsed.success) {
      return NextResponse.json({ error: 'A valid organizationId is required' }, { status: 400 });
    }
    const { organizationId } = parsed.data;

    // Only workspace owners/admins can export a complete workspace-level archive.
    const { data: membership, error: membershipError } = await supabase
      .from('organization_members')
      .select('role')
      .eq('organization_id', organizationId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (membershipError) {
      return NextResponse.json({ error: 'Could not verify workspace access' }, { status: 500 });
    }
    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return NextResponse.json({ error: 'Workspace owner or admin permission required' }, { status: 403 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json({ error: 'Secure export is not configured' }, { status: 503 });
    }

    // Service-role reads are used only after the caller's membership and role
    // have been checked with the caller's authenticated Supabase session.
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const [
      organizationResult,
      membersResult,
      actualsResult,
      modelsResult,
      scenariosResult,
      contextResult,
      threadsResult,
      auditResult,
      subscriptionResult,
    ] = await Promise.all([
      admin.from('organizations')
        .select('id,name,country_code,base_currency,created_at')
        .eq('id', organizationId)
        .maybeSingle(),
      admin.from('organization_members')
        .select('organization_id,user_id,role,created_at')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: true })
        .limit(LIMITS.members + 1),
      admin.from('financial_actuals')
        .select('*', { count: 'exact' })
        .eq('organization_id', organizationId)
        .order('period', { ascending: true })
        .limit(LIMITS.actuals + 1),
      admin.from('model_versions')
        .select('*', { count: 'exact' })
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: true })
        .limit(LIMITS.models + 1),
      admin.from('scenarios')
        .select('*', { count: 'exact' })
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: true })
        .limit(LIMITS.scenarios + 1),
      admin.from('organization_contexts')
        .select('*')
        .eq('organization_id', organizationId)
        .maybeSingle(),
      admin.from('copilot_threads')
        .select('*', { count: 'exact' })
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: true })
        .limit(LIMITS.threads + 1),
      admin.from('audit_events')
        .select('*', { count: 'exact' })
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: true })
        .limit(LIMITS.auditEvents + 1),
      admin.from('subscriptions')
        .select('status,current_period_end,updated_at')
        .eq('organization_id', organizationId)
        .maybeSingle(),
    ]);

    const queryErrors = [
      organizationResult.error,
      membersResult.error,
      actualsResult.error,
      modelsResult.error,
      scenariosResult.error,
      contextResult.error,
      threadsResult.error,
      auditResult.error,
      subscriptionResult.error,
    ].filter(Boolean);
    if (queryErrors.length || !organizationResult.data) {
      console.error('Workspace export failed', queryErrors);
      return NextResponse.json({ error: 'Could not create a complete workspace export' }, { status: 500 });
    }

    const threadRows = (threadsResult.data ?? []).slice(0, LIMITS.threads);
    const threadIds = threadRows.map((thread) => thread.id as string);
    const messageRows: Record<string, unknown>[] = [];
    let messagesTruncated = false;

    // Chunk the thread IDs to stay below PostgREST URL/query-size limits.
    for (let index = 0; index < threadIds.length; index += 100) {
      const threadIdChunk = threadIds.slice(index, index + 100);
      const remaining = LIMITS.messages + 1 - messageRows.length;
      if (remaining <= 0) {
        messagesTruncated = true;
        break;
      }
      const { data, error } = await admin
        .from('copilot_messages')
        .select('*')
        .in('thread_id', threadIdChunk)
        .order('created_at', { ascending: true })
        .limit(remaining);
      if (error) {
        return NextResponse.json({ error: 'Could not export Copilot conversation history' }, { status: 500 });
      }
      messageRows.push(...(data ?? []));
    }

    const truncated = {
      members: (membersResult.data?.length ?? 0) > LIMITS.members,
      financialActuals: (actualsResult.data?.length ?? 0) > LIMITS.actuals,
      modelVersions: (modelsResult.data?.length ?? 0) > LIMITS.models,
      scenarios: (scenariosResult.data?.length ?? 0) > LIMITS.scenarios,
      copilotThreads: (threadsResult.data?.length ?? 0) > LIMITS.threads,
      copilotMessages: messagesTruncated || messageRows.length > LIMITS.messages,
      auditEvents: (auditResult.data?.length ?? 0) > LIMITS.auditEvents,
    };

    const archive = {
      format: 'avenor-workspace-export-v1',
      generatedAt: new Date().toISOString(),
      exportedByUserId: user.id,
      organization: organizationResult.data,
      subscription: subscriptionResult.data
        ? {
            status: subscriptionResult.data.status,
            currentPeriodEnd: subscriptionResult.data.current_period_end,
            updatedAt: subscriptionResult.data.updated_at,
          }
        : null,
      members: (membersResult.data ?? []).slice(0, LIMITS.members),
      financialActuals: (actualsResult.data ?? []).slice(0, LIMITS.actuals),
      modelVersions: (modelsResult.data ?? []).slice(0, LIMITS.models),
      scenarios: (scenariosResult.data ?? []).slice(0, LIMITS.scenarios),
      companyContext: contextResult.data,
      copilotThreads: threadRows,
      copilotMessages: messageRows.slice(0, LIMITS.messages),
      auditEvents: (auditResult.data ?? []).slice(0, LIMITS.auditEvents),
      truncated,
      note: 'Workspace-level administrator export. Internal Stripe webhook receipts, rate-limit state and secret billing-trial claims are intentionally excluded.',
    };

    return new NextResponse(JSON.stringify(archive, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="avenor-workspace-${organizationId}-export.json"`,
        'Cache-Control': 'private, no-store, max-age=0',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const unauthenticated = message === 'UNAUTHENTICATED';
    return NextResponse.json(
      { error: unauthenticated ? 'Authentication required' : 'Workspace export unavailable' },
      { status: unauthenticated ? 401 : 503 },
    );
  }
}
