import { NextResponse } from 'next/server';
export async function GET() {
  const checks = { app: 'ok', supabase: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY), ai: Boolean(process.env.OPENAI_API_KEY), stripe: Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PRICE_ID) };
  return NextResponse.json({ status: 'ok', checks, note: 'Configuration status only; not a full production readiness or security certification.' });
}
