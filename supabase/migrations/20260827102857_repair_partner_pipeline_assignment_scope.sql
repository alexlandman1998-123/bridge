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

create index if not exists transaction_attorney_assignments_firm_allocation_idx
  on public.transaction_attorney_assignments (attorney_firm_id, allocation_state, updated_at desc)
  where attorney_role = 'transfer_attorney' and is_primary = true;

insert into public.transaction_attorney_assignments (
  transaction_id,
  firm_id,
  attorney_firm_id,
  assignment_type,
  attorney_role,
  matter_type,
  instruction_status,
  assigned_organisation_id,
  assigned_user_id,
  scope_level,
  scope_metadata,
  primary_attorney_id,
  attorney_user_id,
  preferred_attorney_user_id,
  preferred_contact_name,
  preferred_contact_email,
  preferred_contact_phone,
  appointment_source,
  firm_acceptance_status,
  staff_assignment_status,
  allocation_state,
  allocation_state_changed_at,
  status,
  assignment_status,
  is_primary,
  visibility_scope,
  can_edit,
  can_manage_documents,
  can_manage_signing,
  can_add_internal_notes,
  can_add_shared_updates,
  can_update_workflow_lane,
  assigned_at,
  created_at,
  updated_at
)
select
  roleplayer.transaction_id,
  firm.id,
  firm.id,
  case roleplayer.role_type
    when 'bond_attorney' then 'bond'
    when 'cancellation_attorney' then 'cancellation'
    else 'transfer'
  end,
  roleplayer.role_type,
  case roleplayer.role_type
    when 'bond_attorney' then 'bond'
    when 'cancellation_attorney' then 'cancellation'
    else 'transfer'
  end,
  'new_instruction',
  coalesce(roleplayer.organisation_id, firm.organisation_id, firm.id),
  null,
  'organisation',
  jsonb_build_object(
    'source', 'repair_partner_pipeline_assignment_scope',
    'rolePlayerId', roleplayer.id,
    'selectionSource', roleplayer.selection_source
  ),
  null,
  null,
  null,
  roleplayer.contact_person,
  roleplayer.email_address,
  roleplayer.phone_number,
  coalesce(nullif(roleplayer.selection_source, ''), 'preferred_partner'),
  'awaiting_firm_acceptance',
  'awaiting_staff_assignment',
  'awaiting_firm_acceptance',
  now(),
  'pending',
  'pending',
  true,
  'firm_matter',
  true,
  true,
  true,
  true,
  true,
  true,
  coalesce(roleplayer.activated_at, roleplayer.created_at, now()),
  now(),
  now()
from public.transaction_role_players roleplayer
join public.attorney_firms firm
  on firm.id = roleplayer.organisation_id
  or firm.organisation_id = roleplayer.organisation_id
where roleplayer.role_type in ('transfer_attorney', 'bond_attorney', 'cancellation_attorney')
  and roleplayer.organisation_id is not null
  and roleplayer.removed_at is null
  and coalesce(roleplayer.assignment_status, roleplayer.status, 'active') not in (
    'removed',
    'declined',
    'rejected',
    'inactive',
    'suspended'
  )
  and not exists (
    select 1
    from public.transaction_attorney_assignments existing
    where existing.transaction_id = roleplayer.transaction_id
      and existing.attorney_role = roleplayer.role_type
      and coalesce(existing.assignment_status, existing.status, 'active') not in ('removed', 'declined', 'rejected')
  );

notify pgrst, 'reload schema';

commit;
