begin;

create or replace function public.bridge_entitlements_without_capacity_limits(p_entitlements jsonb)
returns jsonb
language sql
immutable
set search_path = public
as $$
  select coalesce(p_entitlements, '{}'::jsonb)
    || jsonb_build_object(
      'maxUsers', null,
      'maxBranches', null,
      'monthlyBondApplications', null
    )
$$;

update public.workspace_plan_catalog
set
  default_entitlements = public.bridge_entitlements_without_capacity_limits(default_entitlements),
  updated_at = now()
where default_entitlements is not null;

update public.workspace_subscriptions
set
  entitlements = public.bridge_entitlements_without_capacity_limits(entitlements),
  updated_at = now()
where entitlements is not null;

insert into public.workspace_entitlement_overrides (
  organisation_id,
  entitlement_key,
  entitlement_value,
  reason,
  expires_at
)
select
  organisation_id,
  entitlement_key,
  'null'::jsonb,
  'Capacity limits removed from workspace entitlements.',
  null
from public.workspace_subscriptions
cross join (values
  ('maxUsers'),
  ('maxBranches'),
  ('monthlyBondApplications')
) as capacity_limits(entitlement_key)
on conflict (organisation_id, entitlement_key)
do update set
  entitlement_value = excluded.entitlement_value,
  reason = excluded.reason,
  expires_at = null,
  updated_at = now();

create or replace function public.bridge_assert_workspace_entitlement_capacity(
  p_organisation_id uuid,
  p_entitlement_key text,
  p_next_count integer
)
returns void
language plpgsql
stable
set search_path = public
as $$
begin
  return;
end;
$$;

grant execute on function public.bridge_entitlements_without_capacity_limits(jsonb) to authenticated;
grant execute on function public.bridge_assert_workspace_entitlement_capacity(uuid, text, integer) to authenticated;

commit;
