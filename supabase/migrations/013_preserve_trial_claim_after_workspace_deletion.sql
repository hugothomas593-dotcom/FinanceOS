-- Preserve one-time trial eligibility when a workspace is deleted.
-- The user owns the trial claim; the workspace is only its initial association.
alter table public.billing_trial_claims
  alter column organization_id drop not null;

alter table public.billing_trial_claims
  drop constraint if exists billing_trial_claims_organization_id_fkey;

alter table public.billing_trial_claims
  add constraint billing_trial_claims_organization_id_fkey
  foreign key (organization_id)
  references public.organizations(id)
  on delete set null;

comment on column public.billing_trial_claims.organization_id is
  'Workspace where the one-time trial was first claimed. NULL after workspace deletion; the per-user trial claim is retained to prevent repeat trials.';
