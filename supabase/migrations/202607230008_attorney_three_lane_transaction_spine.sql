begin;

-- The attorney workspace has always modelled three independent legal lanes,
-- but the write boundary still only recognised the retired generic
-- `process_type = 'attorney'` lane. Keep the privilege check in one helper so
-- documents and workflow state cannot be written across an attorney's own
-- matter or lane.
create or replace function public.bridge_attorney_lane_role(p_lane_key text)
returns text
language sql
immutable
strict
set search_path = public
as $$
  select case lower(trim(p_lane_key))
    when 'transfer' then 'transfer_attorney'
    when 'bond' then 'bond_attorney'
    when 'cancellation' then 'cancellation_attorney'
    else null
  end;
$$;

create or replace function public.bridge_can_mutate_attorney_lane(
  p_transaction_id uuid,
  p_attorney_role text,
  p_capability text default 'workflow'
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_role text := lower(trim(coalesce(p_attorney_role, '')));
  v_capability text := lower(trim(coalesce(p_capability, 'workflow')));
begin
  if p_transaction_id is null
    or v_actor_id is null
    or v_role not in ('transfer_attorney', 'bond_attorney', 'cancellation_attorney')
    or v_capability not in ('workflow', 'documents', 'internal_notes', 'shared_updates') then
    return false;
  end if;

  return exists (
    select 1
    from public.transaction_attorney_assignments assignment
    where assignment.transaction_id = p_transaction_id
      and coalesce(assignment.assignment_status, assignment.status, 'active') = 'active'
      -- `transfer_and_bond` is one canonical appointment which covers both
      -- lanes. Evaluate role/type independently so the transfer role stored on
      -- that legacy shape does not erase its bond entitlement.
      and case v_role
        when 'transfer_attorney' then
          lower(coalesce(assignment.attorney_role, '')) = 'transfer_attorney'
          or lower(coalesce(assignment.assignment_type, '')) in ('transfer', 'transfer_and_bond')
          or lower(coalesce(assignment.matter_type, '')) in ('transfer', 'transfer_and_bond')
        when 'bond_attorney' then
          lower(coalesce(assignment.attorney_role, '')) = 'bond_attorney'
          or lower(coalesce(assignment.assignment_type, '')) in ('bond', 'transfer_and_bond')
          or lower(coalesce(assignment.matter_type, '')) in ('bond', 'transfer_and_bond')
        when 'cancellation_attorney' then
          lower(coalesce(assignment.attorney_role, '')) = 'cancellation_attorney'
          or lower(coalesce(assignment.assignment_type, '')) in ('cancellation', 'bond_cancellation')
          or lower(coalesce(assignment.matter_type, '')) in ('cancellation', 'bond_cancellation')
        else false
      end
      and case v_capability
        when 'workflow' then
          coalesce(assignment.can_update_workflow_lane, true)
          and v_actor_id in (
            assignment.attorney_user_id,
            assignment.primary_attorney_id,
            assignment.assigned_user_id
          )
        when 'documents' then
          coalesce(assignment.can_manage_documents, true)
          and v_actor_id in (
            assignment.attorney_user_id,
            assignment.primary_attorney_id,
            assignment.assigned_user_id,
            assignment.secretary_id,
            assignment.admin_handler_id
          )
        when 'internal_notes' then
          coalesce(assignment.can_add_internal_notes, true)
          and v_actor_id in (
            assignment.attorney_user_id,
            assignment.primary_attorney_id,
            assignment.assigned_user_id
          )
        when 'shared_updates' then
          coalesce(assignment.can_add_shared_updates, true)
          and v_actor_id in (
            assignment.attorney_user_id,
            assignment.primary_attorney_id,
            assignment.assigned_user_id
          )
        else false
      end
  );
end;
$$;

revoke all on function public.bridge_can_mutate_attorney_lane(uuid, text, text) from public, anon;
grant execute on function public.bridge_can_mutate_attorney_lane(uuid, text, text) to authenticated;

-- Each policy requires the explicit lane/role pair. A transfer attorney cannot
-- use the document spine to write a bond or cancellation document, even when
-- both lanes exist on the same transaction.
drop policy if exists document_requests_attorney_lane_insert on public.document_requests;
create policy document_requests_attorney_lane_insert
  on public.document_requests
  for insert
  to authenticated
  with check (
    transaction_id is not null
    and lane_key in ('transfer', 'bond', 'cancellation')
    and attorney_role = public.bridge_attorney_lane_role(lane_key)
    and created_by = auth.uid()
    and requested_by = auth.uid()
    and public.bridge_can_mutate_attorney_lane(transaction_id, attorney_role, 'documents')
  );

drop policy if exists document_requests_attorney_lane_update on public.document_requests;
create policy document_requests_attorney_lane_update
  on public.document_requests
  for update
  to authenticated
  using (
    transaction_id is not null
    and lane_key in ('transfer', 'bond', 'cancellation')
    and attorney_role = public.bridge_attorney_lane_role(lane_key)
    and public.bridge_can_mutate_attorney_lane(transaction_id, attorney_role, 'documents')
  )
  with check (
    transaction_id is not null
    and lane_key in ('transfer', 'bond', 'cancellation')
    and attorney_role = public.bridge_attorney_lane_role(lane_key)
    and public.bridge_can_mutate_attorney_lane(transaction_id, attorney_role, 'documents')
  );

drop policy if exists documents_attorney_lane_insert on public.documents;
create policy documents_attorney_lane_insert
  on public.documents
  for insert
  to authenticated
  with check (
    transaction_id is not null
    and lane_key in ('transfer', 'bond', 'cancellation')
    and attorney_role = public.bridge_attorney_lane_role(lane_key)
    and uploaded_by_user_id = auth.uid()
    and public.bridge_can_mutate_attorney_lane(transaction_id, attorney_role, 'documents')
  );

drop policy if exists documents_attorney_lane_update on public.documents;
create policy documents_attorney_lane_update
  on public.documents
  for update
  to authenticated
  using (
    transaction_id is not null
    and lane_key in ('transfer', 'bond', 'cancellation')
    and attorney_role = public.bridge_attorney_lane_role(lane_key)
    and public.bridge_can_mutate_attorney_lane(transaction_id, attorney_role, 'documents')
  )
  with check (
    transaction_id is not null
    and lane_key in ('transfer', 'bond', 'cancellation')
    and attorney_role = public.bridge_attorney_lane_role(lane_key)
    and public.bridge_can_mutate_attorney_lane(transaction_id, attorney_role, 'documents')
  );

-- The workspace writes lanes and their steps directly while initialising and
-- advancing a matter. These policies deliberately derive authority from the
-- parent lane instead of trusting a client-supplied attorney role.
drop policy if exists transaction_subprocesses_attorney_lane_write on public.transaction_subprocesses;
drop policy if exists transaction_subprocesses_attorney_lane_insert on public.transaction_subprocesses;
drop policy if exists transaction_subprocesses_attorney_lane_update on public.transaction_subprocesses;
create policy transaction_subprocesses_attorney_lane_insert
  on public.transaction_subprocesses
  for insert
  to authenticated
  with check (
    process_type in ('transfer', 'bond', 'cancellation')
    and (attorney_role is null or attorney_role = public.bridge_attorney_lane_role(process_type))
    and public.bridge_can_mutate_attorney_lane(
      transaction_id,
      public.bridge_attorney_lane_role(process_type),
      'workflow'
    )
  );

create policy transaction_subprocesses_attorney_lane_update
  on public.transaction_subprocesses
  for update
  to authenticated
  using (
    process_type in ('transfer', 'bond', 'cancellation')
    and (attorney_role is null or attorney_role = public.bridge_attorney_lane_role(process_type))
    and public.bridge_can_mutate_attorney_lane(
      transaction_id,
      public.bridge_attorney_lane_role(process_type),
      'workflow'
    )
  )
  with check (
    process_type in ('transfer', 'bond', 'cancellation')
    and (attorney_role is null or attorney_role = public.bridge_attorney_lane_role(process_type))
    and public.bridge_can_mutate_attorney_lane(
      transaction_id,
      public.bridge_attorney_lane_role(process_type),
      'workflow'
    )
  );

drop policy if exists transaction_subprocess_steps_attorney_lane_write on public.transaction_subprocess_steps;
drop policy if exists transaction_subprocess_steps_attorney_lane_insert on public.transaction_subprocess_steps;
drop policy if exists transaction_subprocess_steps_attorney_lane_update on public.transaction_subprocess_steps;
create policy transaction_subprocess_steps_attorney_lane_insert
  on public.transaction_subprocess_steps
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.transaction_subprocesses lane
      where lane.id = transaction_subprocess_steps.subprocess_id
        and lane.process_type in ('transfer', 'bond', 'cancellation')
        and public.bridge_can_mutate_attorney_lane(
          lane.transaction_id,
          public.bridge_attorney_lane_role(lane.process_type),
          'workflow'
      )
    )
  );

create policy transaction_subprocess_steps_attorney_lane_update
  on public.transaction_subprocess_steps
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.transaction_subprocesses lane
      where lane.id = transaction_subprocess_steps.subprocess_id
        and lane.process_type in ('transfer', 'bond', 'cancellation')
        and public.bridge_can_mutate_attorney_lane(
          lane.transaction_id,
          public.bridge_attorney_lane_role(lane.process_type),
          'workflow'
        )
    )
  )
  with check (
    exists (
      select 1
      from public.transaction_subprocesses lane
      where lane.id = transaction_subprocess_steps.subprocess_id
        and lane.process_type in ('transfer', 'bond', 'cancellation')
        and public.bridge_can_mutate_attorney_lane(
          lane.transaction_id,
          public.bridge_attorney_lane_role(lane.process_type),
          'workflow'
        )
    )
  );

drop policy if exists transaction_attorney_lane_history_attorney_lane_insert on public.transaction_attorney_lane_history;
create policy transaction_attorney_lane_history_attorney_lane_insert
  on public.transaction_attorney_lane_history
  for insert
  to authenticated
  with check (
    lane_key in ('transfer', 'bond', 'cancellation')
    and attorney_role = public.bridge_attorney_lane_role(lane_key)
    and changed_by = auth.uid()
    and public.bridge_can_mutate_attorney_lane(transaction_id, attorney_role, 'workflow')
  );

drop policy if exists transaction_attorney_lane_updates_attorney_lane_insert on public.transaction_attorney_lane_updates;
create policy transaction_attorney_lane_updates_attorney_lane_insert
  on public.transaction_attorney_lane_updates
  for insert
  to authenticated
  with check (
    lane_key in ('transfer', 'bond', 'cancellation')
    and attorney_role = public.bridge_attorney_lane_role(lane_key)
    and created_by = auth.uid()
    and case
      when visibility = 'internal' then public.bridge_can_mutate_attorney_lane(transaction_id, attorney_role, 'internal_notes')
      else public.bridge_can_mutate_attorney_lane(transaction_id, attorney_role, 'shared_updates')
    end
  );

drop policy if exists attorney_workflow_blockers_attorney_lane_write on public.attorney_workflow_blockers;
drop policy if exists attorney_workflow_blockers_attorney_lane_insert on public.attorney_workflow_blockers;
drop policy if exists attorney_workflow_blockers_attorney_lane_update on public.attorney_workflow_blockers;
create policy attorney_workflow_blockers_attorney_lane_insert
  on public.attorney_workflow_blockers
  for insert
  to authenticated
  with check (
    lane_key in ('transfer', 'bond', 'cancellation')
    and attorney_role = public.bridge_attorney_lane_role(lane_key)
    and public.bridge_can_mutate_attorney_lane(transaction_id, attorney_role, 'workflow')
  );

create policy attorney_workflow_blockers_attorney_lane_update
  on public.attorney_workflow_blockers
  for update
  to authenticated
  using (
    lane_key in ('transfer', 'bond', 'cancellation')
    and attorney_role = public.bridge_attorney_lane_role(lane_key)
    and public.bridge_can_mutate_attorney_lane(transaction_id, attorney_role, 'workflow')
  )
  with check (
    lane_key in ('transfer', 'bond', 'cancellation')
    and attorney_role = public.bridge_attorney_lane_role(lane_key)
    and public.bridge_can_mutate_attorney_lane(transaction_id, attorney_role, 'workflow')
  );

-- Firm-first nominations can now use the same guarded lifecycle for transfer,
-- bond and cancellation. The selected primary must satisfy the canonical
-- professional qualification for the exact lane.
create or replace function public.bridge_manage_attorney_firm_allocation(
  p_assignment_id uuid,
  p_action text,
  p_attorney_user_id uuid default null,
  p_reason text default null
)
returns public.transaction_attorney_assignments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_assignment public.transaction_attorney_assignments;
  v_action text := lower(trim(coalesce(p_action, '')));
  v_now timestamptz := now();
  v_firm_id uuid;
  v_attorney_role text;
  v_legal_role text;
begin
  select * into v_assignment
  from public.transaction_attorney_assignments
  where id = p_assignment_id
  for update;

  if v_assignment.id is null then
    raise exception 'Attorney assignment was not found.' using errcode = 'P0002';
  end if;

  v_attorney_role := case
    when lower(coalesce(v_assignment.attorney_role, '')) in ('transfer_attorney', 'bond_attorney', 'cancellation_attorney')
      then lower(v_assignment.attorney_role)
    when lower(coalesce(v_assignment.assignment_type, v_assignment.matter_type, '')) = 'bond' then 'bond_attorney'
    when lower(coalesce(v_assignment.assignment_type, v_assignment.matter_type, '')) in ('cancellation', 'bond_cancellation') then 'cancellation_attorney'
    else 'transfer_attorney'
  end;
  v_legal_role := case v_attorney_role
    when 'bond_attorney' then 'bond'
    when 'cancellation_attorney' then 'cancellation'
    else 'transfer'
  end;

  v_firm_id := coalesce(v_assignment.attorney_firm_id, v_assignment.firm_id);
  if not public.attorney_user_is_firm_lead(v_firm_id) then
    raise exception 'Only an active firm administrator or director may manage this allocation.' using errcode = '42501';
  end if;

  if v_action = 'accept' then
    if v_assignment.allocation_state <> 'awaiting_firm_acceptance' then
      raise exception 'This firm nomination is not awaiting acceptance.' using errcode = '22023';
    end if;
    update public.transaction_attorney_assignments set
      firm_acceptance_status = 'accepted', firm_accepted_at = v_now, firm_accepted_by = auth.uid(),
      staff_assignment_status = 'awaiting_staff_assignment', allocation_state = 'awaiting_staff_assignment',
      allocation_state_changed_at = v_now, assignment_status = 'pending', status = 'pending'
    where id = p_assignment_id returning * into v_assignment;
  elsif v_action = 'decline' then
    if trim(coalesce(p_reason, '')) = '' then
      raise exception 'A decline reason is required.' using errcode = '22023';
    end if;
    if v_assignment.allocation_state not in ('awaiting_firm_acceptance', 'awaiting_staff_assignment', 'staff_assigned') then
      raise exception 'This allocation can no longer be declined.' using errcode = '22023';
    end if;
    update public.transaction_attorney_assignments set
      firm_acceptance_status = 'declined', firm_declined_at = v_now, firm_declined_by = auth.uid(),
      firm_decline_reason = trim(p_reason), allocation_state = 'declined', allocation_state_changed_at = v_now,
      instruction_status = 'declined', instruction_declined_at = v_now, instruction_declined_by = auth.uid(),
      instruction_decision_note = trim(p_reason), instruction_decision_source = 'firm_allocation_lifecycle',
      assignment_status = 'removed', status = 'removed'
    where id = p_assignment_id returning * into v_assignment;
  elsif v_action = 'assign_primary' then
    if v_assignment.firm_acceptance_status <> 'accepted' or v_assignment.allocation_state <> 'awaiting_staff_assignment' then
      raise exception 'The firm must accept the nomination before assigning a primary attorney.' using errcode = '22023';
    end if;
    if p_attorney_user_id is null or not public.bridge_attorney_member_assignment_eligible(
      v_firm_id, p_attorney_user_id, v_attorney_role, 'attorney', true
    ) then
      raise exception 'Primary attorney must be an active qualified member of the nominated firm.' using errcode = '22023';
    end if;
    update public.transaction_attorney_assignments set
      attorney_user_id = p_attorney_user_id, primary_attorney_id = p_attorney_user_id,
      assigned_user_id = p_attorney_user_id,
      staff_assignment_status = 'staff_assigned', allocation_state = 'staff_assigned', allocation_state_changed_at = v_now,
      assigned_by = auth.uid(), assigned_at = v_now, assignment_status = 'pending', status = 'pending'
    where id = p_assignment_id returning * into v_assignment;
  elsif v_action = 'activate' then
    if v_assignment.firm_acceptance_status <> 'accepted'
       or v_assignment.staff_assignment_status <> 'staff_assigned'
       or v_assignment.allocation_state <> 'staff_assigned'
       or coalesce(v_assignment.attorney_user_id, v_assignment.primary_attorney_id) is null then
      raise exception 'Firm acceptance and an eligible primary attorney are required before activation.' using errcode = '22023';
    end if;
    if not public.bridge_attorney_member_assignment_eligible(
      v_firm_id,
      coalesce(v_assignment.attorney_user_id, v_assignment.primary_attorney_id),
      v_attorney_role,
      'attorney',
      true
    ) then
      raise exception 'The assigned primary attorney is no longer an active qualified firm member.' using errcode = '22023';
    end if;
    update public.transaction_attorney_assignments set
      allocation_state = 'active', allocation_state_changed_at = v_now,
      assignment_status = 'active', status = 'active', instruction_status = 'accepted',
      instruction_accepted_at = v_now, instruction_accepted_by = auth.uid(),
      instruction_decision_source = 'firm_allocation_lifecycle'
    where id = p_assignment_id returning * into v_assignment;

    update public.transaction_role_players set
      user_id = coalesce(v_assignment.attorney_user_id, v_assignment.primary_attorney_id),
      assigned_user_id = coalesce(v_assignment.attorney_user_id, v_assignment.primary_attorney_id),
      status = 'active', assignment_status = 'active', activated_at = coalesce(activated_at, v_now), updated_at = v_now
    where transaction_id = v_assignment.transaction_id
      and role_type = v_attorney_role;

    update public.transaction_participants set
      user_id = coalesce(v_assignment.attorney_user_id, v_assignment.primary_attorney_id),
      assigned_user_id = coalesce(v_assignment.attorney_user_id, v_assignment.primary_attorney_id),
      status = 'active', accepted_at = coalesce(accepted_at, v_now), updated_at = v_now
    where transaction_id = v_assignment.transaction_id
      and (
        transaction_role = v_attorney_role
        or (role_type = 'attorney' and legal_role = v_legal_role)
      );
  else
    raise exception 'Unsupported attorney firm allocation action.' using errcode = '22023';
  end if;

  return v_assignment;
end;
$$;

revoke all on function public.bridge_manage_attorney_firm_allocation(uuid, text, uuid, text) from public, anon;
grant execute on function public.bridge_manage_attorney_firm_allocation(uuid, text, uuid, text) to authenticated;

comment on function public.bridge_can_mutate_attorney_lane(uuid, text, text) is
  'Transaction-scoped, lane-scoped attorney write boundary for workflow, documents and published updates.';
comment on function public.bridge_manage_attorney_firm_allocation(uuid, text, uuid, text) is
  'Atomically manages firm acceptance, qualified primary assignment and activation for transfer, bond and cancellation attorney lanes.';

notify pgrst, 'reload schema';
commit;
