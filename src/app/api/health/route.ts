import { NextResponse } from 'next/server';

export async function GET() {
  const supabaseConfigured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  );

  // Vercel provides VERCEL_OIDC_TOKEN on deployments; VERCEL=1 alone does not
  // prove that the deployment has credentials accepted by AI Gateway.
  const aiGatewayIdentityAvailable = Boolean(
    process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN,
  );
  const stripeCheckoutConfigured = Boolean(
    process.env.STRIPE_SECRET_KEY &&
    process.env.STRIPE_PRICE_ID &&
    process.env.NEXT_PUBLIC_APP_URL,
  );
  const stripeWebhookConfigured = Boolean(
    process.env.STRIPE_WEBHOOK_SECRET &&
    process.env.SUPABASE_SERVICE_ROLE_KEY &&
    process.env.NEXT_PUBLIC_SUPABASE_URL,
  );

  return NextResponse.json({
    status: 'ok',
    checks: {
      app: true,
      supabase: supabaseConfigured,
      aiGatewayIdentity: aiGatewayIdentityAvailable,
      stripeCheckout: stripeCheckoutConfigured,
      stripeWebhook: stripeWebhookConfigured,
    },
    note: 'Configuration indicators only. AI provider billing, authenticated data access and live payment processing require separate end-to-end tests.',
  });
}
