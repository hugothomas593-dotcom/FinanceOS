drop policy if exists "members can insert assistant messages in own threads"
  on public.copilot_messages;
drop policy if exists "members can insert user messages in own threads"
  on public.copilot_messages;

create policy "members can insert own chat messages"
  on public.copilot_messages
  for insert
  to authenticated
  with check (
    role in ('user', 'assistant')
    and exists (
      select 1
      from public.copilot_threads t
      where t.id = copilot_messages.thread_id
        and t.created_by = (select auth.uid())
        and private.is_org_member(t.organization_id)
    )
  );
