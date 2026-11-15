import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyStripeSignature } from '@/lib/stripe-webhook';

export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!secret || !serviceKey || !supabaseUrl) return NextResponse.json({ error: 'Webhook is not configured' }, { status: 503 });
  const raw = await req.text();
  if (raw.length > 1_000_000) return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
  if (!verifyStripeSignature(raw, req.headers.get('stripe-signature') ?? '', secret)) return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  let event: any;
  try { event = JSON.parse(raw); } catch { return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 }); }
  if (!event?.id || typeof event.id !== 'string' || !event?.type || !event?.data?.object) return NextResponse.json({ error: 'Invalid Stripe event payload' }, { status: 400 });
  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  // Stripe retries deliveries. The unique event ID makes successful processing idempotent.
  const { data: prior, error: priorError } = await supabase.from('stripe_webhook_events').select('event_id').eq('event_id', event.id).maybeSingle();
  if (priorError) return NextResponse.json({ error: 'Could not verify webhook idempotency' }, { status: 500 });
  if (prior) return NextResponse.json({ received: true, duplicate: true });

  try {
    const syncSubscription = async (sub: any, orgId?: string | null) => {
      if (typeof sub?.id !== 'string' || !sub.id.startsWith('sub_')) throw new Error('Invalid Stripe subscription payload');
      let organizationId = orgId || (typeof sub?.metadata?.organization_id === 'string' ? sub.metadata.organization_id : null);
      if (!organizationId && typeof sub?.id === 'string') {
        const { data: existing, error: lookupError } = await supabase
          .from('subscriptions')
          .select('organization_id')
          .eq('stripe_subscription_id', sub.id)
          .maybeSingle();
        if (lookupError) throw lookupError;
        organizationId = existing?.organization_id ?? null;
      }
      if (!organizationId) return;
      const { error } = await supabase.from('subscriptions').upsert({
        organization_id: organizationId,
        stripe_customer_id: typeof sub.customer === 'string' ? sub.customer : null,
        stripe_subscription_id: String(sub.id),
        status: String(sub.status ?? 'unknown'),
        current_period_end: sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'organization_id' });
      if (error) throw error;
    };

    if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
      const session = event.data.object;
      const orgId = typeof session.client_reference_id === 'string' ? session.client_reference_id : null;
      const subscriptionId = typeof session.subscription === 'string' ? session.subscription : null;
      if (orgId && session.mode === 'subscription' && subscriptionId) {
        const subscriptionResponse = await fetch(
          `https://api.stripe.com/v1/subscriptions/${encodeURIComponent(subscriptionId)}`,
          { headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` }, signal: AbortSignal.timeout(10_000) },
        );
        const subscription = await subscriptionResponse.json().catch(() => null);
        if (!subscriptionResponse.ok || !subscription?.id) throw new Error('Could not retrieve the completed Stripe subscription');
        await syncSubscription(subscription, orgId);
      }
    } else if (
      event.type === 'customer.subscription.created' ||
      event.type === 'customer.subscription.updated' ||
      event.type === 'customer.subscription.deleted'
    ) {
      await syncSubscription(event.data.object);
    }
    const { error: receiptError } = await supabase.from('stripe_webhook_events').insert({ event_id: event.id, event_type: event.type, processed_at: new Date().toISOString() });
    // A concurrent duplicate may win the unique constraint; Stripe can safely retry otherwise.
    if (receiptError && receiptError.code !== '23505') throw receiptError;
    return NextResponse.json({ received: true });
  } catch {
    return NextResponse.json({ error: 'Webhook processing failed; Stripe may retry this event' }, { status: 500 });
  }
}
