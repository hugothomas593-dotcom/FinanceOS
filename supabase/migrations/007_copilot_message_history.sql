-- Avenor Copilot history: conversations are private to their creator inside a workspace.
-- Assistant responses can be appended only to the signed-in user's own thread.
-- No browser-visible privileged key is required.

drop policy if exists "members can read threads" on public.copilot_threads;
drop policy if exists "members can read messages in org threads" on public.copilot_messages;

create policy "members can read own threads"
on public.copilot_threads
for select to authenticated
using (
  created_by = (select auth.uid())
  and private.is_org_member(organization_id)
);

create policy "members can read messages in own threads"
on public.copilot_messages
for select to authenticated
using (
  exists (
    select 1
    from public.copilot_threads as t
    where t.id = copilot_messages.thread_id
      and t.created_by = (select auth.uid())
      and private.is_org_member(t.organization_id)
  )
);
drop policy if exists "members can insert user messages in org threads" on public.copilot_messages;
drop policy if exists "members can insert assistant messages in own threads" on public.copilot_messages;

create policy "members can insert user messages in own threads"
on public.copilot_messages
for insert to authenticated
with check (
  role = 'user'
  and exists (
    select 1
    from public.copilot_threads as t
    where t.id = copilot_messages.thread_id
      and t.created_by = (select auth.uid())
      and private.is_org_member(t.organization_id)
  )
);

create policy "members can insert assistant messages in own threads"
on public.copilot_messages
for insert to authenticated
with check (
  role = 'assistant'
  and exists (
    select 1
    from public.copilot_threads as t
    where t.id = copilot_messages.thread_id
      and t.created_by = (select auth.uid())
      and private.is_org_member(t.organization_id)
  )
);
