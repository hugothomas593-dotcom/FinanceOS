import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/supabase/server';

export async function GET(request: Request) {
  try {
    const { supabase, user } = await requireUser();
    const url = new URL(request.url);
    const organizationId = url.searchParams.get('organizationId');
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');

    if (!organizationId) {
      return NextResponse.json({ error: 'organizationId required' }, { status: 400 });
    }

    const { data: member } = await supabase
      .from('organization_members')
      .select('role')
      .eq('organization_id', organizationId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (!member) {
      return NextResponse.json({ error: 'Organization access denied' }, { status: 403 });
    }

    let query = supabase
      .from('financial_actuals')
      .select('id,period,metric_key,amount,currency,source,imported_at')
      .eq('organization_id', organizationId)
      .neq('source', 'manual_business_metrics')
      .order('period', { ascending: false })
      .limit(5_000);

    if (from) query = query.gte('period', from);
    if (to) query = query.lte('period', to);

    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ error: 'Could not load financial actuals' }, { status: 500 });
    }

    return NextResponse.json({ actuals: data ?? [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const unauthenticated = message === 'UNAUTHENTICATED';
    return NextResponse.json(
      { error: unauthenticated ? 'Authentication required' : 'Service unavailable' },
      { status: unauthenticated ? 401 : 503 },
    );
  }
}
