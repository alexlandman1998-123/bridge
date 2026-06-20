update public.workspace_plan_catalog
set
  default_entitlements = jsonb_set(
    coalesce(default_entitlements, '{}'::jsonb),
    '{maxBranches}',
    'null'::jsonb,
    true
  ),
  updated_at = now()
where default_entitlements ? 'maxBranches';

update public.workspace_subscriptions
set
  entitlements = jsonb_set(
    coalesce(entitlements, '{}'::jsonb),
    '{maxBranches}',
    'null'::jsonb,
    true
  ),
  updated_at = now()
where entitlements ? 'maxBranches';

delete from public.workspace_entitlement_overrides
where entitlement_key = 'maxBranches';
