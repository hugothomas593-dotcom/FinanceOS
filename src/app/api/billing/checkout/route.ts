import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/supabase/server';
import { billingReturnUrls, canStartCheckout, isAvenorFounderPrice } from '@/lib/stripe-billing';

const Schema = z.object({ organizationId: z.string().uuid() });
export async function POST(req: Request) {
  try {
    const { supabase, user } = await requireUser();
    const parsed = Schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Invalid checkout request' }, { status: 400 });
    const { data: member } = await supabase.from('organization_members').select('role').eq('organization_id', parsed.data.organizationId).eq('user_id', user.id).maybeSingle();
    if (!member || !['owner', 'admin'].includes(member.role)) return NextResponse.json({ error: 'Billing permission required' }, { status: 403 });

    const { data: existingSubscription, error: subscriptionError } = await supabase
      .from('subscriptions')
      .select('stripe_customer_id,stripe_subscription_id,status')
      .eq('organization_id', parsed.data.organizationId)
      .maybeSingle();
    if (subscriptionError) return NextResponse.json({ error: 'Could not verify the current subscription' }, { status: 500 });
    if (!canStartCheckout(existingSubscription?.status, existingSubscription?.stripe_subscription_id)) {
      return NextResponse.json(
        { error: 'A subscription is already linked to this workspace. Manage the existing subscription instead.' },
        { status: 409 },
      );
    }
    const secret = process.env.STRIPE_SECRET_KEY;
    const price = process.env.STRIPE_PRICE_ID;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL;
    if (!secret || !price || !appUrl || !process.env.STRIPE_WEBHOOK_SECRET || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ error: 'Billing is not fully configured. Stripe Checkout, webhooks and the server-side Supabase key are required.' }, { status: 503 });
    }
    let origin: URL;
    try { origin = new URL(appUrl); } catch { return NextResponse.json({ error: 'Invalid application URL configuration' }, { status: 503 }); }
    if (origin.protocol !== 'https:' && origin.hostname !== 'localhost') return NextResponse.json({ error: 'Application URL must use HTTPS' }, { status: 503 });

    const priceResponse = await fetch(
      `https://api.stripe.com/v1/prices/${encodeURIComponent(price)}`,
      {
        headers: { Authorization: `Bearer ${secret}` },
        signal: AbortSignal.timeout(10_000),
      },
    );
    const stripePrice = await priceResponse.json().catch(() => null);
    if (!priceResponse.ok || !isAvenorFounderPrice(stripePrice)) {
      return NextResponse.json(
        { error: 'The configured Stripe price must be active, EUR 59, and billed monthly.' },
        { status: 503 },
      );
    }

    const { successUrl, cancelUrl } = billingReturnUrls(appUrl);
    const params = new URLSearchParams({
      mode: 'subscription',
      'line_items[0][price]': price,
      'line_items[0][quantity]': '1',
      success_url: successUrl,
      cancel_url: cancelUrl,
      client_reference_id: parsed.data.organizationId,
      'metadata[organization_id]': parsed.data.organizationId,
      'subscription_data[metadata][organization_id]': parsed.data.organizationId,
    });
    if (existingSubscription?.stripe_customer_id) {
      params.set('customer', existingSubscription.stripe_customer_id);
    } else if (user.email) {
      params.set('customer_email', user.email);
    }
    const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secret}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Idempotency-Key': `avenor-checkout-${parsed.data.organizationId}-${user.id}-${Math.floor(Date.now() / 30_000)}`,
      },
      body: params,
      signal: AbortSignal.timeout(15_000),
    });
    const session = await response.json().catch(() => null);
    if (!response.ok || typeof session?.url !== 'string') return NextResponse.json({ error: 'Stripe could not create checkout session' }, { status: 502 });
    return NextResponse.json({ url: session.url });
  } catch (e) { const m = e instanceof Error ? e.message : ''; return NextResponse.json({ error: m === 'UNAUTHENTICATED' ? 'Authentication required' : 'Billing service unavailable' }, { status: m === 'UNAUTHENTICATED' ? 401 : 503 }); }
}
