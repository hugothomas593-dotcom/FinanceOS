-- Save and approve model versions atomically. This prevents an approval update
-- from archiving the current model if insertion of its replacement fails.
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
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if p_organization_id is null
    or p_name is null
    or length(trim(p_name)) < 2
    or length(trim(p_name)) > 100
    or p_status not in ('draft', 'approved')
    or p_assumptions is null
    or jsonb_typeof(p_assumptions) <> 'object' then
    raise exception 'Invalid model version payload';
  end if;

  if not exists (
    select 1
    from public.organization_members as m
    where m.organization_id = p_organization_id
      and m.user_id = v_user_id
      and m.role in ('owner', 'admin', 'finance')
  ) then
    raise exception 'Insufficient workspace permissions';
  end if;

  -- Serialise approval changes for a workspace even when two requests race.
  perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text, 0));

  if p_status = 'approved' then
    update public.model_versions
    set status = 'archived'
    where organization_id = p_organization_id
      and status = 'approved';
  end if;

  insert into public.model_versions (
    organization_id,
    name,
    status,
    assumptions,
    created_by
  )
  values (
    p_organization_id,
    trim(p_name),
    p_status,
    p_assumptions,
    v_user_id
  )
  returning id, created_at into v_model_id, v_created_at;

  insert into public.audit_events (
    organization_id,
    actor_id,
    event_type,
    entity_type,
    entity_id,
    after_state
  )
  values (
    p_organization_id,
    v_user_id,
    'model_version.created',
    'model_version',
    v_model_id,
    jsonb_build_object('name', trim(p_name), 'status', p_status)
  );

  return jsonb_build_object(
    'id', v_model_id,
    'name', trim(p_name),
    'status', p_status,
    'created_at', v_created_at
  );
end;
$$;

revoke all on function public.save_model_version(uuid, text, text, jsonb) from public, anon;
grant execute on function public.save_model_version(uuid, text, text, jsonb) to authenticated;
