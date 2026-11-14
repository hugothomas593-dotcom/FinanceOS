-- ===== 001_initial_schema.sql =====
-- FinanceOS multi-tenant foundation. Apply in a new Supabase project.
create extension if not exists pgcrypto;

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  country_code char(2) not null default 'FR',
  base_currency char(3) not null default 'EUR',
  created_at timestamptz not null default now()
);
create table public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','admin','finance','viewer')),
  created_at timestamptz not null default now(),
  primary key (organization_id,user_id)
);
create table public.financial_actuals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  period date not null,
  metric_key text not null,
  amount numeric(20,2) not null,
  currency char(3) not null default 'EUR',
  source text not null default 'manual',
  source_reference text,
  imported_at timestamptz not null default now(),
  unique (organization_id,period,metric_key,source_reference)
);
create table public.model_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  status text not null default 'draft' check (status in ('draft','approved','archived')),
  assumptions jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create table public.scenarios (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  model_version_id uuid references public.model_versions(id) on delete set null,
  name text not null,
  scenario_type text not null default 'custom',
  assumptions jsonb not null default '{}'::jsonb,
  outputs jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.copilot_threads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  created_by uuid references auth.users(id),
  title text,
  created_at timestamptz not null default now()
);
create table public.copilot_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.copilot_threads(id) on delete cascade,
  role text not null check (role in ('user','assistant','tool')),
  content text not null,
  evidence jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  actor_id uuid references auth.users(id),
  event_type text not null,
  entity_type text not null,
  entity_id uuid,
  before_state jsonb,
  after_state jsonb,
  created_at timestamptz not null default now()
);

create index financial_actuals_org_period_idx on public.financial_actuals(organization_id,period);
create index scenarios_org_created_idx on public.scenarios(organization_id,created_at desc);
create index copilot_threads_org_idx on public.copilot_threads(organization_id);

create function public.is_org_member(org_id uuid)
returns boolean language sql stable security definer set search_path=public
as $$ select exists (
  select 1 from public.organization_members m
  where m.organization_id=org_id and m.user_id=auth.uid()
); $$;

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.financial_actuals enable row level security;
alter table public.model_versions enable row level security;
alter table public.scenarios enable row level security;
alter table public.copilot_threads enable row level security;
alter table public.copilot_messages enable row level security;
alter table public.audit_events enable row level security;

create policy "members can read their organizations" on public.organizations
for select using (public.is_org_member(id));
create policy "members can read organization membership" on public.organization_members
for select using (public.is_org_member(organization_id));
create policy "members can read actuals" on public.financial_actuals
for select using (public.is_org_member(organization_id));
create policy "finance roles can write actuals" on public.financial_actuals
for all using (exists(select 1 from public.organization_members m where m.organization_id=organization_id and m.user_id=auth.uid() and m.role in ('owner','admin','finance')))
with check (exists(select 1 from public.organization_members m where m.organization_id=organization_id and m.user_id=auth.uid() and m.role in ('owner','admin','finance')));
create policy "members can read models" on public.model_versions
for select using (public.is_org_member(organization_id));
create policy "finance roles can manage models" on public.model_versions
for all using (exists(select 1 from public.organization_members m where m.organization_id=organization_id and m.user_id=auth.uid() and m.role in ('owner','admin','finance')))
with check (exists(select 1 from public.organization_members m where m.organization_id=organization_id and m.user_id=auth.uid() and m.role in ('owner','admin','finance')));
create policy "members can read scenarios" on public.scenarios
for select using (public.is_org_member(organization_id));
create policy "finance roles can manage scenarios" on public.scenarios
for all using (exists(select 1 from public.organization_members m where m.organization_id=organization_id and m.user_id=auth.uid() and m.role in ('owner','admin','finance')))
with check (exists(select 1 from public.organization_members m where m.organization_id=organization_id and m.user_id=auth.uid() and m.role in ('owner','admin','finance')));
create policy "members can read threads" on public.copilot_threads
for select using (public.is_org_member(organization_id));
create policy "members can create threads" on public.copilot_threads
for insert with check (public.is_org_member(organization_id) and created_by=auth.uid());
create policy "members can read messages in org threads" on public.copilot_messages
for select using (exists(select 1 from public.copilot_threads t where t.id=thread_id and public.is_org_member(t.organization_id)));
create policy "members can insert messages in org threads" on public.copilot_messages
for insert with check (exists(select 1 from public.copilot_threads t where t.id=thread_id and public.is_org_member(t.organization_id)));
create policy "admins can read audit events" on public.audit_events
for select using (exists(select 1 from public.organization_members m where m.organization_id=organization_id and m.user_id=auth.uid() and m.role in ('owner','admin')));
create policy "authenticated users can create audit events in org" on public.audit_events
for insert with check (public.is_org_member(organization_id) and actor_id=auth.uid());

-- Important: create organization + owner membership through a trusted server-side onboarding function.
-- Do not expose the Supabase service-role key in browser code.

-- ===== 002_product_completion.sql =====
-- FinanceOS product completion: imported actuals, onboarding and billing state.
alter table public.financial_actuals add column if not exists imported_at timestamptz not null default now();

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references public.organizations(id) on delete cascade,
  stripe_customer_id text,
  stripe_subscription_id text unique,
  status text not null default 'incomplete',
  current_period_end timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.subscriptions enable row level security;
drop policy if exists "organization admins can read subscription" on public.subscriptions;
create policy "organization admins can read subscription" on public.subscriptions
for select using (exists(select 1 from public.organization_members m where m.organization_id=subscriptions.organization_id and m.user_id=auth.uid() and m.role in ('owner','admin')));

create or replace function public.create_organization_with_owner(org_name text, country char(2) default 'FR', currency char(3) default 'EUR')
returns uuid language plpgsql security definer set search_path=public
as $$
declare new_org_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if length(trim(org_name)) < 2 or length(trim(org_name)) > 100 then raise exception 'Invalid organization name'; end if;
  if country !~ '^[A-Za-z]{2}$' then raise exception 'Invalid country code'; end if;
  if currency !~ '^[A-Za-z]{3}$' then raise exception 'Invalid currency code'; end if;
  insert into public.organizations(name,country_code,base_currency) values(trim(org_name),upper(country),upper(currency)) returning id into new_org_id;
  insert into public.organization_members(organization_id,user_id,role) values(new_org_id,auth.uid(),'owner');
  insert into public.audit_events(organization_id,actor_id,event_type,entity_type,entity_id,after_state)
    values(new_org_id,auth.uid(),'organization.created','organization',new_org_id,jsonb_build_object('name',trim(org_name)));
  return new_org_id;
end; $$;
revoke all on function public.create_organization_with_owner(text,char,char) from public;
grant execute on function public.create_organization_with_owner(text,char,char) to authenticated;

create index if not exists subscriptions_status_idx on public.subscriptions(status);

-- ===== 003_rls_policy_hardening.sql =====
-- Explicitly qualify outer-table columns in policies to avoid ambiguous references.
drop policy if exists "finance roles can write actuals" on public.financial_actuals;
create policy "finance roles can write actuals" on public.financial_actuals
for all using (exists(select 1 from public.organization_members m where m.organization_id=financial_actuals.organization_id and m.user_id=auth.uid() and m.role in ('owner','admin','finance')))
with check (exists(select 1 from public.organization_members m where m.organization_id=financial_actuals.organization_id and m.user_id=auth.uid() and m.role in ('owner','admin','finance')));

drop policy if exists "finance roles can manage models" on public.model_versions;
create policy "finance roles can manage models" on public.model_versions
for all using (exists(select 1 from public.organization_members m where m.organization_id=model_versions.organization_id and m.user_id=auth.uid() and m.role in ('owner','admin','finance')))
with check (exists(select 1 from public.organization_members m where m.organization_id=model_versions.organization_id and m.user_id=auth.uid() and m.role in ('owner','admin','finance')));

drop policy if exists "finance roles can manage scenarios" on public.scenarios;
create policy "finance roles can manage scenarios" on public.scenarios
for all using (exists(select 1 from public.organization_members m where m.organization_id=scenarios.organization_id and m.user_id=auth.uid() and m.role in ('owner','admin','finance')))
with check (exists(select 1 from public.organization_members m where m.organization_id=scenarios.organization_id and m.user_id=auth.uid() and m.role in ('owner','admin','finance')));

drop policy if exists "admins can read audit events" on public.audit_events;
create policy "admins can read audit events" on public.audit_events
for select using (exists(select 1 from public.organization_members m where m.organization_id=audit_events.organization_id and m.user_id=auth.uid() and m.role in ('owner','admin')));

-- ===== 004_stripe_webhook_idempotency.sql =====
-- Records successfully processed Stripe events so retries do not duplicate side effects.
create table if not exists public.stripe_webhook_events (
  event_id text primary key,
  event_type text not null,
  processed_at timestamptz not null default now()
);
alter table public.stripe_webhook_events enable row level security;
-- No client-facing policies: only the server's service-role client can access this table.

-- Migration 005: restrict SECURITY DEFINER function execution
-- Restrict execution of the SECURITY DEFINER membership helper.
-- RLS policies call this function as authenticated users; anonymous callers do not need it.
revoke all on function public.is_org_member(uuid) from public, anon;
grant execute on function public.is_org_member(uuid) to authenticated;
