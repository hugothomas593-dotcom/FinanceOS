-- Records successfully processed Stripe events so retries do not duplicate side effects.
create table if not exists public.stripe_webhook_events (
  event_id text primary key,
  event_type text not null,
  processed_at timestamptz not null default now()
);
alter table public.stripe_webhook_events enable row level security;
-- No client-facing policies: only the server's service-role client can access this table.
