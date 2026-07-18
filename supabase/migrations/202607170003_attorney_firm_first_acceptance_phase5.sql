begin;

alter table public.transaction_attorney_assignments
  add column if not exists appointment_source text,
  add column if not exists preferred_contact_name text,
  add column if not exists preferred_contact_email text,
  add column if not exists preferred_contact_phone text,
  add column if not exists preferred_attorney_user_id uuid references auth.users(id) on delete set null,
  add column if not exists firm_acceptance_status text not null default 'not_required',
  add column if not exists firm_accepted_at timestamptz,
  add column if not exists firm_accepted_by uuid references auth.users(id) on delete set null,
  add column if not exists firm_declined_at timestamptz,
  add column if not exists firm_declined_by uuid references auth.users(id) on delete set null,
  add column if not exists firm_decline_reason text,
  add column if not exists staff_assignment_status text not null default 'not_required',
  add column if not exists allocation_state text not null default 'active',
  add column if not exists allocation_state_changed_at timestamptz not null default now();

-- Normalize compatible draft names before tightening the lifecycle constraints.
update public.transaction_attorney_assignments
set firm_acceptance_status = 'awaiting_firm_acceptance'
where firm_acceptance_status = 'pending';

update public.transaction_attorney_assignments
set staff_assignment_status = case
  when staff_assignment_status = 'assigned' then 'staff_assigned'
  else 'awaiting_staff_assignment'
end
where staff_assignment_status in ('pending', 'assigned');

alter table public.transaction_attorney_assignments
  drop constraint if exists transaction_attorney_assignments_firm_acceptance_status_check;
alter table public.transaction_attorney_assignments
  add constraint transaction_attorney_assignments_firm_acceptance_status_check
  check (firm_acceptance_status in ('not_required', 'awaiting_firm_acceptance', 'accepted', 'declined'));

alter table public.transaction_attorney_assignments
  drop constraint if exists transaction_attorney_assignments_staff_assignment_status_check;
alter table public.transaction_attorney_assignments
  add constraint transaction_attorney_assignments_staff_assignment_status_check
  check (staff_assignment_status in ('not_required', 'awaiting_staff_assignment', 'staff_assigned'));

alter table public.transaction_attorney_assignments
  drop constraint if exists transaction_attorney_assignments_allocation_state_check;
alter table public.transaction_attorney_assignments
  add constraint transaction_attorney_assignments_allocation_state_check
  check (allocation_state in ('awaiting_firm_acceptance', 'awaiting_staff_assignment', 'staff_assigned', 'active', 'declined', 'removed'));

update public.transaction_attorney_assignments
set
  firm_acceptance_status = case
    when coalesce(assignment_status, status) = 'removed' then coalesce(nullif(firm_acceptance_status, 'not_required'), 'declined')
    when coalesce(assignment_status, status) = 'pending' and coalesce(attorney_user_id, primary_attorney_id) is null then 'awaiting_firm_acceptance'
    else firm_acceptance_status
  end,
  staff_assignment_status = case
    when coalesce(attorney_user_id, primary_attorney_id) is not null then 'staff_assigned'
    when coalesce(assignment_status, status) = 'pending' and coalesce(attorney_user_id, primary_attorney_id) is null then 'awaiting_staff_assignment'
    else staff_assignment_status
  end,
  allocation_state = case
    when coalesce(assignment_status, status) = 'removed' then 'removed'
    when coalesce(assignment_status, status) = 'pending' and coalesce(attorney_user_id, primary_attorney_id) is null then 'awaiting_firm_acceptance'
    when firm_acceptance_status = 'accepted' and coalesce(attorney_user_id, primary_attorney_id) is null then 'awaiting_staff_assignment'
    when firm_acceptance_status = 'accepted' and coalesce(attorney_user_id, primary_attorney_id) is not null then 'staff_assigned'
    else allocation_state
  end
where coalesce(attorney_role, '') = 'transfer_attorney'
   or coalesce(assignment_type, '') in ('transfer', 'transfer_and_bond');

create index if not exists transaction_attorney_assignments_firm_allocation_idx
  on public.transaction_attorney_assignments (attorney_firm_id, allocation_state, updated_at desc)
  where attorney_role = 'transfer_attorney' and is_primary = true;

create or replace function public.bridge_manage_transfer_firm_allocation(
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
begin
  select * into v_assignment
  from public.transaction_attorney_assignments
  where id = p_assignment_id
  for update;

  if v_assignment.id is null then
    raise exception 'Transfer attorney assignment was not found.' using errcode = 'P0002';
  end if;
  if coalesce(v_assignment.attorney_role, '') <> 'transfer_attorney'
     and coalesce(v_assignment.assignment_type, '') not in ('transfer', 'transfer_and_bond') then
    raise exception 'Only transfer attorney allocations use this lifecycle.' using errcode = '22023';
  end if;

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
    if not exists (
      select 1 from public.attorney_firm_members member
      where member.firm_id = v_firm_id and member.user_id = p_attorney_user_id and member.status = 'active'
        and member.role in ('transfer_attorney', 'director_partner', 'firm_admin')
    ) then
      raise exception 'Primary attorney must be an active eligible member of the nominated firm.' using errcode = '22023';
    end if;
    update public.transaction_attorney_assignments set
      attorney_user_id = p_attorney_user_id, primary_attorney_id = p_attorney_user_id,
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
    if not exists (
      select 1 from public.attorney_firm_members member
      where member.firm_id = v_firm_id
        and member.user_id = coalesce(v_assignment.attorney_user_id, v_assignment.primary_attorney_id)
        and member.status = 'active'
        and member.role in ('transfer_attorney', 'director_partner', 'firm_admin')
    ) then
      raise exception 'The assigned primary attorney is no longer an active eligible firm member.' using errcode = '22023';
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
    where transaction_id = v_assignment.transaction_id and role_type = 'transfer_attorney';

    update public.transaction_participants set
      user_id = coalesce(v_assignment.attorney_user_id, v_assignment.primary_attorney_id),
      assigned_user_id = coalesce(v_assignment.attorney_user_id, v_assignment.primary_attorney_id),
      status = 'active', accepted_at = coalesce(accepted_at, v_now), updated_at = v_now
    where transaction_id = v_assignment.transaction_id
      and (transaction_role = 'transfer_attorney' or (role_type = 'attorney' and legal_role = 'transfer'));
  else
    raise exception 'Unsupported transfer firm allocation action.' using errcode = '22023';
  end if;

  return v_assignment;
end;
$$;

grant execute on function public.bridge_manage_transfer_firm_allocation(uuid, text, uuid, text) to authenticated;

create or replace function public.bridge_guard_transfer_firm_activation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.instruction_status = 'accepted'
     and new.instruction_status is distinct from old.instruction_status
     and (
       new.allocation_state in ('awaiting_firm_acceptance', 'awaiting_staff_assignment', 'staff_assigned')
       or coalesce(new.appointment_source, '') in ('agent_firm_nomination', 'agent_nomination', 'agency_preferred', 'seller_nomination')
     )
     and (
       new.firm_acceptance_status <> 'accepted'
       or new.staff_assignment_status <> 'staff_assigned'
       or coalesce(new.attorney_user_id, new.primary_attorney_id) is null
     ) then
    raise exception 'Firm acceptance and a primary attorney are required before activation.' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_transfer_firm_activation on public.transaction_attorney_assignments;
create trigger trg_guard_transfer_firm_activation
before update of instruction_status on public.transaction_attorney_assignments
for each row execute function public.bridge_guard_transfer_firm_activation();

comment on function public.bridge_manage_transfer_firm_allocation(uuid, text, uuid, text) is
  'Phase 5 atomically separates firm acceptance, internal primary allocation, and transfer-matter activation.';

commit;
