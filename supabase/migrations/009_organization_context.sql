-- Persistent founder-provided company context for Avenor Intelligence.
-- All access is workspace-scoped and enforced in Postgres as well as the API.

create table public.organization_contexts (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  context jsonb not null default '{}'::jsonb,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organization_contexts_context_object check (jsonb_typeof(context) = 'object')
);

alter table public.organization_contexts enable row level security;

-- New public-schema tables are not automatically Data-API exposed on current Supabase projects.
-- Grant only signed-in access; RLS below limits every row to an organization member.
grant select, insert, update on table public.organization_contexts to authenticated;

create policy "members can read organization context"
  on public.organization_contexts
  for select
  to authenticated
  using (private.is_org_member(organization_id));

create policy "finance roles can insert organization context"
  on public.organization_contexts
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.organization_members as m
      where m.organization_id = organization_contexts.organization_id
        and m.user_id = (select auth.uid())
        and m.role in ('owner', 'admin', 'finance')
    )
  );

create policy "finance roles can update organization context"
  on public.organization_contexts
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.organization_members as m
      where m.organization_id = organization_contexts.organization_id
        and m.user_id = (select auth.uid())
        and m.role in ('owner', 'admin', 'finance')
    )
  )
  with check (
    exists (
      select 1
      from public.organization_members as m
      where m.organization_id = organization_contexts.organization_id
        and m.user_id = (select auth.uid())
        and m.role in ('owner', 'admin', 'finance')
    )
  );

comment on table public.organization_contexts is
  'Founder-provided company context used to ground Avenor Copilot conversations; not accounting records.';
