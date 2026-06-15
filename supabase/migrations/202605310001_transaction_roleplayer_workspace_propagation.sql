begin;
alter table if exists public.transaction_role_players
  add column if not exists workspace_unit_id uuid,
  add column if not exists branch_id uuid,
  add column if not exists user_id uuid,
  add column if not exists organisation_id uuid,
  add column if not exists status text not null default 'selected',
  add column if not exists assignment_status text not null default 'selected',
  add column if not exists activation_trigger text,
  add column if not exists activated_at timestamptz,
  add column if not exists assigned_by uuid,
  add column if not exists removed_at timestamptz;
alter table if exists public.transaction_role_players
  drop constraint if exists transaction_role_players_role_type_check;
alter table if exists public.transaction_role_players
  add constraint transaction_role_players_role_type_check
  check (role_type in ('transfer_attorney', 'bond_originator', 'bond_attorney', 'cancellation_attorney', 'developer_contact', 'agent'));
alter table if exists public.transaction_role_players
  drop constraint if exists transaction_role_players_selection_source_check;
alter table if exists public.transaction_role_players
  add constraint transaction_role_players_selection_source_check
  check (selection_source in ('agency_preferred', 'buyer_appointed', 'manual', 'connected_partner', 'preferred_partner', 'recently_used'));
create unique index if not exists transaction_role_players_transaction_role_uidx
  on public.transaction_role_players (transaction_id, role_type)
  where removed_at is null and assignment_status <> 'removed';
create index if not exists transaction_role_players_scope_idx
  on public.transaction_role_players (organisation_id, workspace_unit_id, branch_id, user_id);
alter table if exists public.transaction_attorney_assignments
  add column if not exists matter_type text,
  add column if not exists instruction_status text not null default 'new_instruction',
  add column if not exists assigned_organisation_id uuid,
  add column if not exists assigned_workspace_unit_id uuid,
  add column if not exists assigned_branch_id uuid,
  add column if not exists assigned_user_id uuid;
do $$
begin
  if to_regclass('public.transaction_attorney_assignments') is not null then
    update public.transaction_attorney_assignments
    set
      matter_type = coalesce(nullif(matter_type, ''), assignment_type),
      assigned_user_id = coalesce(assigned_user_id, attorney_user_id, primary_attorney_id)
    where true;
  end if;
end $$;
create unique index if not exists transaction_attorney_assignments_unique_active_primary_role
  on public.transaction_attorney_assignments (transaction_id, attorney_role)
  where is_primary = true and assignment_status = 'active';
create index if not exists transaction_attorney_assignments_scope_idx
  on public.transaction_attorney_assignments (assigned_organisation_id, assigned_workspace_unit_id, assigned_branch_id, assigned_user_id);
alter table if exists public.transaction_bond_applications
  add column if not exists buyer_party_id uuid,
  add column if not exists application_type text not null default 'bank_application',
  add column if not exists assigned_organisation_id uuid,
  add column if not exists assigned_workspace_unit_id uuid,
  add column if not exists assigned_branch_id uuid,
  add column if not exists assigned_user_id uuid,
  add column if not exists metadata jsonb not null default '{}'::jsonb;
create unique index if not exists transaction_bond_applications_originator_intake_uidx
  on public.transaction_bond_applications (transaction_id, application_type)
  where application_type = 'originator_intake';
create index if not exists transaction_bond_applications_scope_idx
  on public.transaction_bond_applications (assigned_organisation_id, assigned_workspace_unit_id, assigned_branch_id, assigned_user_id);
commit;
