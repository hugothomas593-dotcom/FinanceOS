import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { requireUser } from '@/lib/supabase/server';
import {
  AVENOR_TRIAL_DAYS,
  billingReturnUrls,
  canStartCheckout,
  isAvenorFounderPrice,
} from '@/lib/stripe-billing';

const Schema = z.object({ organizationId: z.string().uuid() });
const CHECKOUT_SESSION_LIFETIME_MS = 24 * 60 * 60 * 1000;
const RESERVATION_GRACE_MS = 10 * 60 * 1000;

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: Request) {
  let reservedUserId: string | null = null;
  let reservedOrganizationId: string | null = null;

  try {
    const { supabase, user } = await requireUser();
    const parsed = Schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return jsonError('Invalid checkout request', 400);

    const { organizationId } = parsed.data;
    const { data: member } = await supabase
      .from('organization_members')
      .select('role')
      .eq('organization_id', organizationId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (!member || !['owner', 'admin'].includes(member.role)) {
      return jsonError('Only a workspace owner or admin can start billing', 403);
    }

    const { data: existingSubscription, error: subscriptionError } = await supabase
      .from('subscriptions')
      .select('stripe_customer_id,stripe_subscription_id,status')
      .eq('organization_id', organizationId)
      .maybeSingle();
    if (subscriptionError) return jsonError('Could not verify the current subscription', 500);
    if (!canStartCheckout(existingSubscription?.status, existingSubscription?.stripe_subscription_id)) {
      return jsonError('A subscription is already linked to this workspace. Manage the existing subscription instead.', 409);
    }

    const secret = process.env.STRIPE_SECRET_KEY;
    const price = process.env.STRIPE_PRICE_ID;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (
      !secret || !price || !appUrl || !supabaseUrl || !serviceKey ||
      !process.env.STRIPE_WEBHOOK_SECRET
    ) {
      return jsonError('Billing is not fully configured. Stripe Checkout, webhooks and the server-side Supabase key are required.', 503);
    }

    let origin: URL;
    try {
      origin = new URL(appUrl);
    } catch {
      return jsonError('Invalid application URL configuration', 503);
    }
    if (origin.protocol !== 'https:' && origin.hostname !== 'localhost') {
      return jsonError('Application URL must use HTTPS', 503);
    }

    const priceResponse = await fetch(
      `https://api.stripe.com/v1/prices/${encodeURIComponent(price)}`,
      {
        headers: { Authorization: `Bearer ${secret}` },
        signal: AbortSignal.timeout(10_000),
      },
    );
    const stripePrice = await priceResponse.json().catch(() => null);
    if (!priceResponse.ok || !isAvenorFounderPrice(stripePrice)) {
      return jsonError('The configured Stripe price must be active, EUR 59, and billed monthly.', 503);
    }

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // The first successful Checkout attempt reserves the account's single trial.
    // A reservation is released only when Stripe confirms the Checkout expired.
    const { data: priorClaim, error: claimLookupError } = await admin
      .from('billing_trial_claims')
      .select('user_id,organization_id,checkout_session_id,state,created_at')
      .eq('user_id', user.id)
      .maybeSingle();
    if (claimLookupError) return jsonError('Could not verify free-trial eligibility', 500);

    if (priorClaim?.state === 'reserved') {
      const reservedAt = Date.parse(priorClaim.created_at);
      if (!Number.isFinite(reservedAt)) {
        return jsonError('The previous trial reservation needs support review before another Checkout can start.', 409);
      }
      const age = Date.now() - reservedAt;
      if (age < RESERVATION_GRACE_MS) {
        return jsonError('A free-trial Checkout is already being prepared. Complete or cancel that Checkout before trying again.', 409);
      }
      if (priorClaim.checkout_session_id) {
        const sessionResponse = await fetch(
          `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(priorClaim.checkout_session_id)}`,
          {
            headers: { Authorization: `Bearer ${secret}` },
            signal: AbortSignal.timeout(10_000),
          },
        );
        const session = await sessionResponse.json().catch(() => null);
        if (!sessionResponse.ok) {
          return jsonError('Could not verify the previous Checkout session. Please contact support before retrying.', 503);
        }
        if (session.status !== 'expired') {
          return jsonError('A previous Checkout session is still being processed. Please return to that session or contact support.', 409);
        }
      }
      const { error: releaseError } = await admin
        .from('billing_trial_claims')
        .delete()
        .eq('user_id', user.id)
        .eq('state', 'reserved');
      if (releaseError) return jsonError('Could not release the expired trial reservation', 500);
    }

    const { data: existingClaim, error: refreshedClaimError } = await admin
      .from('billing_trial_claims')
      .select('user_id,state,organization_id')
      .eq('user_id', user.id)
      .maybeSingle();
    if (refreshedClaimError) return jsonError('Could not verify free-trial eligibility', 500);

    let hasPriorSubscription = Boolean(existingSubscription?.stripe_subscription_id);
    if (!hasPriorSubscription) {
      const { data: memberships, error: membershipsError } = await admin
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.id);
      if (membershipsError) return jsonError('Could not verify subscription history', 500);
      const organizationIds = (memberships ?? []).map((row) => row.organization_id);
      if (organizationIds.length) {
        const { data: pastSubscriptions, error: pastSubscriptionsError } = await admin
          .from('subscriptions')
          .select('stripe_subscription_id')
          .in('organization_id', organizationIds)
          .not('stripe_subscription_id', 'is', null)
          .limit(1);
        if (pastSubscriptionsError) return jsonError('Could not verify subscription history', 500);
        hasPriorSubscription = Boolean(pastSubscriptions?.length);
      }
    }

    const trialEligible = !existingClaim && !hasPriorSubscription;
    if (!existingClaim) {
      const { error: reserveError } = await admin
        .from('billing_trial_claims')
        .insert({
          user_id: user.id,
          organization_id: organizationId,
          state: 'reserved',
        });
      if (reserveError) {
        if (reserveError.code === '23505') {
          return jsonError('A trial or Checkout is already linked to this account or workspace.', 409);
        }
        return jsonError('Could not reserve trial eligibility', 500);
      }
      reservedUserId = user.id;
      reservedOrganizationId = organizationId;
    }

    const { successUrl, cancelUrl } = billingReturnUrls(appUrl);
    const params = new URLSearchParams({
      mode: 'subscription',
      payment_method_collection: 'always',
      'line_items[0][price]': price,
      'line_items[0][quantity]': '1',
      success_url: successUrl,
      cancel_url: cancelUrl,
      client_reference_id: organizationId,
      'metadata[organization_id]': organizationId,
      'metadata[owner_user_id]': user.id,
      'subscription_data[metadata][organization_id]': organizationId,
      'subscription_data[metadata][owner_user_id]': user.id,
    });

    if (trialEligible) {
      params.set('subscription_data[trial_period_days]', String(AVENOR_TRIAL_DAYS));
      params.set('subscription_data[trial_settings][end_behavior][missing_payment_method]', 'cancel');
    }

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
        'Idempotency-Key': `avenor-checkout-${organizationId}-${user.id}-${Math.floor(Date.now() / 30_000)}`,
      },
      body: params,
      signal: AbortSignal.timeout(15_000),
    });
    const session = await response.json().catch(() => null);
    if (!response.ok || typeof session?.url !== 'string' || typeof session?.id !== 'string') {
      if (reservedUserId) {
        await admin.from('billing_trial_claims').delete().eq('user_id', reservedUserId).eq('organization_id', reservedOrganizationId);
        reservedUserId = null;
      }
      return jsonError('Stripe could not create Checkout. No subscription was started.', 502);
    }

    if (reservedUserId) {
      const { error: sessionLinkError } = await admin
        .from('billing_trial_claims')
        .update({ checkout_session_id: session.id })
        .eq('user_id', reservedUserId)
        .eq('organization_id', reservedOrganizationId);
      if (sessionLinkError) {
        // The session exists, but we deliberately do not expose it if the trial claim
        // cannot be tied to it. The reservation remains fail-closed for manual review.
        return jsonError('Checkout was created but the trial reservation could not be confirmed. Please contact support before retrying.', 503);
      }
    }

    return NextResponse.json({
      url: session.url,
      trialDays: trialEligible ? AVENOR_TRIAL_DAYS : 0,
      startsWithFreeTrial: trialEligible,
    });
  } catch (error) {
    if (reservedUserId && process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
      const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      await admin
        .from('billing_trial_claims')
        .delete()
        .eq('user_id', reservedUserId)
        .eq('organization_id', reservedOrganizationId)
        .eq('state', 'reserved');
    }
    const message = error instanceof Error ? error.message : '';
    const unauthenticated = message === 'UNAUTHENTICATED';
    return NextResponse.json(
      { error: unauthenticated ? 'Authentication required' : 'Billing service unavailable' },
      { status: unauthenticated ? 401 : 503 },
    );
  }
}
