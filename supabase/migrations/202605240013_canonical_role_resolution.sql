begin;
alter table if exists public.profiles
  add column if not exists system_role text;
alter table if exists public.organisation_users
  add column if not exists workspace_role text;
alter table if exists public.transaction_participants
  add column if not exists transaction_role text;
do $$
begin
  alter table public.profiles
    drop constraint if exists profiles_system_role_check;
  alter table public.profiles
    add constraint profiles_system_role_check
    check (system_role is null or system_role in ('professional', 'client', 'admin', 'super_admin'));
exception
  when undefined_table then null;
end $$;
create or replace function public.bridge_normalize_system_role(role_value text)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when lower(coalesce(role_value, '')) in ('client', 'buyer', 'seller') then 'client'
    when lower(coalesce(role_value, '')) in ('super_admin', 'superadmin') then 'super_admin'
    when lower(coalesce(role_value, '')) in ('admin', 'platform_admin') then 'admin'
    when lower(coalesce(role_value, '')) in ('agent', 'developer', 'attorney', 'bond_originator', 'professional') then 'professional'
    else null
  end;
$$;
create or replace function public.bridge_normalize_workspace_role(role_value text)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when lower(coalesce(role_value, '')) in ('super_admin', 'superadmin', 'administrator') then 'owner'
    when lower(coalesce(role_value, '')) in ('agency_owner', 'principal / owner', 'principal') then 'principal'
    when lower(coalesce(role_value, '')) in ('branch manager', 'branch_admin', 'branch_manager') then 'branch_manager'
    when lower(coalesce(role_value, '')) in ('admin', 'admin_staff', 'conveyancing_secretary', 'reception_scheduling') then 'admin_staff'
    when lower(coalesce(role_value, '')) in ('sales_agent', 'agent') then 'agent'
    when lower(coalesce(role_value, '')) in ('firm_admin') then 'owner'
    when lower(coalesce(role_value, '')) in ('director_partner') then 'partner'
    when lower(coalesce(role_value, '')) in ('transfer_attorney', 'bond_attorney', 'candidate_attorney', 'attorney') then 'attorney'
    when lower(coalesce(role_value, '')) in ('bond originator', 'originator', 'bond_originator') then 'bond_originator'
    when lower(coalesce(role_value, '')) in ('developer') then 'owner'
    when lower(coalesce(role_value, '')) in ('owner', 'director', 'partner', 'manager', 'sales_manager', 'development_manager', 'conveyancer', 'consultant', 'processor', 'paralegal', 'viewer') then lower(role_value)
    else 'viewer'
  end;
$$;
create or replace function public.bridge_normalize_transaction_role(role_type text, legal_role text default null, transaction_role text default null)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when lower(coalesce(transaction_role, '')) in (
      'listing_agent',
      'selling_agent',
      'transfer_attorney',
      'bond_attorney',
      'cancellation_attorney',
      'bond_originator',
      'buyer',
      'seller',
      'developer_contact',
      'external_collaborator'
    ) then lower(transaction_role)
    when lower(coalesce(role_type, '')) = 'attorney' and lower(coalesce(legal_role, '')) = 'bond' then 'bond_attorney'
    when lower(coalesce(role_type, '')) = 'attorney' and lower(coalesce(legal_role, '')) = 'cancellation' then 'cancellation_attorney'
    when lower(coalesce(role_type, '')) = 'attorney' then 'transfer_attorney'
    when lower(coalesce(role_type, '')) in ('agent', 'sales_agent') then 'listing_agent'
    when lower(coalesce(role_type, '')) = 'bond_originator' then 'bond_originator'
    when lower(coalesce(role_type, '')) in ('developer', 'developer_rep') then 'developer_contact'
    when lower(coalesce(role_type, '')) in ('buyer', 'client') then 'buyer'
    when lower(coalesce(role_type, '')) = 'seller' then 'seller'
    else 'external_collaborator'
  end;
$$;
update public.profiles
set system_role = coalesce(
  public.bridge_normalize_system_role(system_role),
  public.bridge_normalize_system_role(role),
  'professional'
)
where system_role is null
  or public.bridge_normalize_system_role(system_role) is distinct from system_role;
update public.organisation_users
set workspace_role = public.bridge_normalize_workspace_role(coalesce(workspace_role, organisation_role, role))
where workspace_role is null
  or public.bridge_normalize_workspace_role(workspace_role) is distinct from workspace_role;
update public.transaction_participants
set transaction_role = public.bridge_normalize_transaction_role(role_type, legal_role, transaction_role)
where transaction_role is null
  or public.bridge_normalize_transaction_role(role_type, legal_role, transaction_role) is distinct from transaction_role;
create index if not exists profiles_system_role_idx
  on public.profiles (system_role);
create index if not exists organisation_users_workspace_role_idx
  on public.organisation_users (organisation_id, workspace_role, status);
create index if not exists transaction_participants_transaction_role_idx
  on public.transaction_participants (transaction_id, transaction_role, status);
create or replace function public.bridge_profiles_sync_system_role()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.system_role := coalesce(
    public.bridge_normalize_system_role(new.system_role),
    public.bridge_normalize_system_role(new.role),
    'professional'
  );
  return new;
end;
$$;
drop trigger if exists profiles_sync_system_role on public.profiles;
create trigger profiles_sync_system_role
before insert or update of role, system_role on public.profiles
for each row
execute function public.bridge_profiles_sync_system_role();
create or replace function public.bridge_organisation_users_sync_workspace_role()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.workspace_role := public.bridge_normalize_workspace_role(coalesce(new.workspace_role, new.organisation_role, new.role));
  return new;
end;
$$;
drop trigger if exists organisation_users_sync_workspace_role on public.organisation_users;
create trigger organisation_users_sync_workspace_role
before insert or update of role, organisation_role, workspace_role on public.organisation_users
for each row
execute function public.bridge_organisation_users_sync_workspace_role();
create or replace function public.bridge_transaction_participants_sync_transaction_role()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.transaction_role := public.bridge_normalize_transaction_role(new.role_type, new.legal_role, new.transaction_role);
  return new;
end;
$$;
drop trigger if exists transaction_participants_sync_transaction_role on public.transaction_participants;
create trigger transaction_participants_sync_transaction_role
before insert or update of role_type, legal_role, transaction_role on public.transaction_participants
for each row
execute function public.bridge_transaction_participants_sync_transaction_role();
create or replace function public.bridge_current_workspace_role(workspace_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select public.bridge_normalize_workspace_role(coalesce(member.workspace_role, member.organisation_role, member.role))
  from public.organisation_users member
  where member.organisation_id = workspace_id
    and member.user_id = auth.uid()
    and member.status = 'active'
  order by member.is_primary_owner desc, member.updated_at desc nulls last, member.created_at desc
  limit 1;
$$;
create or replace function public.bridge_current_transaction_role(transaction_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select public.bridge_normalize_transaction_role(participant.role_type, participant.legal_role, participant.transaction_role)
  from public.transaction_participants participant
  where participant.transaction_id = transaction_id
    and participant.user_id = auth.uid()
    and coalesce(participant.status, 'active') in ('active', 'accepted')
    and participant.removed_at is null
  order by participant.accepted_at desc nulls last, participant.updated_at desc nulls last, participant.created_at desc
  limit 1;
$$;
create or replace function public.bridge_has_workspace_permission(workspace_id uuid, permission_key text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role text;
  v_permission text := lower(coalesce(permission_key, ''));
begin
  v_role := public.bridge_current_workspace_role(workspace_id);
  if v_role is null then
    return false;
  end if;
  if v_role in ('owner', 'principal', 'director', 'partner') then
    return true;
  end if;
  if v_permission in ('view_dashboard', 'view_transactions', 'view_clients') then
    return true;
  end if;
  if v_permission in ('invite_users', 'manage_users', 'manage_branches', 'manage_workspace_settings') then
    return v_role in ('branch_manager', 'manager', 'admin_staff');
  end if;
  return v_role not in ('viewer');
end;
$$;
create or replace function public.bridge_has_transaction_permission(transaction_id uuid, permission_key text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role text;
  v_permission text := lower(coalesce(permission_key, ''));
begin
  v_role := public.bridge_current_transaction_role(transaction_id);
  if v_role is null then
    return false;
  end if;
  if v_permission in ('view_transaction', 'view_documents', 'comment') then
    return true;
  end if;
  if v_permission in ('manage_transfer_workflow', 'upload_transfer_docs') then
    return v_role in ('transfer_attorney', 'listing_agent', 'developer_contact');
  end if;
  if v_permission in ('manage_bond_workflow', 'upload_bond_docs') then
    return v_role in ('bond_attorney', 'bond_originator', 'listing_agent', 'developer_contact');
  end if;
  if v_permission in ('edit_core_transaction', 'invite_participants') then
    return v_role in ('listing_agent', 'developer_contact');
  end if;
  return false;
end;
$$;
grant execute on function public.bridge_normalize_system_role(text) to authenticated;
grant execute on function public.bridge_normalize_workspace_role(text) to authenticated;
grant execute on function public.bridge_normalize_transaction_role(text, text, text) to authenticated;
grant execute on function public.bridge_current_workspace_role(uuid) to authenticated;
grant execute on function public.bridge_current_transaction_role(uuid) to authenticated;
grant execute on function public.bridge_has_workspace_permission(uuid, text) to authenticated;
grant execute on function public.bridge_has_transaction_permission(uuid, text) to authenticated;
commit;
