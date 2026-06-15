begin;
create extension if not exists "pgcrypto";
alter table public.transaction_attorney_assignments
  add column if not exists attorney_firm_id uuid references public.attorney_firms(id) on delete cascade,
  add column if not exists attorney_user_id uuid references auth.users(id) on delete set null,
  add column if not exists attorney_department_id uuid references public.attorney_firm_departments(id) on delete set null,
  add column if not exists attorney_role text,
  add column if not exists assignment_status text not null default 'active',
  add column if not exists is_primary boolean not null default true,
  add column if not exists visibility_scope text not null default 'assigned_matter',
  add column if not exists can_edit boolean not null default true,
  add column if not exists can_manage_documents boolean not null default true,
  add column if not exists can_manage_signing boolean not null default true,
  add column if not exists can_add_internal_notes boolean not null default true,
  add column if not exists can_add_shared_updates boolean not null default true,
  add column if not exists can_update_workflow_lane boolean not null default true;
update public.transaction_attorney_assignments
set
  attorney_firm_id = coalesce(attorney_firm_id, firm_id),
  attorney_user_id = coalesce(attorney_user_id, primary_attorney_id),
  attorney_department_id = coalesce(attorney_department_id, department_id),
  attorney_role = coalesce(
    attorney_role,
    case assignment_type
      when 'bond' then 'bond_attorney'
      when 'cancellation' then 'cancellation_attorney'
      else 'transfer_attorney'
    end
  ),
  assignment_status = coalesce(nullif(assignment_status, ''), status, 'active'),
  is_primary = coalesce(is_primary, true);
insert into public.transaction_attorney_assignments (
  transaction_id,
  firm_id,
  assignment_type,
  department_id,
  primary_attorney_id,
  secretary_id,
  admin_handler_id,
  status,
  assigned_by,
  assigned_at,
  attorney_firm_id,
  attorney_user_id,
  attorney_department_id,
  attorney_role,
  assignment_status,
  is_primary,
  visibility_scope,
  can_edit,
  can_manage_documents,
  can_manage_signing,
  can_add_internal_notes,
  can_add_shared_updates,
  can_update_workflow_lane
)
select
  existing.transaction_id,
  existing.firm_id,
  'bond',
  existing.department_id,
  existing.primary_attorney_id,
  existing.secretary_id,
  existing.admin_handler_id,
  existing.status,
  existing.assigned_by,
  existing.assigned_at,
  existing.firm_id,
  existing.primary_attorney_id,
  existing.department_id,
  'bond_attorney',
  coalesce(existing.status, 'active'),
  true,
  'assigned_matter',
  true,
  true,
  true,
  true,
  true,
  true
from public.transaction_attorney_assignments existing
where existing.assignment_type = 'transfer_and_bond'
  and existing.status <> 'removed'
  and not exists (
    select 1
    from public.transaction_attorney_assignments bond_assignment
    where bond_assignment.transaction_id = existing.transaction_id
      and coalesce(bond_assignment.attorney_role, '') = 'bond_attorney'
      and coalesce(bond_assignment.assignment_status, bond_assignment.status, '') = 'active'
      and coalesce(bond_assignment.is_primary, false) = true
  );
alter table public.transaction_attorney_assignments
  alter column attorney_firm_id set not null,
  alter column attorney_role set not null;
alter table public.transaction_attorney_assignments
  drop constraint if exists transaction_attorney_assignments_assignment_type_check;
alter table public.transaction_attorney_assignments
  add constraint transaction_attorney_assignments_assignment_type_check
  check (assignment_type in ('transfer', 'bond', 'transfer_and_bond', 'cancellation'));
alter table public.transaction_attorney_assignments
  drop constraint if exists transaction_attorney_assignments_attorney_role_check;
alter table public.transaction_attorney_assignments
  add constraint transaction_attorney_assignments_attorney_role_check
  check (attorney_role in ('transfer_attorney', 'bond_attorney', 'cancellation_attorney'));
alter table public.transaction_attorney_assignments
  drop constraint if exists transaction_attorney_assignments_assignment_status_check;
alter table public.transaction_attorney_assignments
  add constraint transaction_attorney_assignments_assignment_status_check
  check (assignment_status in ('pending', 'active', 'paused', 'completed', 'removed'));
alter table public.transaction_attorney_assignments
  drop constraint if exists transaction_attorney_assignments_visibility_scope_check;
alter table public.transaction_attorney_assignments
  add constraint transaction_attorney_assignments_visibility_scope_check
  check (visibility_scope in ('assigned_matter', 'firm_matter', 'internal_only'));
drop index if exists public.transaction_attorney_assignments_unique_active_type;
create unique index if not exists transaction_attorney_assignments_unique_active_primary_role
  on public.transaction_attorney_assignments (transaction_id, attorney_role)
  where is_primary = true and assignment_status = 'active';
create unique index if not exists transaction_attorney_assignments_unique_active_role_user
  on public.transaction_attorney_assignments (transaction_id, attorney_role, attorney_user_id)
  where attorney_user_id is not null and assignment_status <> 'removed';
create index if not exists transaction_attorney_assignments_attorney_role_idx
  on public.transaction_attorney_assignments (transaction_id, attorney_role, assignment_status);
create index if not exists transaction_attorney_assignments_attorney_user_idx
  on public.transaction_attorney_assignments (attorney_user_id, assignment_status);
create index if not exists transaction_attorney_assignments_attorney_firm_idx
  on public.transaction_attorney_assignments (attorney_firm_id, assignment_status, attorney_role);
drop policy if exists transaction_attorney_assignments_select on public.transaction_attorney_assignments;
create policy transaction_attorney_assignments_select on public.transaction_attorney_assignments
for select to authenticated
using (
  (
    attorney_user_id = auth.uid()
    or primary_attorney_id = auth.uid()
    or secretary_id = auth.uid()
    or admin_handler_id = auth.uid()
  )
  or public.attorney_user_is_firm_lead(attorney_firm_id)
  or public.attorney_user_is_firm_lead(firm_id)
  or exists (
    select 1
    from public.transactions t
    where t.id = transaction_attorney_assignments.transaction_id
      and (
        t.owner_user_id = auth.uid()
        or public.bridge_is_org_admin(t.organisation_id)
      )
  )
);
drop policy if exists transaction_attorney_assignments_write on public.transaction_attorney_assignments;
create policy transaction_attorney_assignments_write on public.transaction_attorney_assignments
for all to authenticated
using (
  exists (
    select 1
    from public.transactions t
    where t.id = transaction_attorney_assignments.transaction_id
      and (
        t.owner_user_id = auth.uid()
        or public.bridge_is_org_admin(t.organisation_id)
        or public.attorney_user_is_firm_lead(transaction_attorney_assignments.attorney_firm_id)
        or public.attorney_user_is_firm_lead(transaction_attorney_assignments.firm_id)
      )
  )
)
with check (
  exists (
    select 1
    from public.transactions t
    where t.id = transaction_attorney_assignments.transaction_id
      and (
        t.owner_user_id = auth.uid()
        or public.bridge_is_org_admin(t.organisation_id)
        or public.attorney_user_is_firm_lead(transaction_attorney_assignments.attorney_firm_id)
        or public.attorney_user_is_firm_lead(transaction_attorney_assignments.firm_id)
      )
  )
);
comment on column public.transaction_attorney_assignments.attorney_role is
  'Canonical transaction-level legal role: transfer_attorney, bond_attorney, or cancellation_attorney.';
comment on column public.transaction_attorney_assignments.is_primary is
  'True for the primary attorney assignment for this role. Supporting attorneys use false.';
comment on column public.transaction_attorney_assignments.visibility_scope is
  'Assignment visibility scope. Internal by default and not automatically client-visible.';
commit;
