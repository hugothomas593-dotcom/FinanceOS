import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { requireUser } from '@/lib/supabase/server';
import { canStartCheckout } from '@/lib/stripe-billing';

export async function GET(request: Request) {
  try {
    const { supabase, user } = await requireUser();
    const organizationId = z.string().uuid().safeParse(
      new URL(request.url).searchParams.get('organizationId'),
    );
    if (!organizationId.success) {
      return NextResponse.json({ error: 'A valid organizationId is required' }, { status: 400 });
    }

    const { data: member, error: membershipError } = await supabase
      .from('organization_members')
      .select('role')
      .eq('organization_id', organizationId.data)
      .eq('user_id', user.id)
      .maybeSingle();
    if (membershipError) {
      return NextResponse.json({ error: 'Could not verify workspace access' }, { status: 500 });
    }
    if (!member) return NextResponse.json({ error: 'Workspace access denied' }, { status: 403 });

    const { data: hasAccess, error: entitlementError } = await supabase.rpc(
      'has_organization_access',
      { org_id: organizationId.data },
    );
    if (entitlementError) {
      return NextResponse.json({ error: 'Could not verify subscription access' }, { status: 503 });
    }

    const billingRole = ['owner', 'admin'].includes(member.role);
    const checkoutConfigured = Boolean(
      process.env.STRIPE_SECRET_KEY &&
      process.env.STRIPE_PRICE_ID &&
      process.env.NEXT_PUBLIC_APP_URL,
    );
    const webhookConfigured = Boolean(
      process.env.STRIPE_WEBHOOK_SECRET &&
      process.env.SUPABASE_SERVICE_ROLE_KEY &&
      process.env.NEXT_PUBLIC_SUPABASE_URL,
    );
    const billingConfigured = checkoutConfigured && webhookConfigured;
    let trialAvailable: boolean | null = null;

    if (billingRole && process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
      const admin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY,
        { auth: { persistSession: false, autoRefreshToken: false } },
      );
      const { data: claim, error: claimError } = await admin
        .from('billing_trial_claims')
        .select('state')
        .eq('user_id', user.id)
        .maybeSingle();
      if (claimError) return NextResponse.json({ error: 'Could not verify trial eligibility' }, { status: 500 });

      if (claim) {
        trialAvailable = false;
      } else {
        const { data: memberships, error: membershipsError } = await admin
          .from('organization_members')
          .select('organization_id')
          .eq('user_id', user.id);
        if (membershipsError) return NextResponse.json({ error: 'Could not verify trial eligibility' }, { status: 500 });
        const organizationIds = (memberships ?? []).map((row) => row.organization_id);
        if (!organizationIds.length) {
          trialAvailable = true;
        } else {
          const { data: priorSubscriptions, error: historyError } = await admin
            .from('subscriptions')
            .select('stripe_subscription_id')
            .in('organization_id', organizationIds)
            .not('stripe_subscription_id', 'is', null)
            .limit(1);
          if (historyError) return NextResponse.json({ error: 'Could not verify trial eligibility' }, { status: 500 });
          trialAvailable = !priorSubscriptions?.length;
        }
      }
    }

    // Ordinary workspace members receive only the entitlement result. Stripe
    // customer/subscription details remain visible to owners and admins only.
    if (!billingRole) {
      return NextResponse.json({
        hasAccess: hasAccess === true,
        billingConfigured,
        canStartCheckout: false,
        canManageBilling: false,
        trialAvailable: null,
        subscriptionStatus: null,
        currentPeriodEnd: null,
        trialDays: null,
      }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
    }

    const { data: subscription, error } = await supabase
      .from('subscriptions')
      .select('status,current_period_end,stripe_customer_id,stripe_subscription_id')
      .eq('organization_id', organizationId.data)
      .maybeSingle();
    if (error) {
      return NextResponse.json({ error: 'Could not load subscription status' }, { status: 500 });
    }

    const currentPeriodEnd = subscription?.current_period_end ?? null;
    const trialDays = subscription?.status === 'trialing' && currentPeriodEnd
      ? Math.max(0, Math.ceil((Date.parse(currentPeriodEnd) - Date.now()) / 86_400_000))
      : null;

    return NextResponse.json({
      hasAccess: hasAccess === true,
      billingConfigured,
      trialAvailable,
      subscriptionStatus: subscription?.status ?? null,
      currentPeriodEnd,
      trialDays,
      canStartCheckout: billingRole && billingConfigured &&
        canStartCheckout(subscription?.status, subscription?.stripe_subscription_id),
      canManageBilling: billingRole && Boolean(
        process.env.STRIPE_SECRET_KEY &&
        process.env.NEXT_PUBLIC_APP_URL &&
        subscription?.stripe_customer_id,
      ),
    }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const unauthenticated = message === 'UNAUTHENTICATED';
    return NextResponse.json(
      { error: unauthenticated ? 'Authentication required' : 'Billing status unavailable' },
      { status: unauthenticated ? 401 : 503 },
    );
  }
}
