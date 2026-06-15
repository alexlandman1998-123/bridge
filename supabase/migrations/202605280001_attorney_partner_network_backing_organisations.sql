begin;
alter table if exists public.attorney_firms
  add column if not exists organisation_id uuid references public.organisations(id) on delete set null;
alter table if exists public.partner_invitations
  alter column recipient_email drop not null;
alter table if exists public.organisation_partners
  add column if not exists partner_type text,
  add column if not exists status text,
  add column if not exists scope_type text not null default 'organisation',
  add column if not exists scope_id uuid,
  add column if not exists scope_name text,
  add column if not exists preferred boolean not null default false;
update public.organisation_partners
set
  status = coalesce(nullif(status, ''), nullif(relationship_status, ''), 'pending'),
  scope_type = coalesce(nullif(scope_type, ''), 'organisation'),
  scope_id = coalesce(scope_id, organisation_id),
  preferred = coalesce(preferred, false) or relationship_type = 'preferred' or visibility_level = 'preferred_partners_only'
where true;
alter table if exists public.partner_invitations
  add column if not exists invited_email text,
  add column if not exists from_organisation_name text,
  add column if not exists to_organisation_name text,
  add column if not exists from_workspace_type text,
  add column if not exists to_workspace_type text,
  add column if not exists partner_type text,
  add column if not exists scope_type text not null default 'organisation',
  add column if not exists scope_id uuid,
  add column if not exists scope_name text,
  add column if not exists preferred boolean not null default false,
  add column if not exists invited_by_user_id uuid references auth.users(id) on delete set null,
  add column if not exists responded_by_user_id uuid references auth.users(id) on delete set null,
  add column if not exists responded_at timestamptz;
update public.partner_invitations
set
  invited_email = coalesce(invited_email, recipient_email),
  scope_type = coalesce(nullif(scope_type, ''), 'organisation'),
  scope_id = coalesce(scope_id, sender_organisation_id),
  preferred = coalesce(preferred, false),
  partner_type = coalesce(nullif(partner_type, ''), nullif(to_workspace_type, '')),
  invited_by_user_id = coalesce(invited_by_user_id, created_by)
where true;
alter table if exists public.transaction_role_players
  add column if not exists partner_relationship_id uuid references public.organisation_partners(id) on delete set null,
  add column if not exists organisation_id uuid references public.organisations(id) on delete set null,
  add column if not exists status text,
  add column if not exists assignment_status text,
  add column if not exists activation_trigger text,
  add column if not exists activated_at timestamptz,
  add column if not exists notified_at timestamptz,
  add column if not exists assigned_by uuid references auth.users(id) on delete set null;
update public.transaction_role_players
set
  status = coalesce(status, 'selected'),
  assignment_status = coalesce(assignment_status, status, 'selected')
where true;
alter table if exists public.transaction_role_players
  drop constraint if exists transaction_role_players_selection_source_check;
alter table if exists public.transaction_role_players
  add constraint transaction_role_players_selection_source_check
  check (selection_source in ('agency_preferred', 'buyer_appointed', 'manual', 'connected_partner', 'preferred_partner', 'recently_used'));
create or replace function public.bridge_attorney_role_to_organisation_role(role_value text)
returns text
language sql
immutable
set search_path = public
as $$
  select case lower(trim(coalesce(role_value, '')))
    when 'firm_admin' then 'owner'
    when 'director_partner' then 'partner'
    when 'transfer_attorney' then 'attorney'
    when 'bond_attorney' then 'attorney'
    when 'conveyancing_secretary' then 'admin_staff'
    when 'reception_scheduling' then 'admin_staff'
    when 'candidate_attorney' then 'attorney'
    when 'admin_staff' then 'admin_staff'
    else 'viewer'
  end;
$$;
create or replace function public.bridge_ensure_attorney_firm_organisation(target_firm_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_firm public.attorney_firms%rowtype;
  v_org_id uuid;
begin
  if target_firm_id is null then
    raise exception 'Attorney firm id is required.' using errcode = '22023';
  end if;

  select *
  into v_firm
  from public.attorney_firms
  where id = target_firm_id
  for update;

  if not found then
    raise exception 'Attorney firm was not found.' using errcode = 'P0002';
  end if;

  if v_actor_id is not null
    and v_firm.created_by is distinct from v_actor_id
    and not exists (
      select 1
      from public.attorney_firm_members afm
      where afm.firm_id = target_firm_id
        and afm.user_id = v_actor_id
        and afm.status = 'active'
        and afm.role in ('firm_admin', 'director_partner')
    )
  then
    raise exception 'Permission denied for attorney firm partner workspace bootstrap.' using errcode = '42501';
  end if;

  if exists (
    select 1 from public.organisations org where org.id = v_firm.id
  ) then
    v_org_id := v_firm.id;
    update public.attorney_firms
    set organisation_id = v_org_id,
        updated_at = now()
    where id = target_firm_id
      and organisation_id is distinct from v_org_id;
  elsif v_firm.organisation_id is not null and exists (
    select 1 from public.organisations org where org.id = v_firm.organisation_id
  ) then
    v_org_id := v_firm.organisation_id;
  else
    insert into public.organisations (
      id,
      name,
      display_name,
      type,
      legal_name,
      registration_number,
      company_email,
      company_phone,
      website,
      address_line_1,
      province,
      country,
      support_email,
      support_phone,
      status,
      created_by,
      settings_json
    )
    values (
      v_firm.id,
      v_firm.name,
      v_firm.name,
      'attorney_firm',
      v_firm.name,
      v_firm.registration_number,
      v_firm.email,
      v_firm.phone,
      v_firm.website,
      v_firm.address_line_1,
      v_firm.province,
      coalesce(v_firm.country, 'South Africa'),
      v_firm.email,
      v_firm.phone,
      case when v_firm.is_active then 'active' else 'suspended' end,
      v_firm.created_by,
      jsonb_build_object('workspaceType', 'attorney_firm', 'attorneyFirmId', v_firm.id, 'source', 'attorney_firm_partner_bootstrap')
    )
    returning id into v_org_id;

    update public.attorney_firms
    set organisation_id = v_org_id,
        updated_at = now()
    where id = target_firm_id;
  end if;

  insert into public.organisation_users (
    organisation_id,
    user_id,
    first_name,
    last_name,
    email,
    role,
    workspace_role,
    organisation_role,
    app_role,
    workspace_type,
    status,
    permissions_json,
    invited_by_user_id,
    invited_at,
    joined_at,
    accepted_at,
    last_active_at,
    is_primary_owner,
    created_by
  )
  select
    v_org_id,
    afm.user_id,
    nullif(trim(coalesce(p.first_name, '')), ''),
    nullif(trim(coalesce(p.last_name, '')), ''),
    lower(coalesce(nullif(trim(p.email), ''), nullif(trim(v_firm.email), ''), afm.user_id::text || '@missing.bridge.local')),
    public.bridge_attorney_role_to_organisation_role(afm.role),
    public.bridge_attorney_role_to_organisation_role(afm.role),
    afm.role,
    'attorney',
    'attorney_firm',
    case when afm.status = 'active' then 'active' else 'invited' end,
    '{}'::jsonb,
    coalesce(afm.invited_by, v_firm.created_by),
    coalesce(afm.created_at, now()),
    coalesce(afm.joined_at, afm.created_at, now()),
    case when afm.status = 'active' then coalesce(afm.joined_at, afm.created_at, now()) else null end,
    case when afm.status = 'active' then now() else null end,
    afm.role in ('firm_admin', 'director_partner'),
    coalesce(afm.invited_by, v_firm.created_by)
  from public.attorney_firm_members afm
  left join public.profiles p on p.id = afm.user_id
  where afm.firm_id = target_firm_id
  on conflict (organisation_id, email)
  do update set
    user_id = excluded.user_id,
    first_name = excluded.first_name,
    last_name = excluded.last_name,
    role = excluded.role,
    workspace_role = excluded.workspace_role,
    organisation_role = excluded.organisation_role,
    app_role = excluded.app_role,
    workspace_type = excluded.workspace_type,
    status = excluded.status,
    joined_at = coalesce(public.organisation_users.joined_at, excluded.joined_at),
    accepted_at = coalesce(public.organisation_users.accepted_at, excluded.accepted_at),
    last_active_at = excluded.last_active_at,
    is_primary_owner = public.organisation_users.is_primary_owner or excluded.is_primary_owner,
    updated_at = now();

  return v_org_id;
end;
$$;
do $$
declare
  firm_record record;
begin
  for firm_record in
    select id from public.attorney_firms
  loop
    perform public.bridge_ensure_attorney_firm_organisation(firm_record.id);
  end loop;
end $$;
create index if not exists attorney_firms_organisation_id_idx
  on public.attorney_firms (organisation_id)
  where organisation_id is not null;
grant execute on function public.bridge_attorney_role_to_organisation_role(text) to authenticated;
grant execute on function public.bridge_ensure_attorney_firm_organisation(uuid) to authenticated;
commit;
