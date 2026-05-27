begin;

create or replace function public.bridge_current_user_id()
returns uuid
language sql
stable
as $$
  select auth.uid();
$$;

alter table if exists public.transactions
  add column if not exists bond_workspace_id uuid references public.organisations(id) on delete set null,
  add column if not exists bond_region_id uuid references public.workspace_regions(id) on delete set null,
  add column if not exists bond_workspace_unit_id uuid references public.workspace_units(id) on delete set null,
  add column if not exists primary_bond_consultant_user_id uuid references auth.users(id) on delete set null,
  add column if not exists assigned_bond_processor_user_id uuid references auth.users(id) on delete set null,
  add column if not exists assigned_bond_manager_user_id uuid references auth.users(id) on delete set null,
  add column if not exists assigned_bond_compliance_user_id uuid references auth.users(id) on delete set null,
  add column if not exists bond_assignment_status text,
  add column if not exists bond_assignment_source text,
  add column if not exists bond_assignment_updated_at timestamptz,
  add column if not exists bond_assignment_updated_by uuid references auth.users(id) on delete set null;

alter table if exists public.transactions
  drop constraint if exists transactions_bond_assignment_status_check;

alter table if exists public.transactions
  add constraint transactions_bond_assignment_status_check
    check (bond_assignment_status is null or bond_assignment_status in ('unassigned','workspace_assigned','consultant_assigned','processor_assigned','fully_assigned','inactive'));

alter table if exists public.transactions
  drop constraint if exists transactions_bond_assignment_source_check;

alter table if exists public.transactions
  add constraint transactions_bond_assignment_source_check
    check (bond_assignment_source is null or bond_assignment_source in ('manual','legacy_backfill','participant_sync','invite_acceptance','workflow_assignment','system_repair'));

create index if not exists transactions_bond_workspace_id_idx
  on public.transactions (bond_workspace_id);
create index if not exists transactions_bond_region_id_idx
  on public.transactions (bond_region_id)
  where bond_region_id is not null;
create index if not exists transactions_bond_workspace_unit_id_idx
  on public.transactions (bond_workspace_unit_id)
  where bond_workspace_unit_id is not null;
create index if not exists transactions_primary_bond_consultant_user_id_idx
  on public.transactions (primary_bond_consultant_user_id)
  where primary_bond_consultant_user_id is not null;
create index if not exists transactions_assigned_bond_processor_user_id_idx
  on public.transactions (assigned_bond_processor_user_id)
  where assigned_bond_processor_user_id is not null;
create index if not exists transactions_assigned_bond_manager_user_id_idx
  on public.transactions (assigned_bond_manager_user_id)
  where assigned_bond_manager_user_id is not null;
create index if not exists transactions_assigned_bond_compliance_user_id_idx
  on public.transactions (assigned_bond_compliance_user_id)
  where assigned_bond_compliance_user_id is not null;

create index if not exists transactions_bond_workspace_lookup_idx
  on public.transactions (bond_workspace_id, bond_workspace_unit_id, bond_region_id);
create index if not exists transactions_bond_assignment_consultant_idx
  on public.transactions (bond_workspace_id, primary_bond_consultant_user_id)
  where bond_workspace_id is not null and primary_bond_consultant_user_id is not null;
create index if not exists transactions_bond_assignment_processor_idx
  on public.transactions (bond_workspace_id, assigned_bond_processor_user_id)
  where bond_workspace_id is not null and assigned_bond_processor_user_id is not null;

create or replace function public.bridge_bond_workspace_id(transaction_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select t.bond_workspace_id
  from public.transactions t
  where t.id = transaction_id
  limit 1;
$$;

create or replace function public.bridge_bond_region_id(transaction_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select t.bond_region_id
  from public.transactions t
  where t.id = transaction_id
  limit 1;
$$;

create or replace function public.bridge_bond_workspace_unit_id(transaction_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select t.bond_workspace_unit_id
  from public.transactions t
  where t.id = transaction_id
  limit 1;
$$;

create or replace function public.bridge_primary_bond_consultant_user_id(transaction_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select t.primary_bond_consultant_user_id
  from public.transactions t
  where t.id = transaction_id
  limit 1;
$$;

create or replace function public.bridge_assigned_bond_processor_user_id(transaction_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select t.assigned_bond_processor_user_id
  from public.transactions t
  where t.id = transaction_id
  limit 1;
$$;

create or replace function public.bridge_assigned_bond_manager_user_id(transaction_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select t.assigned_bond_manager_user_id
  from public.transactions t
  where t.id = transaction_id
  limit 1;
$$;

create or replace function public.bridge_assigned_bond_compliance_user_id(transaction_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select t.assigned_bond_compliance_user_id
  from public.transactions t
  where t.id = transaction_id
  limit 1;
$$;

create or replace function public.bridge_can_access_bond_assignment(transaction_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if transaction_id is null or auth.uid() is null then
    return false;
  end if;

  if public.bridge_primary_bond_consultant_user_id(transaction_id) = auth.uid() then
    return true;
  end if;

  if public.bridge_assigned_bond_processor_user_id(transaction_id) = auth.uid() then
    return true;
  end if;

  if public.bridge_assigned_bond_manager_user_id(transaction_id) = auth.uid() then
    return true;
  end if;

  if public.bridge_assigned_bond_compliance_user_id(transaction_id) = auth.uid() then
    return true;
  end if;

  return false;
end;
$$;

create or replace function public.bridge_can_access_bond_workspace(transaction_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if transaction_id is null or auth.uid() is null then
    return false;
  end if;

  return exists (
    select 1
    from public.transactions t
    where t.id = transaction_id
      and t.bond_workspace_id = any (array(
        select ou.organisation_id
        from public.organisation_users ou
        where ou.user_id = auth.uid()
          and ou.status = 'active'
      ))
  );
end;
$$;

grant execute on function public.bridge_bond_workspace_id(uuid) to authenticated;
grant execute on function public.bridge_bond_region_id(uuid) to authenticated;
grant execute on function public.bridge_bond_workspace_unit_id(uuid) to authenticated;
grant execute on function public.bridge_primary_bond_consultant_user_id(uuid) to authenticated;
grant execute on function public.bridge_assigned_bond_processor_user_id(uuid) to authenticated;
grant execute on function public.bridge_assigned_bond_manager_user_id(uuid) to authenticated;
grant execute on function public.bridge_assigned_bond_compliance_user_id(uuid) to authenticated;
grant execute on function public.bridge_can_access_bond_assignment(uuid) to authenticated;
grant execute on function public.bridge_can_access_bond_workspace(uuid) to authenticated;

grant execute on function public.bridge_current_user_id to authenticated;

commit;
