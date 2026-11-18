-- Add covering indexes for foreign keys used by financial operations.
create index if not exists financial_cash_positions_updated_by_idx on public.financial_cash_positions(updated_by);
create index if not exists financial_category_mappings_updated_by_idx on public.financial_category_mappings(updated_by);
create index if not exists financial_connection_states_organization_id_idx on public.financial_connection_states(organization_id);
create index if not exists financial_connection_states_user_id_idx on public.financial_connection_states(user_id);
create index if not exists financial_connections_created_by_idx on public.financial_connections(created_by);
create index if not exists financial_invoices_created_by_idx on public.financial_invoices(created_by);
create index if not exists weekly_report_deliveries_user_id_idx on public.weekly_report_deliveries(user_id);
create index if not exists weekly_report_preferences_user_id_idx on public.weekly_report_preferences(user_id);

-- Keep member read access in the dedicated SELECT policies while limiting writes
-- to finance roles. This removes overlapping permissive SELECT policies.
drop policy if exists "finance roles can manage category mappings" on public.financial_category_mappings;
create policy "finance roles can insert category mappings"
on public.financial_category_mappings for insert to authenticated
with check (
  private.has_active_subscription(organization_id)
  and exists (select 1 from public.organization_members m
    where m.organization_id = financial_category_mappings.organization_id
      and m.user_id = (select auth.uid()) and m.role in ('owner','admin','finance'))
);
create policy "finance roles can update category mappings"
on public.financial_category_mappings for update to authenticated
using (
  private.has_active_subscription(organization_id)
  and exists (select 1 from public.organization_members m
    where m.organization_id = financial_category_mappings.organization_id
      and m.user_id = (select auth.uid()) and m.role in ('owner','admin','finance'))
)
with check (
  private.has_active_subscription(organization_id)
  and exists (select 1 from public.organization_members m
    where m.organization_id = financial_category_mappings.organization_id
      and m.user_id = (select auth.uid()) and m.role in ('owner','admin','finance'))
);
create policy "finance roles can delete category mappings"
on public.financial_category_mappings for delete to authenticated
using (
  private.has_active_subscription(organization_id)
  and exists (select 1 from public.organization_members m
    where m.organization_id = financial_category_mappings.organization_id
      and m.user_id = (select auth.uid()) and m.role in ('owner','admin','finance'))
);

drop policy if exists "finance roles can manage forecast baselines" on public.financial_forecast_baselines;
create policy "finance roles can insert forecast baselines"
on public.financial_forecast_baselines for insert to authenticated
with check (
  private.has_active_subscription(organization_id)
  and exists (select 1 from public.organization_members m
    where m.organization_id = financial_forecast_baselines.organization_id
      and m.user_id = (select auth.uid()) and m.role in ('owner','admin','finance'))
);
create policy "finance roles can update forecast baselines"
on public.financial_forecast_baselines for update to authenticated
using (
  private.has_active_subscription(organization_id)
  and exists (select 1 from public.organization_members m
    where m.organization_id = financial_forecast_baselines.organization_id
      and m.user_id = (select auth.uid()) and m.role in ('owner','admin','finance'))
)
with check (
  private.has_active_subscription(organization_id)
  and exists (select 1 from public.organization_members m
    where m.organization_id = financial_forecast_baselines.organization_id
      and m.user_id = (select auth.uid()) and m.role in ('owner','admin','finance'))
);
create policy "finance roles can delete forecast baselines"
on public.financial_forecast_baselines for delete to authenticated
using (
  private.has_active_subscription(organization_id)
  and exists (select 1 from public.organization_members m
    where m.organization_id = financial_forecast_baselines.organization_id
      and m.user_id = (select auth.uid()) and m.role in ('owner','admin','finance'))
);
