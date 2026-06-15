create extension if not exists "pgcrypto";

alter table if exists public.organisations
  add column if not exists organization_type text,
  add column if not exists organization_subtype text,
  add column if not exists description text,
  add column if not exists email text,
  add column if not exists phone text,
  add column if not exists logo_url text;

update public.organisations
set organization_type = coalesce(
      organization_type,
      case
        when type = 'developer_company' then 'developer'
        when type in ('agency', 'attorney_firm', 'bond_originator') then type
        else 'service_provider'
      end
    ),
    email = coalesce(email, company_email, billing_email, support_email),
    phone = coalesce(phone, company_phone, support_phone)
where organization_type is null
   or email is null
   or phone is null;

alter table if exists public.organisations
  drop constraint if exists organisations_organization_type_check;
alter table if exists public.organisations
  add constraint organisations_organization_type_check
  check (organization_type is null or organization_type in ('agency', 'attorney_firm', 'bond_originator', 'developer', 'service_provider'));

alter table if exists public.organisations
  drop constraint if exists organisations_status_check;
alter table if exists public.organisations
  add constraint organisations_status_check
  check (status in ('active', 'inactive', 'pending', 'suspended', 'archived'));

alter table if exists public.organisation_users
  add column if not exists membership_status text,
  add column if not exists organization_role text,
  add column if not exists request_message text,
  add column if not exists requested_at timestamptz,
  add column if not exists reviewed_by uuid references auth.users(id) on delete set null,
  add column if not exists reviewed_at timestamptz,
  add column if not exists removed_at timestamptz;

update public.organisation_users
set membership_status = coalesce(membership_status, status),
    organization_role = coalesce(organization_role, organisation_role, role),
    requested_at = coalesce(requested_at, created_at)
where membership_status is null
   or organization_role is null
   or requested_at is null;

alter table if exists public.organisation_users
  drop constraint if exists organisation_users_membership_status_check;
alter table if exists public.organisation_users
  add constraint organisation_users_membership_status_check
  check (
    membership_status is null
    or membership_status in ('pending', 'active', 'removed', 'declined', 'invited', 'deactivated')
  );

alter table if exists public.organisation_users
  drop constraint if exists organisation_users_phase3_organization_role_check;
alter table if exists public.organisation_users
  add constraint organisation_users_phase3_organization_role_check
  check (
    organization_role is null
    or organization_role in (
      'owner',
      'admin',
      'member',
      'principal',
      'super_admin',
      'director',
      'partner',
      'viewer',
      'agent',
      'attorney',
      'branch_manager',
      'compliance',
      'consultant',
      'firm_admin',
      'hq_manager',
      'processor',
      'regional_manager'
    )
  );

alter table if exists public.partner_prospects
  add column if not exists organisation_id uuid references public.organisations(id) on delete set null;
alter table if exists public.partner_prospects
  add column if not exists organization_id uuid references public.organisations(id) on delete set null;

update public.partner_prospects
set organisation_id = coalesce(organisation_id, organization_id),
    organization_id = coalesce(organization_id, organisation_id)
where organisation_id is distinct from organization_id;

create index if not exists partner_prospects_organisation_idx
  on public.partner_prospects (organisation_id);

alter table if exists public.transaction_partner_invitations
  add column if not exists organisation_id uuid references public.organisations(id) on delete set null;
alter table if exists public.transaction_role_players
  add column if not exists partner_organisation_id uuid references public.organisations(id) on delete set null;
alter table if exists public.transaction_participants
  add column if not exists partner_organisation_id uuid references public.organisations(id) on delete set null;

create table if not exists public.organization_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organisations(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  target_user_id uuid references auth.users(id) on delete set null,
  partner_prospect_id uuid references public.partner_prospects(id) on delete set null,
  transaction_id uuid references public.transactions(id) on delete set null,
  event_type text not null,
  event_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists organization_events_org_idx
  on public.organization_events (organization_id, created_at desc);
create index if not exists organization_events_actor_idx
  on public.organization_events (actor_user_id, created_at desc);

create or replace view public.organization_members
with (security_invoker = true)
as
select
  ou.id,
  ou.organisation_id as organization_id,
  ou.user_id,
  coalesce(ou.membership_status, ou.status) as membership_status,
  coalesce(ou.organization_role, ou.organisation_role, ou.role) as organization_role,
  ou.joined_at,
  ou.created_at,
  ou.updated_at
from public.organisation_users ou;

create or replace function public.bridge_phase3_normalize_organization_type(p_value text)
returns text
language sql
immutable
as $$
  select case
    when lower(trim(coalesce(p_value, ''))) in ('agency', 'estate_agency', 'real_estate_agency') then 'agency'
    when lower(trim(coalesce(p_value, ''))) in ('attorney_firm', 'attorney firm', 'attorneys', 'conveyancer', 'conveyancing_firm') then 'attorney_firm'
    when lower(trim(coalesce(p_value, ''))) in ('bond_originator', 'bond originator', 'originator') then 'bond_originator'
    when lower(trim(coalesce(p_value, ''))) in ('developer', 'developer_company', 'development') then 'developer'
    else 'service_provider'
  end
$$;

create or replace function public.bridge_phase3_workspace_type(p_organization_type text)
returns text
language sql
immutable
as $$
  select case
    when p_organization_type = 'developer' then 'developer_company'
    when p_organization_type in ('agency', 'attorney_firm', 'bond_originator') then p_organization_type
    else 'agency'
  end
$$;

create or replace function public.bridge_phase3_org_role(p_value text)
returns text
language sql
immutable
as $$
  select case
    when lower(trim(coalesce(p_value, ''))) in ('owner', 'principal', 'super_admin', 'director', 'partner') then 'owner'
    when lower(trim(coalesce(p_value, ''))) in ('admin', 'administrator', 'manager') then 'admin'
    else 'member'
  end
$$;

create or replace function public.bridge_phase3_legacy_org_role(p_value text)
returns text
language sql
immutable
as $$
  select case
    when public.bridge_phase3_org_role(p_value) = 'owner' then 'principal'
    when public.bridge_phase3_org_role(p_value) = 'admin' then 'admin'
    else 'viewer'
  end
$$;

create or replace function public.bridge_phase3_app_role(p_organization_type text)
returns text
language sql
immutable
as $$
  select case
    when p_organization_type = 'attorney_firm' then 'attorney'
    when p_organization_type = 'bond_originator' then 'bond_originator'
    when p_organization_type = 'developer' then 'developer'
    else 'agent'
  end
$$;

create or replace function public.bridge_phase3_can_manage_organization(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organisation_users ou
    where ou.organisation_id = p_organization_id
      and ou.user_id = auth.uid()
      and coalesce(ou.membership_status, ou.status) = 'active'
      and coalesce(ou.organization_role, ou.organisation_role, ou.role) in ('owner', 'admin', 'principal', 'super_admin', 'director', 'partner')
  )
$$;

create or replace function public.bridge_phase3_log_organization_event(
  p_organization_id uuid,
  p_event_type text,
  p_actor_user_id uuid default null,
  p_target_user_id uuid default null,
  p_partner_prospect_id uuid default null,
  p_transaction_id uuid default null,
  p_event_data jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_organization_id is null then
    return;
  end if;

  insert into public.organization_events (
    organization_id,
    actor_user_id,
    target_user_id,
    partner_prospect_id,
    transaction_id,
    event_type,
    event_data
  )
  values (
    p_organization_id,
    p_actor_user_id,
    p_target_user_id,
    p_partner_prospect_id,
    p_transaction_id,
    p_event_type,
    coalesce(p_event_data, '{}'::jsonb)
  );
exception
  when undefined_table or undefined_column or insufficient_privilege then
    return;
end;
$$;

create or replace function public.bridge_phase3_find_matching_prospects(
  p_name text,
  p_organization_type text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := nullif(trim(coalesce(p_name, '')), '');
  v_key text := public.bridge_partner_prospect_key(p_name);
  v_role text;
  v_rows jsonb := '[]'::jsonb;
begin
  if v_name is null then
    return '[]'::jsonb;
  end if;

  v_role := case public.bridge_phase3_normalize_organization_type(p_organization_type)
    when 'attorney_firm' then 'attorney'
    when 'bond_originator' then 'bond_originator'
    when 'developer' then 'developer'
    else null
  end;

  select coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.transaction_count desc, row_data.company_name), '[]'::jsonb)
  into v_rows
  from (
    select
      pp.id,
      pp.company_name,
      pp.contact_name,
      pp.email,
      pp.role_type,
      pp.status,
      pp.transaction_count,
      pp.last_transaction_date,
      pp.organisation_id,
      pp.organization_id
    from public.partner_prospects pp
    where pp.organisation_id is null
      and pp.organization_id is null
      and (v_role is null or pp.role_type = v_role)
      and (
        pp.company_key = v_key
        or pp.company_name ilike '%' || v_name || '%'
        or v_name ilike '%' || pp.company_name || '%'
      )
    limit 8
  ) row_data;

  return v_rows;
end;
$$;

create or replace function public.bridge_phase3_create_organization(
  p_organization jsonb,
  p_partner_prospect_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_name text := nullif(trim(coalesce(p_organization->>'name', p_organization->>'organizationName', p_organization->>'organisationName', '')), '');
  v_type text := public.bridge_phase3_normalize_organization_type(coalesce(p_organization->>'organization_type', p_organization->>'organizationType', p_organization->>'type', ''));
  v_subtype text := nullif(trim(coalesce(p_organization->>'organization_subtype', p_organization->>'organizationSubtype', '')), '');
  v_phone text := nullif(trim(coalesce(p_organization->>'phone', '')), '');
  v_email text := nullif(lower(trim(coalesce(p_organization->>'email', ''))), '');
  v_website text := nullif(trim(coalesce(p_organization->>'website', '')), '');
  v_description text := nullif(trim(coalesce(p_organization->>'description', '')), '');
  v_logo_url text := nullif(trim(coalesce(p_organization->>'logo_url', p_organization->>'logoUrl', '')), '');
  v_workspace_type text := public.bridge_phase3_workspace_type(v_type);
  v_existing_org uuid;
  v_org public.organisations%rowtype;
  v_profile public.profiles%rowtype;
  v_membership_id uuid;
begin
  if v_user_id is null then
    return jsonb_build_object('success', false, 'code', 'not_authenticated');
  end if;

  if v_name is null then
    return jsonb_build_object('success', false, 'code', 'organization_name_required');
  end if;

  select *
  into v_profile
  from public.profiles
  where id = v_user_id
  limit 1;

  select id
  into v_existing_org
  from public.organisations
  where lower(name) = lower(v_name)
    and coalesce(organization_type, type) = v_type
  limit 1;

  if v_existing_org is not null then
    return jsonb_build_object('success', false, 'code', 'organization_already_exists', 'organizationId', v_existing_org);
  end if;

  insert into public.organisations (
    name,
    display_name,
    type,
    workspace_kind,
    organization_type,
    organization_subtype,
    description,
    website,
    email,
    phone,
    logo_url,
    company_email,
    company_phone,
    support_email,
    support_phone,
    status,
    created_by
  )
  values (
    v_name,
    v_name,
    v_workspace_type,
    v_workspace_type,
    v_type,
    v_subtype,
    v_description,
    v_website,
    v_email,
    v_phone,
    v_logo_url,
    v_email,
    v_phone,
    v_email,
    v_phone,
    'active',
    v_user_id
  )
  returning * into v_org;

  insert into public.organisation_users (
    organisation_id,
    user_id,
    first_name,
    last_name,
    email,
    role,
    organisation_role,
    organization_role,
    app_role,
    workspace_type,
    workspace_role,
    status,
    membership_status,
    joined_at,
    accepted_at,
    created_by
  )
  values (
    v_org.id,
    v_user_id,
    v_profile.first_name,
    v_profile.last_name,
    coalesce(v_profile.email, lower(auth.jwt() ->> 'email')),
    'principal',
    'principal',
    'owner',
    public.bridge_phase3_app_role(v_type),
    v_workspace_type,
    'principal',
    'active',
    'active',
    now(),
    now(),
    v_user_id
  )
  on conflict (organisation_id, user_id) do update
  set status = 'active',
      membership_status = 'active',
      role = 'principal',
      organisation_role = 'principal',
      organization_role = 'owner',
      joined_at = coalesce(public.organisation_users.joined_at, now()),
      accepted_at = coalesce(public.organisation_users.accepted_at, now()),
      updated_at = now()
  returning id into v_membership_id;

  if p_partner_prospect_id is not null then
    update public.partner_prospects
    set organisation_id = v_org.id,
        organization_id = v_org.id,
        status = case when status = 'joined' then status else 'joined' end,
        updated_at = now()
    where id = p_partner_prospect_id;

    perform public.bridge_phase3_log_organization_event(
      v_org.id,
      'Prospect Linked',
      v_user_id,
      null,
      p_partner_prospect_id,
      null,
      jsonb_build_object('organizationName', v_name)
    );
  end if;

  perform public.bridge_phase3_log_organization_event(
    v_org.id,
    'Organization Created',
    v_user_id,
    v_user_id,
    p_partner_prospect_id,
    null,
    jsonb_build_object('organizationType', v_type, 'organizationSubtype', v_subtype)
  );

  return jsonb_build_object(
    'success', true,
    'organization', to_jsonb(v_org),
    'membershipId', v_membership_id
  );
end;
$$;

create or replace function public.bridge_phase3_request_organization_membership(
  p_organization_id uuid,
  p_message text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_profile public.profiles%rowtype;
  v_org public.organisations%rowtype;
  v_membership public.organisation_users%rowtype;
begin
  if v_user_id is null then
    return jsonb_build_object('success', false, 'code', 'not_authenticated');
  end if;

  select *
  into v_org
  from public.organisations
  where id = p_organization_id
  limit 1;

  if v_org.id is null then
    return jsonb_build_object('success', false, 'code', 'organization_not_found');
  end if;

  select *
  into v_profile
  from public.profiles
  where id = v_user_id
  limit 1;

  insert into public.organisation_users (
    organisation_id,
    user_id,
    first_name,
    last_name,
    email,
    role,
    organisation_role,
    organization_role,
    app_role,
    workspace_type,
    workspace_role,
    status,
    membership_status,
    request_message,
    requested_at,
    created_by
  )
  values (
    p_organization_id,
    v_user_id,
    v_profile.first_name,
    v_profile.last_name,
    coalesce(v_profile.email, lower(auth.jwt() ->> 'email')),
    'viewer',
    'viewer',
    'member',
    public.bridge_phase3_app_role(coalesce(v_org.organization_type, v_org.type)),
    coalesce(v_org.workspace_kind, v_org.type),
    'viewer',
    'pending',
    'pending',
    nullif(trim(coalesce(p_message, '')), ''),
    now(),
    v_user_id
  )
  on conflict (organisation_id, user_id) do update
  set status = case when public.organisation_users.status in ('removed', 'deactivated', 'declined') then 'pending' else public.organisation_users.status end,
      membership_status = case when coalesce(public.organisation_users.membership_status, public.organisation_users.status) in ('removed', 'declined') then 'pending' else coalesce(public.organisation_users.membership_status, public.organisation_users.status) end,
      request_message = excluded.request_message,
      requested_at = now(),
      updated_at = now()
  returning * into v_membership;

  perform public.bridge_phase3_log_organization_event(
    p_organization_id,
    'Membership Requested',
    v_user_id,
    v_user_id,
    null,
    null,
    jsonb_build_object('message', p_message, 'membershipId', v_membership.id)
  );

  return jsonb_build_object('success', true, 'membership', to_jsonb(v_membership));
end;
$$;

create or replace function public.bridge_phase3_review_organization_membership(
  p_membership_id uuid,
  p_action text,
  p_organization_role text default 'member'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_action text := lower(trim(coalesce(p_action, '')));
  v_org_role text := public.bridge_phase3_org_role(p_organization_role);
  v_legacy_role text := public.bridge_phase3_legacy_org_role(p_organization_role);
  v_membership public.organisation_users%rowtype;
begin
  if v_actor is null then
    return jsonb_build_object('success', false, 'code', 'not_authenticated');
  end if;

  select *
  into v_membership
  from public.organisation_users
  where id = p_membership_id
  for update;

  if v_membership.id is null then
    return jsonb_build_object('success', false, 'code', 'membership_not_found');
  end if;

  if not public.bridge_phase3_can_manage_organization(v_membership.organisation_id) then
    return jsonb_build_object('success', false, 'code', 'not_authorized');
  end if;

  if v_action in ('approve', 'approved') then
    update public.organisation_users
    set status = 'active',
        membership_status = 'active',
        role = v_legacy_role,
        organisation_role = v_legacy_role,
        organization_role = v_org_role,
        reviewed_by = v_actor,
        reviewed_at = now(),
        joined_at = coalesce(joined_at, now()),
        accepted_at = coalesce(accepted_at, now()),
        updated_at = now()
    where id = p_membership_id
    returning * into v_membership;

    perform public.bridge_phase3_log_organization_event(
      v_membership.organisation_id,
      'Membership Approved',
      v_actor,
      v_membership.user_id,
      null,
      null,
      jsonb_build_object('membershipId', v_membership.id, 'organizationRole', v_org_role)
    );
  elsif v_action in ('decline', 'declined', 'reject', 'rejected') then
    update public.organisation_users
    set status = 'removed',
        membership_status = 'declined',
        reviewed_by = v_actor,
        reviewed_at = now(),
        removed_at = now(),
        updated_at = now()
    where id = p_membership_id
    returning * into v_membership;

    perform public.bridge_phase3_log_organization_event(
      v_membership.organisation_id,
      'Membership Rejected',
      v_actor,
      v_membership.user_id,
      null,
      null,
      jsonb_build_object('membershipId', v_membership.id)
    );
  else
    return jsonb_build_object('success', false, 'code', 'invalid_action');
  end if;

  return jsonb_build_object('success', true, 'membership', to_jsonb(v_membership));
end;
$$;

create or replace function public.bridge_phase3_update_member_role(
  p_membership_id uuid,
  p_organization_role text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_org_role text := public.bridge_phase3_org_role(p_organization_role);
  v_legacy_role text := public.bridge_phase3_legacy_org_role(p_organization_role);
  v_membership public.organisation_users%rowtype;
  v_previous_role text;
begin
  select *
  into v_membership
  from public.organisation_users
  where id = p_membership_id
  for update;

  if v_membership.id is null then
    return jsonb_build_object('success', false, 'code', 'membership_not_found');
  end if;

  if not public.bridge_phase3_can_manage_organization(v_membership.organisation_id) then
    return jsonb_build_object('success', false, 'code', 'not_authorized');
  end if;

  v_previous_role := coalesce(v_membership.organization_role, v_membership.organisation_role, v_membership.role);

  update public.organisation_users
  set role = v_legacy_role,
      organisation_role = v_legacy_role,
      organization_role = v_org_role,
      updated_at = now()
  where id = p_membership_id
  returning * into v_membership;

  perform public.bridge_phase3_log_organization_event(
    v_membership.organisation_id,
    'Role Changed',
    v_actor,
    v_membership.user_id,
    null,
    null,
    jsonb_build_object('membershipId', v_membership.id, 'previousRole', v_previous_role, 'nextRole', v_org_role)
  );

  return jsonb_build_object('success', true, 'membership', to_jsonb(v_membership));
end;
$$;

create or replace function public.bridge_phase3_remove_member(p_membership_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_membership public.organisation_users%rowtype;
begin
  select *
  into v_membership
  from public.organisation_users
  where id = p_membership_id
  for update;

  if v_membership.id is null then
    return jsonb_build_object('success', false, 'code', 'membership_not_found');
  end if;

  if not public.bridge_phase3_can_manage_organization(v_membership.organisation_id) then
    return jsonb_build_object('success', false, 'code', 'not_authorized');
  end if;

  update public.organisation_users
  set status = 'removed',
      membership_status = 'removed',
      removed_at = now(),
      reviewed_by = v_actor,
      reviewed_at = now(),
      updated_at = now()
  where id = p_membership_id
  returning * into v_membership;

  perform public.bridge_phase3_log_organization_event(
    v_membership.organisation_id,
    'Member Removed',
    v_actor,
    v_membership.user_id,
    null,
    null,
    jsonb_build_object('membershipId', v_membership.id)
  );

  return jsonb_build_object('success', true, 'membership', to_jsonb(v_membership));
end;
$$;

create or replace function public.bridge_phase3_link_prospect_to_organization(
  p_partner_prospect_id uuid,
  p_organization_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_prospect public.partner_prospects%rowtype;
begin
  if not public.bridge_phase3_can_manage_organization(p_organization_id) then
    return jsonb_build_object('success', false, 'code', 'not_authorized');
  end if;

  update public.partner_prospects
  set organisation_id = p_organization_id,
      organization_id = p_organization_id,
      updated_at = now()
  where id = p_partner_prospect_id
  returning * into v_prospect;

  if v_prospect.id is null then
    return jsonb_build_object('success', false, 'code', 'prospect_not_found');
  end if;

  perform public.bridge_phase3_log_organization_event(
    p_organization_id,
    'Prospect Linked',
    v_actor,
    null,
    p_partner_prospect_id,
    null,
    jsonb_build_object('companyName', v_prospect.company_name)
  );

  return jsonb_build_object('success', true, 'prospect', to_jsonb(v_prospect));
end;
$$;

create or replace function public.bridge_phase3_list_my_organizations()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_rows jsonb := '[]'::jsonb;
begin
  if v_user_id is null then
    return '[]'::jsonb;
  end if;

  select coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.name), '[]'::jsonb)
  into v_rows
  from (
    select
      o.id,
      o.name,
      o.display_name,
      o.type,
      o.workspace_kind,
      o.organization_type,
      o.organization_subtype,
      o.status,
      o.description,
      o.website,
      coalesce(o.email, o.company_email, o.billing_email, o.support_email) as email,
      coalesce(o.phone, o.company_phone, o.support_phone) as phone,
      o.logo_url,
      ou.id as membership_id,
      coalesce(ou.membership_status, ou.status) as membership_status,
      coalesce(ou.organization_role, ou.organisation_role, ou.role) as organization_role,
      ou.joined_at,
      (
        select count(*)
        from public.organisation_users pending
        where pending.organisation_id = o.id
          and coalesce(pending.membership_status, pending.status) = 'pending'
      ) as pending_requests,
      (
        select count(*)
        from public.organisation_users active_member
        where active_member.organisation_id = o.id
          and coalesce(active_member.membership_status, active_member.status) = 'active'
      ) as member_count,
      (
        select count(*)
        from public.transactions tx
        where tx.organisation_id = o.id
      ) as transaction_count
    from public.organisation_users ou
    join public.organisations o on o.id = ou.organisation_id
    where ou.user_id = v_user_id
      and coalesce(ou.membership_status, ou.status) in ('active', 'pending')
  ) row_data;

  return v_rows;
end;
$$;

create or replace function public.bridge_phase3_get_organization_profile(p_organization_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_can_view boolean := false;
  v_can_manage boolean := false;
  v_org jsonb;
  v_members jsonb := '[]'::jsonb;
  v_events jsonb := '[]'::jsonb;
begin
  select exists (
    select 1
    from public.organisation_users ou
    where ou.organisation_id = p_organization_id
      and ou.user_id = v_user_id
      and coalesce(ou.membership_status, ou.status) in ('active', 'pending')
  )
  into v_can_view;

  v_can_manage := public.bridge_phase3_can_manage_organization(p_organization_id);

  if not v_can_view then
    return jsonb_build_object('success', false, 'code', 'not_authorized');
  end if;

  select to_jsonb(row_data)
  into v_org
  from (
    select
      o.id,
      o.name,
      o.display_name,
      o.type,
      o.workspace_kind,
      o.organization_type,
      o.organization_subtype,
      o.status,
      o.description,
      o.website,
      coalesce(o.email, o.company_email, o.billing_email, o.support_email) as email,
      coalesce(o.phone, o.company_phone, o.support_phone) as phone,
      o.logo_url,
      o.created_at,
      o.updated_at,
      (
        select count(*)
        from public.organisation_users ou
        where ou.organisation_id = o.id
          and coalesce(ou.membership_status, ou.status) = 'active'
      ) as member_count,
      (
        select count(*)
        from public.organisation_users ou
        where ou.organisation_id = o.id
          and coalesce(ou.membership_status, ou.status) = 'pending'
      ) as pending_requests,
      (
        select count(*)
        from public.transactions tx
        where tx.organisation_id = o.id
      ) as transaction_count
    from public.organisations o
    where o.id = p_organization_id
  ) row_data;

  select coalesce(jsonb_agg(to_jsonb(member_data) order by member_data.created_at), '[]'::jsonb)
  into v_members
  from (
    select
      ou.id,
      ou.user_id,
      ou.first_name,
      ou.last_name,
      ou.email,
      coalesce(p.full_name, trim(concat(coalesce(ou.first_name, ''), ' ', coalesce(ou.last_name, ''))), ou.email) as full_name,
      coalesce(ou.membership_status, ou.status) as membership_status,
      coalesce(ou.organization_role, ou.organisation_role, ou.role) as organization_role,
      ou.request_message,
      ou.requested_at,
      ou.joined_at,
      ou.created_at,
      ou.updated_at
    from public.organisation_users ou
    left join public.profiles p on p.id = ou.user_id
    where ou.organisation_id = p_organization_id
      and (v_can_manage or ou.user_id = v_user_id or coalesce(ou.membership_status, ou.status) = 'active')
  ) member_data;

  select coalesce(jsonb_agg(to_jsonb(event_data) order by event_data.created_at desc), '[]'::jsonb)
  into v_events
  from (
    select
      oe.id,
      oe.event_type,
      oe.event_data,
      oe.actor_user_id,
      oe.target_user_id,
      oe.partner_prospect_id,
      oe.transaction_id,
      oe.created_at
    from public.organization_events oe
    where oe.organization_id = p_organization_id
    order by oe.created_at desc
    limit 40
  ) event_data;

  return jsonb_build_object(
    'success', true,
    'organization', v_org,
    'members', v_members,
    'events', v_events,
    'canManage', v_can_manage
  );
end;
$$;

create or replace function public.bridge_phase3_search_organizations(
  p_query text,
  p_organization_type text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_query text := nullif(trim(coalesce(p_query, '')), '');
  v_type text := nullif(public.bridge_phase3_normalize_organization_type(p_organization_type), 'service_provider');
  v_rows jsonb := '[]'::jsonb;
begin
  if v_query is null or length(v_query) < 2 then
    return '[]'::jsonb;
  end if;

  select coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.name), '[]'::jsonb)
  into v_rows
  from (
    select
      o.id,
      o.name,
      o.display_name,
      o.organization_type,
      o.organization_subtype,
      o.status,
      o.website
    from public.organisations o
    where o.status in ('active', 'pending')
      and (v_type is null or o.organization_type = v_type)
      and (
        o.name ilike '%' || v_query || '%'
        or o.display_name ilike '%' || v_query || '%'
        or o.email ilike '%' || v_query || '%'
        or o.company_email ilike '%' || v_query || '%'
      )
    limit 12
  ) row_data;

  return v_rows;
end;
$$;

create or replace function public.bridge_phase3_partner_prospect_sync_org()
returns trigger
language plpgsql
as $$
begin
  if new.organisation_id is distinct from old.organisation_id and new.organisation_id is not null then
    new.organization_id := new.organisation_id;
  elsif new.organization_id is distinct from old.organization_id and new.organization_id is not null then
    new.organisation_id := new.organization_id;
  end if;
  return new;
end;
$$;

drop trigger if exists partner_prospects_phase3_sync_org on public.partner_prospects;
create trigger partner_prospects_phase3_sync_org
before update of organisation_id, organization_id on public.partner_prospects
for each row execute function public.bridge_phase3_partner_prospect_sync_org();

create or replace function public.bridge_phase3_partner_invitation_org_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
begin
  if new.partner_prospect_id is null then
    return new;
  end if;

  select coalesce(pp.organisation_id, pp.organization_id)
  into v_org_id
  from public.partner_prospects pp
  where pp.id = new.partner_prospect_id;

  if v_org_id is not null then
    new.organisation_id := coalesce(new.organisation_id, v_org_id);
  end if;

  return new;
end;
$$;

drop trigger if exists transaction_partner_invitations_phase3_org_sync on public.transaction_partner_invitations;
create trigger transaction_partner_invitations_phase3_org_sync
before insert or update of partner_prospect_id on public.transaction_partner_invitations
for each row execute function public.bridge_phase3_partner_invitation_org_sync();

create or replace function public.bridge_phase3_roleplayer_org_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
begin
  if new.partner_prospect_id is not null then
    select coalesce(pp.organisation_id, pp.organization_id)
    into v_org_id
    from public.partner_prospects pp
    where pp.id = new.partner_prospect_id;

    if v_org_id is not null then
      new.partner_organisation_id := coalesce(new.partner_organisation_id, v_org_id);
      new.assigned_organisation_id := coalesce(new.assigned_organisation_id, v_org_id);
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists transaction_role_players_phase3_org_sync on public.transaction_role_players;
create trigger transaction_role_players_phase3_org_sync
before insert or update of partner_prospect_id on public.transaction_role_players
for each row execute function public.bridge_phase3_roleplayer_org_sync();

create or replace function public.bridge_phase3_participant_org_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
begin
  if new.partner_prospect_id is not null then
    select coalesce(pp.organisation_id, pp.organization_id)
    into v_org_id
    from public.partner_prospects pp
    where pp.id = new.partner_prospect_id;

    if v_org_id is not null then
      new.partner_organisation_id := coalesce(new.partner_organisation_id, v_org_id);
      new.assigned_organisation_id := coalesce(new.assigned_organisation_id, v_org_id);
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists transaction_participants_phase3_org_sync on public.transaction_participants;
create trigger transaction_participants_phase3_org_sync
before insert or update of partner_prospect_id on public.transaction_participants
for each row execute function public.bridge_phase3_participant_org_sync();

grant select on public.organization_members to authenticated;
grant select on public.organization_events to authenticated;
grant execute on function public.bridge_phase3_find_matching_prospects(text, text) to authenticated;
grant execute on function public.bridge_phase3_create_organization(jsonb, uuid) to authenticated;
grant execute on function public.bridge_phase3_request_organization_membership(uuid, text) to authenticated;
grant execute on function public.bridge_phase3_review_organization_membership(uuid, text, text) to authenticated;
grant execute on function public.bridge_phase3_update_member_role(uuid, text) to authenticated;
grant execute on function public.bridge_phase3_remove_member(uuid) to authenticated;
grant execute on function public.bridge_phase3_link_prospect_to_organization(uuid, uuid) to authenticated;
grant execute on function public.bridge_phase3_list_my_organizations() to authenticated;
grant execute on function public.bridge_phase3_get_organization_profile(uuid) to authenticated;
grant execute on function public.bridge_phase3_search_organizations(text, text) to authenticated;

alter table public.organization_events enable row level security;

drop policy if exists organization_events_member_select on public.organization_events;
create policy organization_events_member_select
on public.organization_events
for select
to authenticated
using (
  exists (
    select 1
    from public.organisation_users ou
    where ou.organisation_id = organization_events.organization_id
      and ou.user_id = auth.uid()
      and coalesce(ou.membership_status, ou.status) = 'active'
  )
);
