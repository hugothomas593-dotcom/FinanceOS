-- Avenor finance operations: bank connections, invoices, cash planning,
-- approved forecast baselines, reconciliation mappings and weekly reporting.

create table public.financial_provider_credentials (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  provider text not null check (provider in ('powens')),
  provider_user_id bigint not null,
  encrypted_access_token text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.financial_provider_credentials enable row level security;
revoke all on table public.financial_provider_credentials from public, anon, authenticated;
grant all on table public.financial_provider_credentials to service_role;

create table public.financial_connection_states (
  state text primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.financial_connection_states enable row level security;
revoke all on table public.financial_connection_states from public, anon, authenticated;
grant all on table public.financial_connection_states to service_role;

create table public.financial_connections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  provider text not null check (provider in ('powens')),
  provider_connection_id text not null,
  institution_name text not null default 'Connected financial institution',
  status text not null default 'connected'
    check (status in ('connected','syncing','action_required','disconnected','error')),
  account_count integer not null default 0 check (account_count >= 0),
  last_synced_at timestamptz,
  last_sync_error text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, provider, provider_connection_id)
);
create index financial_connections_org_created_idx
  on public.financial_connections(organization_id, created_at desc);
alter table public.financial_connections enable row level security;
create policy "subscribers can read financial connections"
on public.financial_connections for select to authenticated
using (private.has_active_subscription(organization_id) and private.is_org_member(organization_id));
create policy "finance roles can insert financial connections"
on public.financial_connections for insert to authenticated
with check (
  private.has_active_subscription(organization_id)
  and exists (
    select 1 from public.organization_members m
    where m.organization_id = financial_connections.organization_id
      and m.user_id = (select auth.uid())
      and m.role in ('owner','admin','finance')
  )
);
create policy "finance roles can update financial connections"
on public.financial_connections for update to authenticated
using (
  private.has_active_subscription(organization_id)
  and exists (
    select 1 from public.organization_members m
    where m.organization_id = financial_connections.organization_id
      and m.user_id = (select auth.uid())
      and m.role in ('owner','admin','finance')
  )
)
with check (
  private.has_active_subscription(organization_id)
  and exists (
    select 1 from public.organization_members m
    where m.organization_id = financial_connections.organization_id
      and m.user_id = (select auth.uid())
      and m.role in ('owner','admin','finance')
  )
);
create policy "finance roles can delete financial connections"
on public.financial_connections for delete to authenticated
using (
  private.has_active_subscription(organization_id)
  and exists (
    select 1 from public.organization_members m
    where m.organization_id = financial_connections.organization_id
      and m.user_id = (select auth.uid())
      and m.role in ('owner','admin','finance')
  )
);

create table public.financial_invoices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  direction text not null check (direction in ('receivable','payable')),
  category text not null default 'other'
    check (category in ('revenue','cogs','payroll','opex','other')),
  invoice_number text,
  counterparty text not null,
  description text,
  issue_date date,
  due_date date not null,
  expected_cash_date date,
  amount numeric(20,2) not null check (amount > 0),
  currency char(3) not null default 'EUR',
  included_in_model boolean not null default true,
  status text not null default 'open' check (status in ('open','paid','void')),
  paid_at date,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint financial_invoices_paid_date_check check (status <> 'paid' or paid_at is not null)
);
create index financial_invoices_org_due_idx
  on public.financial_invoices(organization_id, due_date) where status = 'open';
alter table public.financial_invoices enable row level security;
create policy "subscribers can read financial invoices"
on public.financial_invoices for select to authenticated
using (private.has_active_subscription(organization_id) and private.is_org_member(organization_id));
create policy "finance roles can insert financial invoices"
on public.financial_invoices for insert to authenticated
with check (
  private.has_active_subscription(organization_id)
  and exists (select 1 from public.organization_members m
    where m.organization_id = financial_invoices.organization_id
      and m.user_id = (select auth.uid()) and m.role in ('owner','admin','finance'))
);
create policy "finance roles can update financial invoices"
on public.financial_invoices for update to authenticated
using (
  private.has_active_subscription(organization_id)
  and exists (select 1 from public.organization_members m
    where m.organization_id = financial_invoices.organization_id
      and m.user_id = (select auth.uid()) and m.role in ('owner','admin','finance'))
)
with check (
  private.has_active_subscription(organization_id)
  and exists (select 1 from public.organization_members m
    where m.organization_id = financial_invoices.organization_id
      and m.user_id = (select auth.uid()) and m.role in ('owner','admin','finance'))
);
create policy "finance roles can delete financial invoices"
on public.financial_invoices for delete to authenticated
using (
  private.has_active_subscription(organization_id)
  and exists (select 1 from public.organization_members m
    where m.organization_id = financial_invoices.organization_id
      and m.user_id = (select auth.uid()) and m.role in ('owner','admin','finance'))
);

create table public.financial_cash_positions (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  balance numeric(20,2) not null,
  as_of_date date not null,
  currency char(3) not null,
  source text not null default 'manual' check (source in ('manual','powens')),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.financial_cash_positions enable row level security;
create policy "subscribers can read cash positions"
on public.financial_cash_positions for select to authenticated
using (private.has_active_subscription(organization_id) and private.is_org_member(organization_id));
create policy "finance roles can insert cash positions"
on public.financial_cash_positions for insert to authenticated
with check (
  private.has_active_subscription(organization_id)
  and exists (select 1 from public.organization_members m
    where m.organization_id = financial_cash_positions.organization_id
      and m.user_id = (select auth.uid()) and m.role in ('owner','admin','finance'))
);
create policy "finance roles can update cash positions"
on public.financial_cash_positions for update to authenticated
using (
  private.has_active_subscription(organization_id)
  and exists (select 1 from public.organization_members m
    where m.organization_id = financial_cash_positions.organization_id
      and m.user_id = (select auth.uid()) and m.role in ('owner','admin','finance'))
)
with check (
  private.has_active_subscription(organization_id)
  and exists (select 1 from public.organization_members m
    where m.organization_id = financial_cash_positions.organization_id
      and m.user_id = (select auth.uid()) and m.role in ('owner','admin','finance'))
);

create table public.financial_forecast_baselines (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  model_version_id uuid not null references public.model_versions(id) on delete cascade,
  period date not null,
  category text not null check (category in ('revenue','cogs','payroll','opex','other')),
  forecast_amount numeric(20,2) not null,
  currency char(3) not null,
  captured_at timestamptz not null default now(),
  primary key (model_version_id, period, category)
);
create index financial_forecast_baselines_org_period_idx
  on public.financial_forecast_baselines(organization_id, period desc);
alter table public.financial_forecast_baselines enable row level security;
create policy "subscribers can read forecast baselines"
on public.financial_forecast_baselines for select to authenticated
using (private.has_active_subscription(organization_id) and private.is_org_member(organization_id));
create policy "finance roles can manage forecast baselines"
on public.financial_forecast_baselines for all to authenticated
using (
  private.has_active_subscription(organization_id)
  and exists (select 1 from public.organization_members m
    where m.organization_id = financial_forecast_baselines.organization_id
      and m.user_id = (select auth.uid()) and m.role in ('owner','admin','finance'))
)
with check (
  private.has_active_subscription(organization_id)
  and exists (select 1 from public.organization_members m
    where m.organization_id = financial_forecast_baselines.organization_id
      and m.user_id = (select auth.uid()) and m.role in ('owner','admin','finance'))
);

create table public.financial_category_mappings (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  metric_key text not null,
  forecast_category text not null check (forecast_category in ('revenue','cogs','payroll','opex','other','exclude')),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (organization_id, metric_key)
);
alter table public.financial_category_mappings enable row level security;
create policy "subscribers can read category mappings"
on public.financial_category_mappings for select to authenticated
using (private.has_active_subscription(organization_id) and private.is_org_member(organization_id));
create policy "finance roles can manage category mappings"
on public.financial_category_mappings for all to authenticated
using (
  private.has_active_subscription(organization_id)
  and exists (select 1 from public.organization_members m
    where m.organization_id = financial_category_mappings.organization_id
      and m.user_id = (select auth.uid()) and m.role in ('owner','admin','finance'))
)
with check (
  private.has_active_subscription(organization_id)
  and exists (select 1 from public.organization_members m
    where m.organization_id = financial_category_mappings.organization_id
      and m.user_id = (select auth.uid()) and m.role in ('owner','admin','finance'))
);

create table public.weekly_report_preferences (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  recipient_email text not null,
  enabled boolean not null default false,
  timezone text not null default 'Europe/Paris',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, user_id),
  constraint weekly_report_email_check check (recipient_email ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$')
);
alter table public.weekly_report_preferences enable row level security;
create policy "subscribers can read own weekly report preference"
on public.weekly_report_preferences for select to authenticated
using (
  user_id = (select auth.uid())
  and private.has_active_subscription(organization_id)
  and private.is_org_member(organization_id)
);
create policy "subscribers can insert own weekly report preference"
on public.weekly_report_preferences for insert to authenticated
with check (
  user_id = (select auth.uid())
  and private.has_active_subscription(organization_id)
  and private.is_org_member(organization_id)
);
create policy "subscribers can update own weekly report preference"
on public.weekly_report_preferences for update to authenticated
using (
  user_id = (select auth.uid())
  and private.has_active_subscription(organization_id)
  and private.is_org_member(organization_id)
)
with check (
  user_id = (select auth.uid())
  and private.has_active_subscription(organization_id)
  and private.is_org_member(organization_id)
);

create table public.weekly_report_deliveries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  week_start date not null,
  recipient_email text not null,
  status text not null check (status in ('sent','failed')),
  provider_message_id text,
  error_message text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (organization_id, user_id, week_start)
);
alter table public.weekly_report_deliveries enable row level security;
revoke all on table public.weekly_report_deliveries from public, anon, authenticated;
grant all on table public.weekly_report_deliveries to service_role;

-- Capture an immutable monthly operating baseline in the same transaction as
-- model approval. Later model edits do not rewrite the forecast that was approved.
create or replace function public.save_model_version(
  p_organization_id uuid,
  p_name text,
  p_status text,
  p_assumptions jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_model_id uuid;
  v_created_at timestamptz;
  v_month integer;
  v_period date;
  v_revenue numeric;
  v_opex numeric;
  v_cogs_ratio numeric;
  v_payroll numeric;
  v_other numeric;
  v_revenue_growth numeric;
  v_opex_growth numeric;
  v_currency char(3);
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if p_organization_id is null or p_name is null
    or length(trim(p_name)) < 2 or length(trim(p_name)) > 100
    or p_status not in ('draft','approved')
    or p_assumptions is null or jsonb_typeof(p_assumptions) <> 'object' then
    raise exception 'Invalid model version payload';
  end if;
  if not exists (
    select 1 from public.organization_members m
    where m.organization_id = p_organization_id and m.user_id = v_user_id
      and m.role in ('owner','admin','finance')
  ) then raise exception 'Insufficient workspace permissions'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text, 0));
  if p_status = 'approved' then
    update public.model_versions set status = 'archived'
    where organization_id = p_organization_id and status = 'approved';
  end if;

  insert into public.model_versions (organization_id,name,status,assumptions,created_by)
  values (p_organization_id,trim(p_name),p_status,p_assumptions,v_user_id)
  returning id,created_at into v_model_id,v_created_at;

  insert into public.audit_events (organization_id,actor_id,event_type,entity_type,entity_id,after_state)
  values (p_organization_id,v_user_id,'model_version.created','model_version',v_model_id,
    jsonb_build_object('name',trim(p_name),'status',p_status));

  if p_status = 'approved' then
    select base_currency into v_currency from public.organizations where id = p_organization_id;
    v_revenue := (p_assumptions->>'monthlyRevenue')::numeric;
    v_opex := (p_assumptions->>'monthlyOpexExPayroll')::numeric;
    v_cogs_ratio := (p_assumptions->>'cogsRatio')::numeric;
    v_payroll := (p_assumptions->>'existingMonthlyPayroll')::numeric;
    v_other := coalesce((p_assumptions->>'existingOtherNetCashAdjustments')::numeric,0);
    v_revenue_growth := coalesce((p_assumptions->>'monthlyRevenueGrowth')::numeric,0);
    v_opex_growth := coalesce((p_assumptions->>'monthlyOpexGrowth')::numeric,0);

    for v_month in 0..17 loop
      if v_month > 0 then
        v_revenue := v_revenue * (1 + v_revenue_growth);
        v_opex := v_opex * (1 + v_opex_growth);
      end if;
      v_period := (date_trunc('month', current_date)::date + make_interval(months => v_month))::date;
      insert into public.financial_forecast_baselines
        (organization_id,model_version_id,period,category,forecast_amount,currency)
      values
        (p_organization_id,v_model_id,v_period,'revenue',v_revenue,v_currency),
        (p_organization_id,v_model_id,v_period,'cogs',-(v_revenue * v_cogs_ratio),v_currency),
        (p_organization_id,v_model_id,v_period,'payroll',-v_payroll,v_currency),
        (p_organization_id,v_model_id,v_period,'opex',-v_opex,v_currency),
        (p_organization_id,v_model_id,v_period,'other',v_other,v_currency);
    end loop;
  end if;

  return jsonb_build_object('id',v_model_id,'name',trim(p_name),'status',p_status,'created_at',v_created_at);
end;
$$;
revoke all on function public.save_model_version(uuid,text,text,jsonb) from public, anon;
grant execute on function public.save_model_version(uuid,text,text,jsonb) to authenticated;
