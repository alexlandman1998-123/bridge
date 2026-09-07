begin;

-- Phase 3: workspace creation must declare its creator as an owner at the
-- source. The older onboarding RPC is retained for compatibility, while this
-- version supplies an explicit owner contract before it performs any writes.
create or replace function public.bridge_complete_workspace_onboarding_v3(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payload jsonb := coalesce(payload, '{}'::jsonb);
  v_owner jsonb := coalesce(v_payload->'owner', '{}'::jsonb);
  v_contract jsonb := coalesce(v_payload->'role_contract', v_payload #> '{settings,roleContract}', '{}'::jsonb);
  v_settings jsonb := coalesce(v_payload->'settings', '{}'::jsonb);
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  -- The delegated legacy write is still protected by the owner-contract
  -- trigger. This flag only lets its role-governance trigger recognise this
  -- authenticated, atomic onboarding transaction.
  perform set_config('bridge.ownership_transfer', 'on', true);

  v_contract := v_contract || jsonb_build_object(
    'membership_role', 'owner',
    'membershipRole', 'owner',
    'workspace_role', 'owner',
    'workspaceRole', 'owner',
    'organisation_role', 'owner',
    'organisationRole', 'owner',
    'is_primary_owner', true,
    'isPrimaryOwner', true
  );
  v_owner := v_owner || jsonb_build_object(
    'user_id', auth.uid(),
    'workspace_role', 'owner',
    'organisation_role', 'owner',
    'membership_role', 'owner',
    'is_primary_owner', true
  );
  v_payload := v_payload || jsonb_build_object(
    'owner', v_owner,
    'role_contract', v_contract,
    'settings', v_settings || jsonb_build_object('roleContract', v_contract)
  );

  v_result := public.bridge_complete_workspace_onboarding(v_payload);
  if coalesce((v_result->>'success')::boolean, false) then
    v_result := v_result || jsonb_build_object(
      'workspace_role', 'owner',
      'organisation_role', 'owner',
      'membership_role', 'owner',
      'is_primary_owner', true,
      'onboarding_contract_version', 'phase3_primary_owner_source'
    );
  end if;
  return v_result;
end;
$$;

revoke all on function public.bridge_complete_workspace_onboarding_v3(jsonb) from public;
grant execute on function public.bridge_complete_workspace_onboarding_v3(jsonb) to authenticated;

commit;
