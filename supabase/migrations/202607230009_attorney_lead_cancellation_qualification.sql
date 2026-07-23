begin;

-- The phase-7 conversion RPC predates the canonical attorney professional
-- profile. Its cancellation branch accidentally reused the transfer-role
-- check, so a cancellation-qualified conveyancer could not be converted into
-- a cancellation matter through the direct RPC. Patch only those three
-- legacy fragments in the deployed definition. Failing closed if an older or
-- unexpected definition is present is intentional: silently replacing a
-- newer conversion workflow would be riskier than stopping the migration.
do $patch$
declare
  v_definition text;
  v_legacy_base_role_gate text := $legacy_base$
    if v_assignee_role not in (
      'owner', 'principal', 'partner', 'director', 'firm_admin', 'director_partner',
      'attorney', 'conveyancer', 'transfer_attorney', 'bond_attorney'
    ) then
      raise exception 'Choose an Attorney-qualified Matter owner';
    end if;$legacy_base$;
  v_updated_base_role_gate text := $updated_base$
    if v_assignee_role not in (
      'owner', 'principal', 'partner', 'director', 'firm_admin', 'director_partner',
      'attorney', 'conveyancer', 'transfer_attorney', 'bond_attorney', 'cancellation_attorney'
    ) then
      raise exception 'Choose an Attorney-qualified Matter owner';
    end if;$updated_base$;
  v_legacy_transfer_gate text := $legacy_transfer$
    if v_matter_type in ('transfer', 'cancellation') and v_assignee_role not in (
      'owner', 'principal', 'partner', 'director', 'firm_admin', 'director_partner',
      'attorney', 'conveyancer', 'transfer_attorney'
    ) then
      raise exception 'Choose a Transfer Attorney-qualified Matter owner';
    end if;$legacy_transfer$;
  v_updated_transfer_gate text := $updated_transfer$
    if v_matter_type = 'transfer' and v_assignee_role not in (
      'owner', 'principal', 'partner', 'director', 'firm_admin', 'director_partner',
      'attorney', 'conveyancer', 'transfer_attorney'
    ) then
      raise exception 'Choose a Transfer Attorney-qualified Matter owner';
    end if;$updated_transfer$;
  v_attorney_role_assignment text := $role_assignment$
    v_attorney_role := case
      when v_matter_type = 'bond' then 'bond_attorney'
      when v_matter_type = 'cancellation' then 'cancellation_attorney'
      else 'transfer_attorney'
    end;$role_assignment$;
  v_updated_attorney_role_assignment text := $updated_role_assignment$
    v_attorney_role := case
      when v_matter_type = 'bond' then 'bond_attorney'
      when v_matter_type = 'cancellation' then 'cancellation_attorney'
      else 'transfer_attorney'
    end;

    -- This is the canonical Phase-6 eligibility boundary. It validates the
    -- active member's professional role and cancellation practice
    -- qualification for the firm that will own the new assignment.
    if v_matter_type = 'cancellation'
      and not public.bridge_attorney_member_assignment_eligible(
        v_firm.id,
        v_assigned_user_id,
        v_attorney_role,
        'attorney',
        true
      ) then
      raise exception 'Choose a Cancellation Attorney-qualified Matter owner';
    end if;$updated_role_assignment$;
begin
  if to_regprocedure('public.bridge_convert_attorney_lead_to_matter(uuid,uuid,jsonb)') is null then
    raise exception 'Attorney Lead conversion RPC is missing; cancellation qualification patch was not applied';
  end if;

  select pg_get_functiondef('public.bridge_convert_attorney_lead_to_matter(uuid,uuid,jsonb)'::regprocedure)
  into v_definition;

  if position(v_legacy_base_role_gate in v_definition) = 0
    or position(v_legacy_transfer_gate in v_definition) = 0
    or position(v_attorney_role_assignment in v_definition) = 0 then
    raise exception 'Attorney Lead conversion RPC does not match the guarded legacy qualification shape; cancellation qualification patch was not applied';
  end if;

  v_definition := replace(v_definition, v_legacy_base_role_gate, v_updated_base_role_gate);
  v_definition := replace(v_definition, v_legacy_transfer_gate, v_updated_transfer_gate);
  v_definition := replace(v_definition, v_attorney_role_assignment, v_updated_attorney_role_assignment);

  execute v_definition;
end;
$patch$;

comment on function public.bridge_convert_attorney_lead_to_matter(uuid, uuid, jsonb) is
  'Explicit atomic Attorney Lead-to-Matter conversion that uses the canonical qualification boundary for cancellation matters.';

notify pgrst, 'reload schema';

commit;
