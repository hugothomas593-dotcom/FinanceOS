import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/supabase/server';

export async function GET(request: Request) {
  try {
    const { supabase, user } = await requireUser();
    const organizationId = z.string().uuid().safeParse(new URL(request.url).searchParams.get('organizationId'));
    if (!organizationId.success) return NextResponse.json({ error: 'A valid organizationId is required' }, { status: 400 });

    const { data: member } = await supabase
      .from('organization_members')
      .select('role')
      .eq('organization_id', organizationId.data)
      .eq('user_id', user.id)
      .maybeSingle();
    if (!member) return NextResponse.json({ error: 'Workspace access denied' }, { status: 403 });

    const { data: subscription, error } = await supabase
      .from('subscriptions')
      .select('status,current_period_end,stripe_customer_id')
      .eq('organization_id', organizationId.data)
      .maybeSingle();
    if (error) return NextResponse.json({ error: 'Could not load subscription status' }, { status: 500 });

    const billingRole = ['owner', 'admin'].includes(member.role);
    const billingConfigured = Boolean(
      process.env.STRIPE_SECRET_KEY &&
      process.env.STRIPE_PRICE_ID &&
      process.env.NEXT_PUBLIC_APP_URL,
    );

    return NextResponse.json({
      billingConfigured,
      subscriptionStatus: subscription?.status ?? null,
      currentPeriodEnd: subscription?.current_period_end ?? null,
      canStartCheckout: billingRole && billingConfigured && !subscription?.stripe_subscription_id,
      canManageBilling: billingRole && Boolean(
        process.env.STRIPE_SECRET_KEY &&
        process.env.NEXT_PUBLIC_APP_URL &&
        subscription?.stripe_customer_id,
      ),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const unauthenticated = message === 'UNAUTHENTICATED';
    return NextResponse.json(
      { error: unauthenticated ? 'Authentication required' : 'Billing status unavailable' },
      { status: unauthenticated ? 401 : 503 },
    );
  }
}
