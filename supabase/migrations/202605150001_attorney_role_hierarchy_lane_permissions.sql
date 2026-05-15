alter table public.attorney_firms
  add column if not exists allow_management_lane_override boolean not null default false;

comment on column public.attorney_firms.allow_management_lane_override is
  'Future policy switch. When false, attorney managers/admins must be assigned to a transaction lane before editing that lane.';

alter table public.transaction_attorney_assignments
  drop constraint if exists transaction_attorney_assignments_assignment_type_check;

alter table public.transaction_attorney_assignments
  add constraint transaction_attorney_assignments_assignment_type_check
  check (assignment_type in ('transfer', 'bond', 'transfer_and_bond', 'cancellation'));

drop index if exists public.transaction_attorney_assignments_unique_active_type;

create unique index transaction_attorney_assignments_unique_active_type
  on public.transaction_attorney_assignments (transaction_id, assignment_type)
  where status = 'active' and assignment_type in ('transfer', 'bond', 'transfer_and_bond', 'cancellation');
