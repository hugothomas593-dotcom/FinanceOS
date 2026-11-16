import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { requireUser } from '@/lib/supabase/server';
import { enforceApiRateLimit } from '@/lib/rate-limit';

const Schema = z.object({
  organizationId: z.string().uuid(),
  confirmationName: z.string().trim().min(1).max(120),
  confirmationPhrase: z.literal('DELETE WORKSPACE'),
});

function error(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers: { 'Cache-Control': 'no-store' } });
}

/**
 * Permanently removes a workspace's active application data after the owner
 * explicitly confirms the exact workspace name. Any linked Stripe subscription
 * is canceled first; a still-open Checkout reservation blocks deletion.
 */
export async function POST(request: Request) {
  try {
    const { supabase, user } = await requireUser();
    const parsed = Schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return error('Invalid workspace deletion confirmation', 400);

    const { organizationId, confirmationName } = parsed.data;
    const { data: membership, error: membershipError } = await supabase
      .from('organization_members')
      .select('role')
      .eq('organization_id', organizationId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (membershipError) return error('Could not verify workspace ownership', 500);
    if (!membership || membership.role !== 'owner') {
      return error('Only the workspace owner can permanently delete workspace data', 403);
    }

    const rateLimit = await enforceApiRateLimit(user.id, 'workspaceDeletion');
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'A workspace deletion was already attempted recently. Please contact support if you need help.' },
        { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds), 'Cache-Control': 'no-store' } },
      );
    }

    const { data: organization, error: organizationError } = await supabase
      .from('organizations')
      .select('id,name')
      .eq('id', organizationId)
      .maybeSingle();
    if (organizationError) return error('Could not verify the workspace name', 500);
    if (!organization) return error('Workspace not found', 404);
    if (organization.name !== confirmationName) {
      return error('The workspace name does not match. No data was deleted.', 400);
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceRoleKey) return error('Secure workspace deletion is not configured', 503);

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const [{ data: subscription, error: subscriptionError }, { data: trialClaim, error: claimError }] = await Promise.all([
      admin.from('subscriptions')
        .select('stripe_subscription_id,status')
        .eq('organization_id', organizationId)
        .maybeSingle(),
      admin.from('billing_trial_claims')
        .select('checkout_session_id,stripe_subscription_id,state')
        .eq('organization_id', organizationId)
        .maybeSingle(),
    ]);
    if (subscriptionError || claimError) return error('Could not safely verify billing before deletion', 500);

    if (trialClaim?.state === 'reserved') {
      return error('A Checkout attempt is still being prepared or awaiting Stripe confirmation. Let it expire or finish before deleting the workspace.', 409);
    }

    const stripeSubscriptionId = subscription?.stripe_subscription_id || trialClaim?.stripe_subscription_id || null;
    if (stripeSubscriptionId && subscription?.status !== 'canceled' && subscription?.status !== 'incomplete_expired') {
      const stripeSecret = process.env.STRIPE_SECRET_KEY;
      if (!stripeSecret) return error('The linked subscription must be canceled before this workspace can be deleted.', 503);

      const response = await fetch(
        `https://api.stripe.com/v1/subscriptions/${encodeURIComponent(stripeSubscriptionId)}`,
        {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${stripeSecret}` },
          signal: AbortSignal.timeout(15_000),
        },
      );
      const result = await response.json().catch(() => null);
      if (!response.ok || result?.status !== 'canceled') {
        return error('Stripe could not confirm subscription cancellation. Workspace data was not deleted.', 502);
      }
    }

    // All workspace-owned application tables reference organizations with
    // ON DELETE CASCADE. Stripe webhook receipts are intentionally retained
    // separately so a delayed cancellation event can be acknowledged safely.
    const { data: deleted, error: deleteError } = await admin
      .from('organizations')
      .delete()
      .eq('id', organizationId)
      .select('id')
      .maybeSingle();
    if (deleteError || !deleted) {
      return error('The subscription was canceled, but workspace data could not be fully deleted. Contact support before retrying.', 500);
    }

    return NextResponse.json({
      deleted: true,
      organizationId,
      message: 'Workspace data was removed from the active Avenor database. Provider backups and legally required billing records follow their separate retention periods.',
    }, {
      headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
    });
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : '';
    const unauthenticated = message === 'UNAUTHENTICATED';
    return NextResponse.json(
      { error: unauthenticated ? 'Authentication required' : 'Workspace deletion unavailable' },
      { status: unauthenticated ? 401 : 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
