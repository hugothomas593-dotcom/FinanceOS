-- Lock the company-context table to signed-in workspace members only.
revoke all on table public.organization_contexts from public, anon, authenticated;
grant select, insert, update on table public.organization_contexts to authenticated;

-- Cover the user foreign key for deletion and lookup paths.
create index if not exists organization_contexts_updated_by_idx
  on public.organization_contexts(updated_by);