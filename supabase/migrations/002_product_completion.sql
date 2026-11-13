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
