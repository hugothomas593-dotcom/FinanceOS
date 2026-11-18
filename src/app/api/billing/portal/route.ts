import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/supabase/server';
import { billingPortalReturnUrl } from '@/lib/stripe-billing';

export async function POST(request: Request) {
  try {
    const { supabase, user } = await requireUser();
    const parsed = z.object({ organizationId: z.string().uuid() }).safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Invalid billing request' }, { status: 400 });

    const { data: member } = await supabase
      .from('organization_members')
      .select('role')
      .eq('organization_id', parsed.data.organizationId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (!member || !['owner', 'admin'].includes(member.role)) {
      return NextResponse.json({ error: 'Billing permission required' }, { status: 403 });
    }

    const secret = process.env.STRIPE_SECRET_KEY;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL;
    if (!secret || !appUrl) return NextResponse.json({ error: 'Billing portal is not configured' }, { status: 503 });

    const { data: subscription, error } = await supabase
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('organization_id', parsed.data.organizationId)
      .maybeSingle();
    if (error) return NextResponse.json({ error: 'Could not load billing customer' }, { status: 500 });
    if (!subscription?.stripe_customer_id) return NextResponse.json({ error: 'No Stripe customer is linked to this workspace' }, { status: 404 });

    const origin = new URL(appUrl);
    if (origin.protocol !== 'https:' && origin.hostname !== 'localhost') {
      return NextResponse.json({ error: 'Application URL must use HTTPS' }, { status: 503 });
    }

    const body = new URLSearchParams({
      customer: subscription.stripe_customer_id,
      return_url: billingPortalReturnUrl(appUrl),
    });
    const response = await fetch('https://api.stripe.com/v1/billing_portal/sessions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(15_000),
    });
    const session = await response.json().catch(() => null);
    if (!response.ok || typeof session?.url !== 'string') {
      return NextResponse.json({ error: 'Stripe could not open the billing portal' }, { status: 502 });
    }
    return NextResponse.json({ url: session.url });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const unauthenticated = message === 'UNAUTHENTICATED';
    return NextResponse.json(
      { error: unauthenticated ? 'Authentication required' : 'Billing portal unavailable' },
      { status: unauthenticated ? 401 : 503 },
    );
  }
}
