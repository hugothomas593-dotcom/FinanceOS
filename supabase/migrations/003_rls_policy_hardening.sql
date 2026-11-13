-- Explicitly qualify outer-table columns in policies to avoid ambiguous references.
drop policy if exists "finance roles can write actuals" on public.financial_actuals;
create policy "finance roles can write actuals" on public.financial_actuals
for all using (exists(select 1 from public.organization_members m where m.organization_id=financial_actuals.organization_id and m.user_id=auth.uid() and m.role in ('owner','admin','finance')))
with check (exists(select 1 from public.organization_members m where m.organization_id=financial_actuals.organization_id and m.user_id=auth.uid() and m.role in ('owner','admin','finance')));

drop policy if exists "finance roles can manage models" on public.model_versions;
create policy "finance roles can manage models" on public.model_versions
for all using (exists(select 1 from public.organization_members m where m.organization_id=model_versions.organization_id and m.user_id=auth.uid() and m.role in ('owner','admin','finance')))
with check (exists(select 1 from public.organization_members m where m.organization_id=model_versions.organization_id and m.user_id=auth.uid() and m.role in ('owner','admin','finance')));

drop policy if exists "finance roles can manage scenarios" on public.scenarios;
create policy "finance roles can manage scenarios" on public.scenarios
for all using (exists(select 1 from public.organization_members m where m.organization_id=scenarios.organization_id and m.user_id=auth.uid() and m.role in ('owner','admin','finance')))
with check (exists(select 1 from public.organization_members m where m.organization_id=scenarios.organization_id and m.user_id=auth.uid() and m.role in ('owner','admin','finance')));

drop policy if exists "admins can read audit events" on public.audit_events;
create policy "admins can read audit events" on public.audit_events
for select using (exists(select 1 from public.organization_members m where m.organization_id=audit_events.organization_id and m.user_id=auth.uid() and m.role in ('owner','admin')));
