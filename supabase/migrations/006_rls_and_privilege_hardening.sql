-- Migration 006: tighten public RPC grants, RLS policy roles, and hot-path indexes.

-- The onboarding RPC is intentionally callable by signed-in users only.
revoke all on function public.create_organization_with_owner(text, char, char) from public, anon;
grant execute on function public.create_organization_with_owner(text, char, char) to authenticated;

-- Keep the membership helper outside PostgREST's exposed public schema.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create or replace function private.is_org_member(org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members as m
    where m.organization_id = org_id
      and m.user_id = (select auth.uid())
  );
$$;

revoke all on function private.is_org_member(uuid) from public, anon;
grant execute on function private.is_org_member(uuid) to authenticated;

-- Remove old permissive policies before replacing them with authenticated-only policies.
drop policy if exists "members can read their organizations" on public.organizations;
drop policy if exists "members can read organization membership" on public.organization_members;
drop policy if exists "members can read actuals" on public.financial_actuals;
drop policy if exists "finance roles can write actuals" on public.financial_actuals;
drop policy if exists "members can read models" on public.model_versions;
drop policy if exists "finance roles can manage models" on public.model_versions;
drop policy if exists "members can read scenarios" on public.scenarios;
drop policy if exists "finance roles can manage scenarios" on public.scenarios;
drop policy if exists "members can read threads" on public.copilot_threads;
drop policy if exists "members can create threads" on public.copilot_threads;
drop policy if exists "members can read messages in org threads" on public.copilot_messages;
drop policy if exists "members can insert messages in org threads" on public.copilot_messages;
drop policy if exists "admins can read audit events" on public.audit_events;
drop policy if exists "authenticated users can create audit events in org" on public.audit_events;
drop policy if exists "organization admins can read subscription" on public.subscriptions;

create policy "members can read their organizations" on public.organizations
for select to authenticated
using (private.is_org_member(id));

create policy "members can read organization membership" on public.organization_members
for select to authenticated
using (private.is_org_member(organization_id));

create policy "members can read actuals" on public.financial_actuals
for select to authenticated
using (private.is_org_member(organization_id));

create policy "finance roles can insert actuals" on public.financial_actuals
for insert to authenticated
with check (
  exists (
    select 1 from public.organization_members as m
    where m.organization_id = financial_actuals.organization_id
      and m.user_id = (select auth.uid())
      and m.role in ('owner','admin','finance')
  )
);

create policy "finance roles can update actuals" on public.financial_actuals
for update to authenticated
using (
  exists (
    select 1 from public.organization_members as m
    where m.organization_id = financial_actuals.organization_id
      and m.user_id = (select auth.uid())
      and m.role in ('owner','admin','finance')
  )
)
with check (
  exists (
    select 1 from public.organization_members as m
    where m.organization_id = financial_actuals.organization_id
      and m.user_id = (select auth.uid())
      and m.role in ('owner','admin','finance')
  )
);

create policy "finance roles can delete actuals" on public.financial_actuals
for delete to authenticated
using (
  exists (
    select 1 from public.organization_members as m
    where m.organization_id = financial_actuals.organization_id
      and m.user_id = (select auth.uid())
      and m.role in ('owner','admin','finance')
  )
);

create policy "members can read models" on public.model_versions
for select to authenticated
using (private.is_org_member(organization_id));

create policy "finance roles can insert models" on public.model_versions
for insert to authenticated
with check (
  exists (
    select 1 from public.organization_members as m
    where m.organization_id = model_versions.organization_id
      and m.user_id = (select auth.uid())
      and m.role in ('owner','admin','finance')
  )
);

create policy "finance roles can update models" on public.model_versions
for update to authenticated
using (
  exists (
    select 1 from public.organization_members as m
    where m.organization_id = model_versions.organization_id
      and m.user_id = (select auth.uid())
      and m.role in ('owner','admin','finance')
  )
)
with check (
  exists (
    select 1 from public.organization_members as m
    where m.organization_id = model_versions.organization_id
      and m.user_id = (select auth.uid())
      and m.role in ('owner','admin','finance')
  )
);

create policy "finance roles can delete models" on public.model_versions
for delete to authenticated
using (
  exists (
    select 1 from public.organization_members as m
    where m.organization_id = model_versions.organization_id
      and m.user_id = (select auth.uid())
      and m.role in ('owner','admin','finance')
  )
);

create policy "members can read scenarios" on public.scenarios
for select to authenticated
using (private.is_org_member(organization_id));

create policy "finance roles can insert scenarios" on public.scenarios
for insert to authenticated
with check (
  exists (
    select 1 from public.organization_members as m
    where m.organization_id = scenarios.organization_id
      and m.user_id = (select auth.uid())
      and m.role in ('owner','admin','finance')
  )
);

create policy "finance roles can update scenarios" on public.scenarios
for update to authenticated
using (
  exists (
    select 1 from public.organization_members as m
    where m.organization_id = scenarios.organization_id
      and m.user_id = (select auth.uid())
      and m.role in ('owner','admin','finance')
  )
)
with check (
  exists (
    select 1 from public.organization_members as m
    where m.organization_id = scenarios.organization_id
      and m.user_id = (select auth.uid())
      and m.role in ('owner','admin','finance')
  )
);

create policy "finance roles can delete scenarios" on public.scenarios
for delete to authenticated
using (
  exists (
    select 1 from public.organization_members as m
    where m.organization_id = scenarios.organization_id
      and m.user_id = (select auth.uid())
      and m.role in ('owner','admin','finance')
  )
);

create policy "members can read threads" on public.copilot_threads
for select to authenticated
using (private.is_org_member(organization_id));

create policy "members can create threads" on public.copilot_threads
for insert to authenticated
with check (
  private.is_org_member(organization_id)
  and created_by = (select auth.uid())
);

create policy "members can read messages in org threads" on public.copilot_messages
for select to authenticated
using (
  exists (
    select 1 from public.copilot_threads as t
    where t.id = copilot_messages.thread_id
      and private.is_org_member(t.organization_id)
  )
);

-- Browser clients may submit user prompts, but must not forge assistant or tool outputs.
create policy "members can insert user messages in org threads" on public.copilot_messages
for insert to authenticated
with check (
  role = 'user'
  and exists (
    select 1 from public.copilot_threads as t
    where t.id = copilot_messages.thread_id
      and private.is_org_member(t.organization_id)
  )
);

create policy "admins can read audit events" on public.audit_events
for select to authenticated
using (
  exists (
    select 1 from public.organization_members as m
    where m.organization_id = audit_events.organization_id
      and m.user_id = (select auth.uid())
      and m.role in ('owner','admin')
  )
);

create policy "members can create own audit events" on public.audit_events
for insert to authenticated
with check (
  private.is_org_member(organization_id)
  and actor_id = (select auth.uid())
);

create policy "organization admins can read subscription" on public.subscriptions
for select to authenticated
using (
  exists (
    select 1 from public.organization_members as m
    where m.organization_id = subscriptions.organization_id
      and m.user_id = (select auth.uid())
      and m.role in ('owner','admin')
  )
);

-- Stripe receipts are exclusively server-side data.
revoke all on table public.stripe_webhook_events from public, anon, authenticated;
grant all on table public.stripe_webhook_events to service_role;

-- Remove the former exposed helper after every policy has moved to private.is_org_member.
drop function if exists public.is_org_member(uuid);

-- Index foreign-key columns that are queried during joins, RLS checks and cascade operations.
create index if not exists audit_events_actor_id_idx on public.audit_events(actor_id);
create index if not exists audit_events_organization_id_idx on public.audit_events(organization_id);
create index if not exists copilot_messages_thread_id_idx on public.copilot_messages(thread_id);
create index if not exists copilot_threads_created_by_idx on public.copilot_threads(created_by);
create index if not exists model_versions_created_by_idx on public.model_versions(created_by);
create index if not exists model_versions_organization_id_idx on public.model_versions(organization_id);
create index if not exists organization_members_user_id_idx on public.organization_members(user_id);
create index if not exists scenarios_created_by_idx on public.scenarios(created_by);
create index if not exists scenarios_model_version_id_idx on public.scenarios(model_version_id);
