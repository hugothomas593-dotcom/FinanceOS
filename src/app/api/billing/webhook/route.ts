import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createHmac, timingSafeEqual } from 'node:crypto';

function validStripeSignature(raw: string, header: string, secret: string): boolean {
  const fields = header.split(',').map(part => part.trim().split('='));
  const timestamp = fields.find(([key]) => key === 't')?.[1];
  const signatures = fields.filter(([key]) => key === 'v1').map(([, value]) => value).filter(Boolean);
  if (!timestamp || !/^\d+$/.test(timestamp) || !signatures.length) return false;
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
  const expected = createHmac('sha256', secret).update(`${timestamp}.${raw}`).digest();
  return signatures.some(value => {
    if (!/^[a-f0-9]{64}$/i.test(value)) return false;
    const received = Buffer.from(value, 'hex');
    return received.length === expected.length && timingSafeEqual(received, expected);
  });
}

export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!secret || !serviceKey || !supabaseUrl) return NextResponse.json({ error: 'Webhook is not configured' }, { status: 503 });
  const raw = await req.text();
  if (raw.length > 1_000_000) return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
  if (!validStripeSignature(raw, req.headers.get('stripe-signature') ?? '', secret)) return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  let event: any;
  try { event = JSON.parse(raw); } catch { return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 }); }
  if (!event?.id || typeof event.id !== 'string' || !event?.type || !event?.data?.object) return NextResponse.json({ error: 'Invalid Stripe event payload' }, { status: 400 });
  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  // Stripe retries deliveries. The unique event ID makes successful processing idempotent.
  const { data: prior } = await supabase.from('stripe_webhook_events').select('event_id').eq('event_id', event.id).maybeSingle();
  if (prior) return NextResponse.json({ received: true, duplicate: true });

  try {
    if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
      const session = event.data.object;
      const orgId = session.client_reference_id;
      if (typeof orgId === 'string' && session.mode === 'subscription' && typeof session.subscription === 'string') {
        const { error } = await supabase.from('subscriptions').upsert({ organization_id: orgId, stripe_customer_id: typeof session.customer === 'string' ? session.customer : null, stripe_subscription_id: session.subscription, status: 'incomplete', updated_at: new Date().toISOString() }, { onConflict: 'organization_id' });
        if (error) throw error;
      }
    } else if (event.type === 'customer.subscription.created' || event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
      const sub = event.data.object;
      const { error } = await supabase.from('subscriptions').update({ status: String(sub.status ?? 'unknown'), current_period_end: sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null, updated_at: new Date().toISOString() }).eq('stripe_subscription_id', sub.id);
      if (error) throw error;
    }
    const { error: receiptError } = await supabase.from('stripe_webhook_events').insert({ event_id: event.id, event_type: event.type, processed_at: new Date().toISOString() });
    // A concurrent duplicate may win the unique constraint; Stripe can safely retry otherwise.
    if (receiptError && receiptError.code !== '23505') throw receiptError;
    return NextResponse.json({ received: true });
  } catch {
    return NextResponse.json({ error: 'Webhook processing failed; Stripe may retry this event' }, { status: 500 });
  }
}
