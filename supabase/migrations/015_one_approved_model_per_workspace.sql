-- Enforce at most one approved financial model per workspace, including
-- writes that bypass the application's model-version API.
create unique index if not exists model_versions_one_approved_per_org_idx
  on public.model_versions (organization_id)
  where status = 'approved';
