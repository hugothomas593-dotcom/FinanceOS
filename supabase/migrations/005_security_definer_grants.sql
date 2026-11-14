-- Restrict execution of the SECURITY DEFINER membership helper.
-- RLS policies call this function as authenticated users; anonymous callers do not need it.
revoke all on function public.is_org_member(uuid) from public, anon;
grant execute on function public.is_org_member(uuid) to authenticated;
