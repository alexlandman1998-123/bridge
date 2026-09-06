begin;

create or replace function public.bridge_nominate_attorney_lane_firm(
  p_transaction_id uuid,
  p_attorney_role text,
  p_attorney_firm_id uuid,
  p_reason text default null
)
returns public.transaction_attorney_assignments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_role text := lower(trim(coalesce(p_attorney_role, '')));
  v_assignment_type text;
  v_target_firm public.attorney_firms;
  v_existing public.transaction_attorney_assignments;
  v_created public.transaction_attorney_assignments;
begin
  if v_actor_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if p_transaction_id is null or p_attorney_firm_id is null then
    raise exception 'Transaction and nominated firm are required.' using errcode = '22023';
  end if;
  if v_role not in ('bond_attorney', 'cancellation_attorney') then
    raise exception 'Only bond or cancellation firms may be nominated by the transfer attorney.' using errcode = '22023';
  end if;

  perform 1 from public.transactions where id = p_transaction_id for update;
  if not found then
    raise exception 'Transaction was not found.' using errcode = 'P0002';
  end if;

  if not exists (
    select 1
    from public.transaction_attorney_assignments assignment
    where assignment.transaction_id = p_transaction_id
      and coalesce(assignment.assignment_status, assignment.status) = 'active'
      and (
        lower(coalesce(assignment.attorney_role, '')) = 'transfer_attorney'
        or lower(coalesce(assignment.assignment_type, '')) in ('transfer', 'transfer_and_bond')
      )
      and v_actor_id in (assignment.attorney_user_id, assignment.primary_attorney_id, assignment.assigned_user_id)
  ) then
    raise exception 'Only the active transfer attorney for this matter may nominate the external firm.' using errcode = '42501';
  end if;

  select * into v_target_firm
  from public.attorney_firms firm
  where firm.id = p_attorney_firm_id
    and coalesce(firm.is_active, true) = true;
  if v_target_firm.id is null then
    raise exception 'The nominated attorney firm is not active.' using errcode = '22023';
  end if;

  select * into v_existing
  from public.transaction_attorney_assignments assignment
  where assignment.transaction_id = p_transaction_id
    and assignment.attorney_role = v_role
    and coalesce(assignment.assignment_status, assignment.status, 'pending') <> 'removed'
    and coalesce(assignment.allocation_state, '') <> 'declined'
  order by assignment.updated_at desc nulls last
  limit 1
  for update;

  if v_existing.id is not null then
    if coalesce(v_existing.attorney_firm_id, v_existing.firm_id) = p_attorney_firm_id
       and v_existing.allocation_state = 'awaiting_firm_acceptance' then
      return v_existing;
    end if;
    raise exception 'This matter already has an open nomination for the requested attorney lane.' using errcode = '23505';
  end if;

  v_assignment_type := case v_role when 'bond_attorney' then 'bond' else 'cancellation' end;

  insert into public.transaction_attorney_assignments (
    transaction_id, firm_id, attorney_firm_id, assignment_type, attorney_role, matter_type,
    instruction_status, assigned_organisation_id, scope_level, scope_metadata,
    primary_attorney_id, attorney_user_id, assigned_user_id, appointment_source,
    firm_acceptance_status, staff_assignment_status, allocation_state, allocation_state_changed_at,
    status, assignment_status, is_primary, visibility_scope,
    can_edit, can_manage_documents, can_manage_signing, can_add_internal_notes,
    can_add_shared_updates, can_update_workflow_lane, assigned_by, assigned_at
  ) values (
    p_transaction_id, v_target_firm.id, v_target_firm.id, v_assignment_type, v_role, v_assignment_type,
    'new_instruction', v_target_firm.organisation_id, 'organisation',
    jsonb_strip_nulls(jsonb_build_object(
      'source', 'transfer_attorney_nomination',
      'nominatedBy', v_actor_id,
      'nominationReason', nullif(trim(coalesce(p_reason, '')), ''),
      'firmFirstAllocation', true
    )),
    null, null, null, 'transfer_attorney_nomination',
    'awaiting_firm_acceptance', 'awaiting_staff_assignment', 'awaiting_firm_acceptance', now(),
    'pending', 'pending', true, 'firm_matter',
    true, true, true, true, true, true, v_actor_id, now()
  ) returning * into v_created;

  insert into public.transaction_events (
    transaction_id, event_type, event_data, created_by, created_by_role, visibility_scope
  ) values (
    p_transaction_id,
    'TransactionUpdated',
    jsonb_strip_nulls(jsonb_build_object(
      'originalEventType', 'AttorneyLaneFirmNominated',
      'attorneyRole', v_role,
      'assignmentId', v_created.id,
      'attorneyFirmId', v_target_firm.id,
      'attorneyFirmName', v_target_firm.name,
      'allocationState', 'awaiting_firm_acceptance',
      'source', 'transfer_attorney_nomination'
    )),
    v_actor_id,
    'transfer_attorney',
    'professional_shared'
  );

  return v_created;
end;
$$;

revoke all on function public.bridge_nominate_attorney_lane_firm(uuid, text, uuid, text) from public, anon;
grant execute on function public.bridge_nominate_attorney_lane_firm(uuid, text, uuid, text) to authenticated;

comment on function public.bridge_nominate_attorney_lane_firm(uuid, text, uuid, text) is
  'Phase 2 firm-first nomination boundary. Only the active transfer attorney can nominate a bond or cancellation firm; the nominated firm retains acceptance and staff-allocation authority.';

notify pgrst, 'reload schema';
commit;
