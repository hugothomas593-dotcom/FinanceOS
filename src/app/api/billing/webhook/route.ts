import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { stripeSubscriptionPeriodEnd, verifyStripeSignature } from '@/lib/stripe-webhook';

type StripeSubscription = {
  id?: string;
  customer?: string | { id?: string };
  status?: string;
  current_period_end?: number;
  metadata?: Record<string, string>;
};

function invoiceSubscriptionId(invoice: any): string | null {
  if (typeof invoice?.subscription === 'string') return invoice.subscription;
  const nested = invoice?.parent?.subscription_details?.subscription;
  return typeof nested === 'string' ? nested : null;
}

export async function POST(request: Request) {
  const signingSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const stripeSecret = process.env.STRIPE_SECRET_KEY;
  if (!signingSecret || !serviceKey || !supabaseUrl || !stripeSecret) {
    return NextResponse.json({ error: 'Webhook is not fully configured' }, { status: 503 });
  }

  const raw = await request.text();
  if (raw.length > 1_000_000) return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
  if (!verifyStripeSignature(raw, request.headers.get('stripe-signature') ?? '', signingSecret)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  let event: any;
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
  }
  if (!event?.id || typeof event.id !== 'string' || !event?.type || !event?.data?.object) {
    return NextResponse.json({ error: 'Invalid Stripe event payload' }, { status: 400 });
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Stripe retries events; record receipts only after every required state change succeeds.
  const { data: prior, error: priorError } = await admin
    .from('stripe_webhook_events')
    .select('event_id')
    .eq('event_id', event.id)
    .maybeSingle();
  if (priorError) return NextResponse.json({ error: 'Could not verify webhook idempotency' }, { status: 500 });
  if (prior) return NextResponse.json({ received: true, duplicate: true });

  const retrieveSubscription = async (subscriptionId: string): Promise<StripeSubscription> => {
    const response = await fetch(
      `https://api.stripe.com/v1/subscriptions/${encodeURIComponent(subscriptionId)}`,
      {
        headers: { Authorization: `Bearer ${stripeSecret}` },
        signal: AbortSignal.timeout(10_000),
      },
    );
    const subscription = await response.json().catch(() => null);
    if (!response.ok || !subscription?.id) {
      throw new Error('Could not retrieve the Stripe subscription');
    }
    return subscription as StripeSubscription;
  };

  const syncSubscription = async (
    subscription: StripeSubscription,
    organizationIdHint?: string | null,
    ownerUserIdHint?: string | null,
  ) => {
    if (typeof subscription.id !== 'string' || !subscription.id.startsWith('sub_')) {
      throw new Error('Invalid Stripe subscription payload');
    }

    const metadataOrganizationId = subscription.metadata?.organization_id;
    let organizationId = organizationIdHint ||
      (typeof metadataOrganizationId === 'string' ? metadataOrganizationId : null);
    if (!organizationId) {
      const { data: existing, error } = await admin
        .from('subscriptions')
        .select('organization_id')
        .eq('stripe_subscription_id', subscription.id)
        .maybeSingle();
      if (error) throw error;
      organizationId = existing?.organization_id ?? null;
    }
    if (!organizationId) throw new Error('Subscription is missing its Avenor workspace reference');

    const { data: workspace, error: workspaceError } = await admin
      .from('organizations')
      .select('id')
      .eq('id', organizationId)
      .maybeSingle();
    if (workspaceError) throw workspaceError;
    // A workspace owner may delete a workspace immediately after canceling its
    // Stripe subscription. A delayed signed cancellation webhook should still
    // be acknowledged rather than retried forever against a deleted FK target.
    if (!workspace) {
      if (subscription.status === 'canceled' || subscription.status === 'incomplete_expired') return;
      throw new Error('The referenced Avenor workspace no longer exists');
    }

    const customerId = typeof subscription.customer === 'string'
      ? subscription.customer
      : subscription.customer?.id ?? null;
    const periodEnd = stripeSubscriptionPeriodEnd(subscription);

    const { error: subscriptionError } = await admin
      .from('subscriptions')
      .upsert({
        organization_id: organizationId,
        stripe_customer_id: customerId,
        stripe_subscription_id: subscription.id,
        status: String(subscription.status ?? 'unknown'),
        current_period_end: periodEnd
          ? new Date(periodEnd * 1000).toISOString()
          : null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'organization_id' });
    if (subscriptionError) throw subscriptionError;

    const ownerUserId = ownerUserIdHint ||
      (typeof subscription.metadata?.owner_user_id === 'string'
        ? subscription.metadata.owner_user_id
        : null);
    if (ownerUserId) {
      const { error: claimError } = await admin
        .from('billing_trial_claims')
        .update({
          state: 'claimed',
          stripe_subscription_id: subscription.id,
        })
        .eq('user_id', ownerUserId)
        .eq('organization_id', organizationId);
      if (claimError) throw claimError;
    }
  };

  try {
    const object = event.data.object;

    if (event.type === 'checkout.session.expired' || event.type === 'checkout.session.async_payment_failed') {
      if (typeof object.id === 'string') {
        const organizationId = typeof object.client_reference_id === 'string'
          ? object.client_reference_id
          : object.metadata?.organization_id;
        const ownerUserId = object.metadata?.owner_user_id;
        let release = admin
          .from('billing_trial_claims')
          .delete()
          .eq('state', 'reserved')
          .eq('checkout_session_id', object.id);
        if (typeof ownerUserId === 'string') release = release.eq('user_id', ownerUserId);
        if (typeof organizationId === 'string') release = release.eq('organization_id', organizationId);
        const { error } = await release;
        if (error) throw error;
      }
    } else if (
      event.type === 'checkout.session.completed' ||
      event.type === 'checkout.session.async_payment_succeeded'
    ) {
      const organizationId = typeof object.client_reference_id === 'string'
        ? object.client_reference_id
        : object.metadata?.organization_id;
      const ownerUserId = typeof object.metadata?.owner_user_id === 'string'
        ? object.metadata.owner_user_id
        : null;
      const subscriptionId = typeof object.subscription === 'string'
        ? object.subscription
        : object.subscription?.id;
      if (object.mode === 'subscription' && typeof subscriptionId === 'string' && typeof organizationId === 'string') {
        const subscription = await retrieveSubscription(subscriptionId);
        await syncSubscription(subscription, organizationId, ownerUserId);
      }
    } else if (
      event.type === 'customer.subscription.created' ||
      event.type === 'customer.subscription.updated' ||
      event.type === 'customer.subscription.deleted' ||
      event.type === 'customer.subscription.trial_will_end'
    ) {
      await syncSubscription(object as StripeSubscription);
    } else if (event.type === 'invoice.paid' || event.type === 'invoice.payment_failed') {
      const subscriptionId = invoiceSubscriptionId(object);
      if (subscriptionId) {
        const subscription = await retrieveSubscription(subscriptionId);
        await syncSubscription(subscription);
      }
    }

    const { error: receiptError } = await admin
      .from('stripe_webhook_events')
      .insert({
        event_id: event.id,
        event_type: event.type,
        processed_at: new Date().toISOString(),
      });
    // A concurrent duplicate may win the unique constraint; Stripe can safely retry otherwise.
    if (receiptError && receiptError.code !== '23505') throw receiptError;
    return NextResponse.json({ received: true });
  } catch {
    return NextResponse.json({ error: 'Webhook processing failed; Stripe may retry this event' }, { status: 500 });
  }
}
