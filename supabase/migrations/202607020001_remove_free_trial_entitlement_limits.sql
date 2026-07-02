begin;

with unrestricted_free_trial as (
  select jsonb_build_object(
    'maxUsers', null,
    'maxBranches', null,
    'monthlyBondApplications', null,
    'reportingLevel', 'enterprise',
    'integrations', true,
    'customBranding', true,
    'apiAccess', true,
    'whiteLabel', true,
    'supportLevel', 'dedicated'
  ) as entitlements
)
update public.workspace_plan_catalog
set
  default_entitlements = unrestricted_free_trial.entitlements,
  updated_at = now()
from unrestricted_free_trial
where plan_key = 'free_trial';

with unrestricted_free_trial as (
  select jsonb_build_object(
    'maxUsers', null,
    'maxBranches', null,
    'monthlyBondApplications', null,
    'reportingLevel', 'enterprise',
    'integrations', true,
    'customBranding', true,
    'apiAccess', true,
    'whiteLabel', true,
    'supportLevel', 'dedicated'
  ) as entitlements
)
update public.workspace_subscriptions
set
  entitlements = unrestricted_free_trial.entitlements,
  metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
    'freeTrialRestrictionsRemovedAt', now(),
    'freeTrialRestrictionsRemovedBy', '202607020001_remove_free_trial_entitlement_limits'
  ),
  updated_at = now()
from unrestricted_free_trial
where plan_key = 'free_trial';

commit;
