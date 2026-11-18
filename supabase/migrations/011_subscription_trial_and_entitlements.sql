-- Trial claims are server-only. One authenticated user may claim one free trial.
create table if not exists public.billing_trial_claims (
  user_id uuid primary key references auth.users(id) on delete cascade,
  organization_id uuid not null unique references public.organizations(id) on delete cascade,
  checkout_session_id text unique,
  stripe_subscription_id text unique,
  state text not null default 'reserved' check (state in ('reserved', 'claimed')),
  created_at timestamptz not null default now()
);

alter table public.billing_trial_claims enable row level security;
revoke all on table public.billing_trial_claims from public, anon, authenticated;
grant all on table public.billing_trial_claims to service_role;

-- Minimal, non-sensitive authorization primitive. The helper checks both
-- workspace membership and an unexpired trial/paid Stripe subscription.
create or replace function private.has_active_subscription(org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members as m
    join public.subscriptions as s
      on s.organization_id = m.organization_id
    where m.organization_id = org_id
      and m.user_id = (select auth.uid())
      and s.status in ('trialing', 'active')
      and s.current_period_end is not null
      and s.current_period_end > now()
  );
$$;

revoke all on function private.has_active_subscription(uuid) from public, anon;
grant execute on function private.has_active_subscription(uuid) to authenticated;

-- Expose only a boolean, never Stripe customer/subscription identifiers.
create or replace function public.has_organization_access(org_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select private.has_active_subscription(org_id);
$$;

revoke all on function public.has_organization_access(uuid) from public, anon;
grant execute on function public.has_organization_access(uuid) to authenticated;

-- Financial records: membership alone is no longer sufficient.
drop policy if exists "members can read actuals" on public.financial_actuals;
drop policy if exists "finance roles can insert actuals" on public.financial_actuals;
drop policy if exists "finance roles can update actuals" on public.financial_actuals;
drop policy if exists "finance roles can delete actuals" on public.financial_actuals;

create policy "subscribers can read actuals"
on public.financial_actuals for select to authenticated
using (private.has_active_subscription(organization_id));

create policy "subscribers in finance roles can insert actuals"
on public.financial_actuals for insert to authenticated
with check (
  private.has_active_subscription(organization_id)
  and exists (
    select 1 from public.organization_members as m
    where m.organization_id = financial_actuals.organization_id
      and m.user_id = (select auth.uid())
      and m.role in ('owner', 'admin', 'finance')
  )
);

create policy "subscribers in finance roles can update actuals"
on public.financial_actuals for update to authenticated
using (
  private.has_active_subscription(organization_id)
  and exists (
    select 1 from public.organization_members as m
    where m.organization_id = financial_actuals.organization_id
      and m.user_id = (select auth.uid())
      and m.role in ('owner', 'admin', 'finance')
  )
)
with check (
  private.has_active_subscription(organization_id)
  and exists (
    select 1 from public.organization_members as m
    where m.organization_id = financial_actuals.organization_id
      and m.user_id = (select auth.uid())
      and m.role in ('owner', 'admin', 'finance')
  )
);

create policy "subscribers in finance roles can delete actuals"
on public.financial_actuals for delete to authenticated
using (
  private.has_active_subscription(organization_id)
  and exists (
    select 1 from public.organization_members as m
    where m.organization_id = financial_actuals.organization_id
      and m.user_id = (select auth.uid())
      and m.role in ('owner', 'admin', 'finance')
  )
);

-- Saved model versions.
drop policy if exists "members can read models" on public.model_versions;
drop policy if exists "finance roles can insert models" on public.model_versions;
drop policy if exists "finance roles can update models" on public.model_versions;
drop policy if exists "finance roles can delete models" on public.model_versions;

create policy "subscribers can read models"
on public.model_versions for select to authenticated
using (private.has_active_subscription(organization_id));

create policy "subscribers in finance roles can insert models"
on public.model_versions for insert to authenticated
with check (
  private.has_active_subscription(organization_id)
  and exists (
    select 1 from public.organization_members as m
    where m.organization_id = model_versions.organization_id
      and m.user_id = (select auth.uid())
      and m.role in ('owner', 'admin', 'finance')
  )
);

create policy "subscribers in finance roles can update models"
on public.model_versions for update to authenticated
using (
  private.has_active_subscription(organization_id)
  and exists (
    select 1 from public.organization_members as m
    where m.organization_id = model_versions.organization_id
      and m.user_id = (select auth.uid())
      and m.role in ('owner', 'admin', 'finance')
  )
)
with check (
  private.has_active_subscription(organization_id)
  and exists (
    select 1 from public.organization_members as m
    where m.organization_id = model_versions.organization_id
      and m.user_id = (select auth.uid())
      and m.role in ('owner', 'admin', 'finance')
  )
);

create policy "subscribers in finance roles can delete models"
on public.model_versions for delete to authenticated
using (
  private.has_active_subscription(organization_id)
  and exists (
    select 1 from public.organization_members as m
    where m.organization_id = model_versions.organization_id
      and m.user_id = (select auth.uid())
      and m.role in ('owner', 'admin', 'finance')
  )
);

-- Saved scenarios.
drop policy if exists "members can read scenarios" on public.scenarios;
drop policy if exists "finance roles can insert scenarios" on public.scenarios;
drop policy if exists "finance roles can update scenarios" on public.scenarios;
drop policy if exists "finance roles can delete scenarios" on public.scenarios;

create policy "subscribers can read scenarios"
on public.scenarios for select to authenticated
using (private.has_active_subscription(organization_id));

create policy "subscribers in finance roles can insert scenarios"
on public.scenarios for insert to authenticated
with check (
  private.has_active_subscription(organization_id)
  and exists (
    select 1 from public.organization_members as m
    where m.organization_id = scenarios.organization_id
      and m.user_id = (select auth.uid())
      and m.role in ('owner', 'admin', 'finance')
  )
);

create policy "subscribers in finance roles can update scenarios"
on public.scenarios for update to authenticated
using (
  private.has_active_subscription(organization_id)
  and exists (
    select 1 from public.organization_members as m
    where m.organization_id = scenarios.organization_id
      and m.user_id = (select auth.uid())
      and m.role in ('owner', 'admin', 'finance')
  )
)
with check (
  private.has_active_subscription(organization_id)
  and exists (
    select 1 from public.organization_members as m
    where m.organization_id = scenarios.organization_id
      and m.user_id = (select auth.uid())
      and m.role in ('owner', 'admin', 'finance')
  )
);

create policy "subscribers in finance roles can delete scenarios"
on public.scenarios for delete to authenticated
using (
  private.has_active_subscription(organization_id)
  and exists (
    select 1 from public.organization_members as m
    where m.organization_id = scenarios.organization_id
      and m.user_id = (select auth.uid())
      and m.role in ('owner', 'admin', 'finance')
  )
);

-- Copilot threads and messages are not usable without entitlement.
drop policy if exists "members can create threads" on public.copilot_threads;
drop policy if exists "members can read own threads" on public.copilot_threads;
drop policy if exists "members can read threads" on public.copilot_threads;
drop policy if exists "members can read messages in own threads" on public.copilot_messages;
drop policy if exists "members can insert own chat messages" on public.copilot_messages;
drop policy if exists "members can insert user messages in own threads" on public.copilot_messages;
drop policy if exists "members can insert assistant messages in own threads" on public.copilot_messages;

create policy "subscribers can create own copilot threads"
on public.copilot_threads for insert to authenticated
with check (
  private.has_active_subscription(organization_id)
  and created_by = (select auth.uid())
  and private.is_org_member(organization_id)
);

create policy "subscribers can read own copilot threads"
on public.copilot_threads for select to authenticated
using (
  private.has_active_subscription(organization_id)
  and created_by = (select auth.uid())
  and private.is_org_member(organization_id)
);

create policy "subscribers can read own copilot messages"
on public.copilot_messages for select to authenticated
using (
  exists (
    select 1 from public.copilot_threads as t
    where t.id = copilot_messages.thread_id
      and t.created_by = (select auth.uid())
      and private.has_active_subscription(t.organization_id)
      and private.is_org_member(t.organization_id)
  )
);

create policy "subscribers can insert own copilot messages"
on public.copilot_messages for insert to authenticated
with check (
  role in ('user', 'assistant')
  and exists (
    select 1 from public.copilot_threads as t
    where t.id = copilot_messages.thread_id
      and t.created_by = (select auth.uid())
      and private.has_active_subscription(t.organization_id)
      and private.is_org_member(t.organization_id)
  )
);

-- Audit history is also part of the paid workspace.
drop policy if exists "admins can read audit events" on public.audit_events;
drop policy if exists "members can create own audit events" on public.audit_events;

create policy "subscribers admins can read audit events"
on public.audit_events for select to authenticated
using (
  private.has_active_subscription(organization_id)
  and exists (
    select 1 from public.organization_members as m
    where m.organization_id = audit_events.organization_id
      and m.user_id = (select auth.uid())
      and m.role in ('owner', 'admin')
  )
);

create policy "subscribers can create own audit events"
on public.audit_events for insert to authenticated
with check (
  private.has_active_subscription(organization_id)
  and private.is_org_member(organization_id)
  and actor_id = (select auth.uid())
);

-- Persisted company context is also part of the paid product.
drop policy if exists "members can read organization context" on public.organization_contexts;
drop policy if exists "finance roles can insert organization context" on public.organization_contexts;
drop policy if exists "finance roles can update organization context" on public.organization_contexts;

create policy "subscribers can read organization context"
on public.organization_contexts for select to authenticated
using (private.has_active_subscription(organization_id));

create policy "subscribers finance roles can insert organization context"
on public.organization_contexts for insert to authenticated
with check (
  private.has_active_subscription(organization_id)
  and exists (
    select 1 from public.organization_members as m
    where m.organization_id = organization_contexts.organization_id
      and m.user_id = (select auth.uid())
      and m.role in ('owner', 'admin', 'finance')
  )
);

create policy "subscribers finance roles can update organization context"
on public.organization_contexts for update to authenticated
using (
  private.has_active_subscription(organization_id)
  and exists (
    select 1 from public.organization_members as m
    where m.organization_id = organization_contexts.organization_id
      and m.user_id = (select auth.uid())
      and m.role in ('owner', 'admin', 'finance')
  )
)
with check (
  private.has_active_subscription(organization_id)
  and exists (
    select 1 from public.organization_members as m
    where m.organization_id = organization_contexts.organization_id
      and m.user_id = (select auth.uid())
      and m.role in ('owner', 'admin', 'finance')
  )
);
