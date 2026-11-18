-- Shared, atomic per-user API rate limits for Vercel server routes.
-- This table is deliberately inaccessible to anon/authenticated clients.
create table if not exists public.api_rate_limits (
  user_id uuid not null references auth.users(id) on delete cascade,
  scope text not null check (length(scope) between 1 and 80),
  window_start timestamptz not null,
  request_count integer not null check (request_count > 0),
  primary key (user_id, scope, window_start)
);

create index if not exists api_rate_limits_window_start_idx
  on public.api_rate_limits (window_start);

alter table public.api_rate_limits enable row level security;
revoke all on table public.api_rate_limits from public, anon, authenticated;
grant all on table public.api_rate_limits to service_role;

create or replace function public.consume_api_rate_limit(
  p_user_id uuid,
  p_scope text,
  p_window_seconds integer,
  p_limit integer
)
returns table (
  allowed boolean,
  remaining integer,
  retry_after_seconds integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window_start timestamptz;
  v_count integer;
  v_retry_after integer;
begin
  if p_user_id is null
    or p_scope is null
    or length(p_scope) < 1
    or length(p_scope) > 80
    or p_window_seconds is null
    or p_window_seconds < 1
    or p_window_seconds > 86400
    or p_limit is null
    or p_limit < 1
    or p_limit > 10000 then
    raise exception 'Invalid rate limit parameters';
  end if;

  v_window_start := to_timestamp(
    floor(extract(epoch from clock_timestamp()) / p_window_seconds) * p_window_seconds
  );

  delete from public.api_rate_limits
  where user_id = p_user_id
    and window_start < clock_timestamp() - interval '2 days';

  insert into public.api_rate_limits as existing (
    user_id, scope, window_start, request_count
  )
  values (p_user_id, p_scope, v_window_start, 1)
  on conflict (user_id, scope, window_start)
  do update set request_count = existing.request_count + 1
  returning request_count into v_count;

  v_retry_after := greatest(
    1,
    ceil(extract(epoch from (
      v_window_start + make_interval(secs => p_window_seconds) - clock_timestamp()
    )))::integer
  );

  return query select
    v_count <= p_limit,
    greatest(0, p_limit - v_count),
    v_retry_after;
end;
$$;

revoke all on function public.consume_api_rate_limit(uuid, text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_api_rate_limit(uuid, text, integer, integer) to service_role;
