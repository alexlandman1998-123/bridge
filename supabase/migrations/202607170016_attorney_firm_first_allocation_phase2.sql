begin;

-- Phase 2 is deliberately additive. Existing assignment writers may continue
-- using the legacy firm/person and status columns while the trigger below keeps
-- the canonical firm-first lifecycle in sync.
alter table if exists public.transaction_attorney_assignments
  add column if not exists appointment_source text,
  add column if not exists preferred_attorney_user_id uuid references auth.users(id) on delete set null,
  add column if not exists preferred_contact_name text,
  add column if not exists preferred_contact_email text,
  add column if not exists preferred_contact_phone text,
  add column if not exists firm_acceptance_status text,
  add column if not exists firm_accepted_by uuid references auth.users(id) on delete set null,
  add column if not exists firm_accepted_at timestamptz,
  add column if not exists staff_assignment_status text,
  add column if not exists allocation_state text,
  add column if not exists allocation_state_changed_at timestamptz,
  add column if not exists declined_by uuid references auth.users(id) on delete set null,
  add column if not exists declined_at timestamptz,
  add column if not exists decline_reason text,
  add column if not exists replacement_required_by uuid references auth.users(id) on delete set null,
  add column if not exists replacement_required_at timestamptz,
  add column if not exists replacement_reason text,
  add column if not exists superseded_by_assignment_id uuid references public.transaction_attorney_assignments(id) on delete set null;

-- attorney_firm_id is canonical. Keep firm_id aligned for the older services,
-- RLS policies and reporting queries which still read the compatibility field.
update public.transaction_attorney_assignments
set
  firm_id = attorney_firm_id,
  appointment_source = coalesce(
    nullif(btrim(appointment_source), ''),
    nullif(btrim(instruction_decision_source), ''),
    'legacy_assignment'
  ),
  firm_acceptance_status = case
    when coalesce(instruction_status, '') = 'declined' then 'declined'
    when coalesce(assignment_status, status, '') = 'removed' then coalesce(firm_acceptance_status, 'accepted')
    when coalesce(attorney_user_id, primary_attorney_id) is not null then 'accepted'
    when instruction_accepted_at is not null or coalesce(instruction_status, '') = 'accepted' then 'accepted'
    when firm_acceptance_status in ('accepted', 'declined', 'replacement_required') then firm_acceptance_status
    else 'awaiting_firm_acceptance'
  end,
  firm_accepted_by = case
    when coalesce(attorney_user_id, primary_attorney_id) is not null
      or instruction_accepted_at is not null
      or coalesce(instruction_status, '') = 'accepted'
      then coalesce(firm_accepted_by, instruction_accepted_by, assigned_by)
    else firm_accepted_by
  end,
  firm_accepted_at = case
    when coalesce(attorney_user_id, primary_attorney_id) is not null
      or instruction_accepted_at is not null
      or coalesce(instruction_status, '') = 'accepted'
      then coalesce(firm_accepted_at, instruction_accepted_at, assigned_at, created_at)
    else firm_accepted_at
  end,
  staff_assignment_status = case
    when coalesce(attorney_user_id, primary_attorney_id) is not null then 'staff_assigned'
    else 'awaiting_staff_assignment'
  end,
  declined_by = case
    when coalesce(instruction_status, '') = 'declined'
      then coalesce(declined_by, instruction_declined_by, assigned_by)
    else declined_by
  end,
  declined_at = case
    when coalesce(instruction_status, '') = 'declined'
      then coalesce(declined_at, instruction_declined_at, updated_at, now())
    else declined_at
  end,
  decline_reason = case
    when coalesce(instruction_status, '') = 'declined'
      then coalesce(nullif(btrim(decline_reason), ''), nullif(btrim(instruction_decision_note), ''), 'Declined through legacy assignment workflow')
    else decline_reason
  end
where true;

-- A bank invitation acceptance is firm acceptance evidence even when the firm
-- has not yet assigned a person. This preserves the existing bond and
-- cancellation lifecycle as the compatibility baseline.
update public.transaction_attorney_assignments assignment
set
  firm_acceptance_status = 'accepted',
  firm_accepted_by = coalesce(assignment.firm_accepted_by, appointment.accepted_by),
  firm_accepted_at = coalesce(assignment.firm_accepted_at, appointment.accepted_at, assignment.assigned_at),
  appointment_source = case
    when assignment.appointment_source = 'legacy_assignment' then 'bank_appointment'
    else assignment.appointment_source
  end
from public.transaction_legal_role_appointments appointment
where appointment.transaction_id = assignment.transaction_id
  and appointment.role_type = assignment.attorney_role
  and appointment.accepted_firm_id = assignment.attorney_firm_id
  and appointment.coordination_state in ('invite_accepted', 'instruction_confirmed', 'active');

update public.transaction_attorney_assignments assignment
set
  allocation_state = case
    when assignment.firm_acceptance_status = 'declined'
      or coalesce(assignment.instruction_status, '') in ('declined', 'rejected') then 'declined'
    when coalesce(assignment.assignment_status, assignment.status, '') = 'removed' then 'removed'
    when coalesce(assignment.assignment_status, assignment.status, '') = 'completed'
      or coalesce(assignment.instruction_status, '') in ('completed', 'complete', 'closed') then 'completed'
    when assignment.firm_acceptance_status = 'replacement_required' then 'replacement_required'
    when assignment.firm_acceptance_status <> 'accepted' then 'awaiting_firm_acceptance'
    when coalesce(assignment.attorney_user_id, assignment.primary_attorney_id) is null then 'awaiting_staff_assignment'
    when coalesce(assignment.assignment_status, assignment.status, '') = 'active'
      and assignment.is_primary = true then 'active'
    else 'staff_assigned'
  end,
  allocation_state_changed_at = coalesce(assignment.allocation_state_changed_at, assignment.updated_at, assignment.created_at, now())
where true;

alter table public.transaction_attorney_assignments
  alter column appointment_source set default 'legacy_assignment',
  alter column appointment_source set not null,
  alter column firm_acceptance_status set default 'awaiting_firm_acceptance',
  alter column firm_acceptance_status set not null,
  alter column staff_assignment_status set default 'awaiting_staff_assignment',
  alter column staff_assignment_status set not null,
  alter column allocation_state set default 'awaiting_firm_acceptance',
  alter column allocation_state set not null,
  alter column allocation_state_changed_at set default now(),
  alter column allocation_state_changed_at set not null;

alter table public.transaction_attorney_assignments
  drop constraint if exists transaction_attorney_assignments_firm_acceptance_status_check;
alter table public.transaction_attorney_assignments
  add constraint transaction_attorney_assignments_firm_acceptance_status_check
  check (firm_acceptance_status in ('awaiting_firm_acceptance', 'accepted', 'declined', 'replacement_required'));

alter table public.transaction_attorney_assignments
  drop constraint if exists transaction_attorney_assignments_staff_assignment_status_check;
alter table public.transaction_attorney_assignments
  add constraint transaction_attorney_assignments_staff_assignment_status_check
  check (staff_assignment_status in ('awaiting_staff_assignment', 'staff_assigned'));

alter table public.transaction_attorney_assignments
  drop constraint if exists transaction_attorney_assignments_allocation_state_check;
alter table public.transaction_attorney_assignments
  add constraint transaction_attorney_assignments_allocation_state_check
  check (allocation_state in (
    'awaiting_firm_acceptance',
    'awaiting_staff_assignment',
    'staff_assigned',
    'active',
    'declined',
    'replacement_required',
    'completed',
    'removed'
  ));

alter table public.transaction_attorney_assignments
  drop constraint if exists transaction_attorney_assignments_canonical_firm_check;
alter table public.transaction_attorney_assignments
  add constraint transaction_attorney_assignments_canonical_firm_check
  check (firm_id = attorney_firm_id);

alter table public.transaction_attorney_assignments
  drop constraint if exists transaction_attorney_assignments_staff_person_check;
alter table public.transaction_attorney_assignments
  add constraint transaction_attorney_assignments_staff_person_check
  check (
    (staff_assignment_status = 'staff_assigned' and coalesce(attorney_user_id, primary_attorney_id) is not null)
    or (staff_assignment_status = 'awaiting_staff_assignment' and coalesce(attorney_user_id, primary_attorney_id) is null)
  );

alter table public.transaction_attorney_assignments
  drop constraint if exists transaction_attorney_assignments_active_allocation_check;
alter table public.transaction_attorney_assignments
  add constraint transaction_attorney_assignments_active_allocation_check
  check (
    allocation_state <> 'active'
    or (
      firm_acceptance_status = 'accepted'
      and staff_assignment_status = 'staff_assigned'
      and coalesce(attorney_user_id, primary_attorney_id) is not null
      and assignment_status = 'active'
      and is_primary = true
    )
  );

alter table public.transaction_attorney_assignments
  drop constraint if exists transaction_attorney_assignments_allocation_consistency_check;
alter table public.transaction_attorney_assignments
  add constraint transaction_attorney_assignments_allocation_consistency_check
  check (case allocation_state
    when 'awaiting_firm_acceptance' then
      firm_acceptance_status = 'awaiting_firm_acceptance'
      and staff_assignment_status = 'awaiting_staff_assignment'
    when 'awaiting_staff_assignment' then
      firm_acceptance_status = 'accepted'
      and staff_assignment_status = 'awaiting_staff_assignment'
    when 'staff_assigned' then
      firm_acceptance_status = 'accepted'
      and staff_assignment_status = 'staff_assigned'
    when 'active' then
      firm_acceptance_status = 'accepted'
      and staff_assignment_status = 'staff_assigned'
    when 'declined' then firm_acceptance_status = 'declined'
    when 'replacement_required' then firm_acceptance_status = 'replacement_required'
    else true
  end);

alter table public.transaction_attorney_assignments
  drop constraint if exists transaction_attorney_assignments_decision_metadata_check;
alter table public.transaction_attorney_assignments
  add constraint transaction_attorney_assignments_decision_metadata_check
  check (
    (allocation_state <> 'declined' or (declined_at is not null and nullif(btrim(decline_reason), '') is not null))
    and (
      allocation_state <> 'replacement_required'
      or (replacement_required_at is not null and nullif(btrim(replacement_reason), '') is not null)
    )
  );

create or replace function public.attorney_firm_first_allocation_transition_allowed(
  p_from_state text,
  p_to_state text
)
returns boolean
language sql
immutable
set search_path = public
as $$
  select p_from_state = p_to_state or case p_from_state
    when 'awaiting_firm_acceptance' then p_to_state in ('awaiting_staff_assignment', 'declined', 'replacement_required', 'removed')
    when 'awaiting_staff_assignment' then p_to_state in ('staff_assigned', 'declined', 'replacement_required', 'removed')
    when 'staff_assigned' then p_to_state in ('awaiting_staff_assignment', 'active', 'declined', 'replacement_required', 'removed')
    when 'active' then p_to_state in ('replacement_required', 'completed', 'removed')
    when 'declined' then p_to_state in ('replacement_required', 'removed')
    when 'replacement_required' then p_to_state in ('awaiting_firm_acceptance', 'removed')
    else false
  end;
$$;

create or replace function public.prepare_attorney_firm_first_allocation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_person_id uuid;
  v_should_derive boolean := false;
  v_member_is_active boolean;
  v_preferred_member_is_active boolean;
  v_appointment_accepted_by uuid;
  v_appointment_accepted_at timestamptz;
  v_validate_member boolean := false;
  v_validate_preferred_member boolean := false;
begin
  -- Keep canonical and compatibility firm identifiers aligned regardless of
  -- which generation of the service wrote the row.
  if tg_op = 'UPDATE' then
    if new.attorney_firm_id is distinct from old.attorney_firm_id then
      new.firm_id := new.attorney_firm_id;
    elsif new.firm_id is distinct from old.firm_id then
      new.attorney_firm_id := new.firm_id;
    end if;
  end if;
  new.attorney_firm_id := coalesce(new.attorney_firm_id, new.firm_id);
  new.firm_id := new.attorney_firm_id;

  if new.attorney_firm_id is null then
    raise exception 'An attorney firm is required for every legal-role assignment.' using errcode = '23514';
  end if;

  -- Primary rows keep both person aliases aligned for rolling clients.
  if coalesce(new.is_primary, true) then
    if tg_op = 'UPDATE' then
      if new.attorney_user_id is distinct from old.attorney_user_id
        and new.primary_attorney_id is not distinct from old.primary_attorney_id then
        new.primary_attorney_id := new.attorney_user_id;
      elsif new.primary_attorney_id is distinct from old.primary_attorney_id
        and new.attorney_user_id is not distinct from old.attorney_user_id then
        new.attorney_user_id := new.primary_attorney_id;
      end if;
    end if;
    new.attorney_user_id := coalesce(new.attorney_user_id, new.primary_attorney_id);
    new.primary_attorney_id := new.attorney_user_id;
  end if;
  v_person_id := coalesce(new.attorney_user_id, new.primary_attorney_id);

  new.appointment_source := coalesce(
    nullif(btrim(new.appointment_source), ''),
    nullif(btrim(new.instruction_decision_source), ''),
    'legacy_assignment'
  );

  if tg_op = 'INSERT' then
    v_should_derive := true;
  elsif new.allocation_state is not distinct from old.allocation_state then
    v_should_derive :=
      new.attorney_firm_id is distinct from old.attorney_firm_id
      or new.attorney_user_id is distinct from old.attorney_user_id
      or new.primary_attorney_id is distinct from old.primary_attorney_id
      or new.assignment_status is distinct from old.assignment_status
      or new.status is distinct from old.status
      or new.instruction_status is distinct from old.instruction_status
      or new.firm_acceptance_status is distinct from old.firm_acceptance_status
      or new.staff_assignment_status is distinct from old.staff_assignment_status;
  end if;

  -- Legacy active person assignments count as accepted for compatibility.
  if v_person_id is not null or new.instruction_accepted_at is not null or new.instruction_status = 'accepted' then
    new.firm_acceptance_status := 'accepted';
    new.firm_accepted_by := coalesce(new.firm_accepted_by, new.instruction_accepted_by, new.assigned_by, auth.uid());
    new.firm_accepted_at := coalesce(new.firm_accepted_at, new.instruction_accepted_at, new.assigned_at, now());
  end if;

  if new.firm_acceptance_status = 'awaiting_firm_acceptance'
    and new.attorney_role in ('bond_attorney', 'cancellation_attorney') then
    select appointment.accepted_by, appointment.accepted_at
    into v_appointment_accepted_by, v_appointment_accepted_at
    from public.transaction_legal_role_appointments appointment
    where appointment.transaction_id = new.transaction_id
      and appointment.role_type = new.attorney_role
      and appointment.accepted_firm_id = new.attorney_firm_id
      and appointment.coordination_state in ('invite_accepted', 'instruction_confirmed', 'active')
    order by appointment.updated_at desc
    limit 1;

    if found then
      v_should_derive := true;
      new.firm_acceptance_status := 'accepted';
      new.firm_accepted_by := coalesce(new.firm_accepted_by, v_appointment_accepted_by);
      new.firm_accepted_at := coalesce(new.firm_accepted_at, v_appointment_accepted_at, now());
      if new.appointment_source = 'legacy_assignment' then
        new.appointment_source := 'bank_appointment';
      end if;
    end if;
  end if;

  if new.firm_acceptance_status = 'accepted' then
    new.firm_accepted_at := coalesce(new.firm_accepted_at, new.assigned_at, now());
  end if;

  new.staff_assignment_status := case
    when v_person_id is null then 'awaiting_staff_assignment'
    else 'staff_assigned'
  end;

  if v_should_derive then
    new.allocation_state := case
      when new.firm_acceptance_status = 'declined'
        or coalesce(new.instruction_status, '') in ('declined', 'rejected') then 'declined'
      when coalesce(new.assignment_status, new.status, '') = 'removed' then 'removed'
      when coalesce(new.assignment_status, new.status, '') = 'completed'
        or coalesce(new.instruction_status, '') in ('completed', 'complete', 'closed') then 'completed'
      when new.firm_acceptance_status = 'replacement_required' then 'replacement_required'
      when new.firm_acceptance_status <> 'accepted' then 'awaiting_firm_acceptance'
      when v_person_id is null then 'awaiting_staff_assignment'
      when coalesce(new.assignment_status, new.status, '') = 'active'
        and new.is_primary = true then 'active'
      else 'staff_assigned'
    end;
  end if;

  if new.allocation_state = 'declined' then
    new.firm_acceptance_status := 'declined';
    new.declined_by := coalesce(new.declined_by, new.instruction_declined_by, new.assigned_by, auth.uid());
    new.declined_at := coalesce(new.declined_at, new.instruction_declined_at, now());
    new.decline_reason := coalesce(
      nullif(btrim(new.decline_reason), ''),
      nullif(btrim(new.instruction_decision_note), ''),
      'Declined through legacy assignment workflow'
    );
  elsif new.allocation_state = 'replacement_required' then
    new.firm_acceptance_status := 'replacement_required';
    new.replacement_required_by := coalesce(new.replacement_required_by, auth.uid(), new.assigned_by);
    new.replacement_required_at := coalesce(new.replacement_required_at, now());
    new.replacement_reason := coalesce(
      nullif(btrim(new.replacement_reason), ''),
      'Replacement requested through legacy assignment workflow'
    );
  end if;

  if tg_op = 'UPDATE' and new.allocation_state is distinct from old.allocation_state then
    -- Pre-Phase-2 incoming instructions could be marked active before the firm
    -- made its decision. Permit only that legacy active-to-declined correction.
    if not (
      old.allocation_state = 'active'
      and new.allocation_state = 'declined'
      and old.appointment_source = 'legacy_assignment'
      and coalesce(old.instruction_status, '') <> 'accepted'
    ) and not (
      old.allocation_state = 'active'
      and new.allocation_state = 'staff_assigned'
      and old.appointment_source = 'legacy_assignment'
      and new.assignment_status = 'paused'
    ) and not public.attorney_firm_first_allocation_transition_allowed(old.allocation_state, new.allocation_state) then
      raise exception 'Invalid attorney allocation transition: % -> %', old.allocation_state, new.allocation_state
        using errcode = '23514';
    end if;
    new.allocation_state_changed_at := now();
  else
    new.allocation_state_changed_at := coalesce(new.allocation_state_changed_at, now());
  end if;

  if tg_op = 'INSERT' then
    v_validate_member := true;
    v_validate_preferred_member := true;
  else
    v_validate_member :=
      new.attorney_firm_id is distinct from old.attorney_firm_id
      or new.attorney_user_id is distinct from old.attorney_user_id
      or new.primary_attorney_id is distinct from old.primary_attorney_id
      or new.allocation_state is distinct from old.allocation_state;
    v_validate_preferred_member :=
      new.preferred_attorney_user_id is distinct from old.preferred_attorney_user_id
      or new.attorney_firm_id is distinct from old.attorney_firm_id;
  end if;

  if v_person_id is not null
    and new.allocation_state in ('staff_assigned', 'active')
    and v_validate_member then
    select exists (
      select 1
      from public.attorney_firm_members member
      where member.firm_id = new.attorney_firm_id
        and member.user_id = v_person_id
        and member.status = 'active'
    ) into v_member_is_active;

    if not v_member_is_active then
      raise exception 'The assigned attorney must be an active member of the appointed firm.' using errcode = '23514';
    end if;
  end if;

  if new.preferred_attorney_user_id is not null and v_validate_preferred_member then
    select exists (
      select 1
      from public.attorney_firm_members member
      where member.firm_id = new.attorney_firm_id
        and member.user_id = new.preferred_attorney_user_id
        and member.status = 'active'
    ) into v_preferred_member_is_active;

    if not v_preferred_member_is_active then
      raise exception 'A preferred attorney must be an active member of the nominated firm.' using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_prepare_attorney_firm_first_allocation
  on public.transaction_attorney_assignments;
create trigger trg_prepare_attorney_firm_first_allocation
before insert or update on public.transaction_attorney_assignments
for each row execute function public.prepare_attorney_firm_first_allocation();

create unique index if not exists transaction_attorney_assignments_unique_canonical_active_primary_role
  on public.transaction_attorney_assignments (transaction_id, attorney_role)
  where is_primary = true and allocation_state = 'active';

create index if not exists transaction_attorney_assignments_firm_first_queue_idx
  on public.transaction_attorney_assignments (attorney_firm_id, allocation_state, updated_at desc)
  where allocation_state not in ('completed', 'removed');

create index if not exists transaction_attorney_assignments_preferred_attorney_idx
  on public.transaction_attorney_assignments (attorney_firm_id, preferred_attorney_user_id)
  where preferred_attorney_user_id is not null;

comment on column public.transaction_attorney_assignments.appointment_source is
  'Origin of the firm appointment. Values remain extensible; canonical examples include seller_nomination, agent_nomination, bank_appointment and legacy_assignment.';
comment on column public.transaction_attorney_assignments.preferred_attorney_user_id is
  'Non-binding attorney preference. Operational ownership is attorney_user_id after the firm assigns an active member.';
comment on column public.transaction_attorney_assignments.allocation_state is
  'Canonical firm-first lifecycle state shared by transfer, bond and cancellation roles.';
comment on function public.prepare_attorney_firm_first_allocation() is
  'Synchronises legacy assignment writes with the canonical firm-first lifecycle and enforces firm membership and transition invariants.';

revoke all on function public.attorney_firm_first_allocation_transition_allowed(text, text) from public;
grant execute on function public.attorney_firm_first_allocation_transition_allowed(text, text) to authenticated;

notify pgrst, 'reload schema';

commit;
