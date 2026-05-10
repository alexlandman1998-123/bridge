begin;

create extension if not exists "pgcrypto";

create or replace function public.attorney_user_is_firm_lead(target_firm_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.attorney_firm_members m
    where m.firm_id = target_firm_id
      and m.user_id = auth.uid()
      and m.status = 'active'
      and m.role in ('firm_admin', 'director_partner')
  );
$$;

grant execute on function public.attorney_user_is_firm_lead(uuid) to authenticated;

create table if not exists public.transaction_attorney_assignments (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  firm_id uuid not null references public.attorney_firms(id) on delete cascade,
  assignment_type text not null,
  department_id uuid references public.attorney_firm_departments(id) on delete set null,
  primary_attorney_id uuid references auth.users(id) on delete set null,
  secretary_id uuid references auth.users(id) on delete set null,
  admin_handler_id uuid references auth.users(id) on delete set null,
  status text not null default 'active',
  assigned_by uuid references auth.users(id) on delete set null,
  assigned_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists public.transaction_attorney_assignments
  drop constraint if exists transaction_attorney_assignments_assignment_type_check;
alter table if exists public.transaction_attorney_assignments
  add constraint transaction_attorney_assignments_assignment_type_check
  check (assignment_type in ('transfer', 'bond', 'transfer_and_bond'));

alter table if exists public.transaction_attorney_assignments
  drop constraint if exists transaction_attorney_assignments_status_check;
alter table if exists public.transaction_attorney_assignments
  add constraint transaction_attorney_assignments_status_check
  check (status in ('pending', 'active', 'paused', 'completed', 'removed'));

create unique index if not exists transaction_attorney_assignments_unique_active_type
  on public.transaction_attorney_assignments (transaction_id, assignment_type)
  where status = 'active' and assignment_type in ('transfer', 'bond', 'transfer_and_bond');

create index if not exists transaction_attorney_assignments_transaction_idx
  on public.transaction_attorney_assignments (transaction_id);

create index if not exists transaction_attorney_assignments_firm_idx
  on public.transaction_attorney_assignments (firm_id, status, assignment_type);

create index if not exists transaction_attorney_assignments_primary_attorney_idx
  on public.transaction_attorney_assignments (primary_attorney_id, status);

create index if not exists transaction_attorney_assignments_secretary_idx
  on public.transaction_attorney_assignments (secretary_id, status);

create index if not exists transaction_attorney_assignments_admin_handler_idx
  on public.transaction_attorney_assignments (admin_handler_id, status);

create index if not exists transaction_attorney_assignments_department_idx
  on public.transaction_attorney_assignments (department_id, status);

drop trigger if exists trg_transaction_attorney_assignments_updated_at on public.transaction_attorney_assignments;
create trigger trg_transaction_attorney_assignments_updated_at
before update on public.transaction_attorney_assignments
for each row
execute function public.set_updated_at_timestamp();

alter table if exists public.transaction_attorney_assignments enable row level security;

drop policy if exists transaction_attorney_assignments_select on public.transaction_attorney_assignments;
create policy transaction_attorney_assignments_select on public.transaction_attorney_assignments
for select to authenticated
using (
  (
    primary_attorney_id = auth.uid()
    or secretary_id = auth.uid()
    or admin_handler_id = auth.uid()
  )
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
        or public.attorney_user_is_firm_lead(transaction_attorney_assignments.firm_id)
      )
  )
);

grant select, insert, update, delete on public.transaction_attorney_assignments to authenticated;

commit;
