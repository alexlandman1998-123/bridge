-- Temporary agency launch policy. Active members may manage agency operations
-- regardless of rank. Authentication, tenant isolation, and owner data integrity remain.
begin;

create or replace function public.bridge_agency_open_operations(p_organisation_id uuid)
returns boolean language sql stable security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is not null and exists (
    select 1 from public.organisation_users member
    join public.organisations organisation on organisation.id = member.organisation_id
    where member.organisation_id = p_organisation_id
      and member.user_id = auth.uid()
      and lower(coalesce(member.membership_status, member.status, '')) in ('active', 'accepted')
      and organisation.type = 'agency'
  );
$$;
revoke all on function public.bridge_agency_open_operations(uuid) from public, anon;
grant execute on function public.bridge_agency_open_operations(uuid) to authenticated;

CREATE OR REPLACE FUNCTION public.bridge_is_org_admin(target_org uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select public.bridge_agency_open_operations(target_org) or coalesce(
    public.bridge_membership_role(target_org) in (
      'super_admin',
      'owner',
      'principal',
      'director',
      'partner',
      'admin',
      'branch_manager',
      'manager',
      'sales_manager',
      'development_manager',
      'developer', 'hq_manager', 'bond_hq_admin', 'bond_hq_manager', 'commercial_hq_admin', 'commercial_hq_manager'
    ),
    false
  );
$function$;

CREATE OR REPLACE FUNCTION public.bridge_phase3_can_manage_organization(p_organization_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select public.bridge_agency_open_operations(p_organization_id) or exists (
    select 1
    from public.organisation_users ou
    where ou.organisation_id = p_organization_id
      and ou.user_id = auth.uid()
      and coalesce(ou.membership_status, ou.status) = 'active'
      and coalesce(ou.organization_role, ou.organisation_role, ou.role) in ('owner', 'admin', 'principal', 'super_admin', 'director', 'partner')
  )
$function$;

-- Queue, hierarchy and assignment RPCs consume this shared scope record.
-- Preserve the descriptive role/branch; only remove operational rank gates.
create or replace function public.bridge_phase5_membership_scope(p_organization_id uuid)
returns table(membership_id uuid, user_id uuid, role text, scope_level text,
  region_id uuid, branch_id uuid, can_manage_hierarchy boolean,
  can_manage_region boolean, can_manage_branch boolean)
language sql stable security definer set search_path = public, pg_temp
as $$
  select ou.id, ou.user_id,
    coalesce(nullif(ou.workspace_role, ''), nullif(ou.organization_role, ''), nullif(ou.organisation_role, ''), nullif(ou.role, ''), 'member'),
    coalesce(nullif(ou.scope_level, ''), case
      when coalesce(ou.organization_role, ou.organisation_role, ou.role) in ('owner', 'principal', 'admin', 'super_admin', 'director', 'partner') then 'workspace_hq'
      when coalesce(ou.primary_branch_id, ou.branch_id) is not null then 'branch'
      else 'assigned' end),
    ou.region_id, coalesce(ou.primary_branch_id, ou.branch_id),
    public.bridge_agency_open_operations(p_organization_id) or public.bridge_phase5_role_rank(coalesce(ou.workspace_role, ou.organization_role, ou.organisation_role, ou.role), ou.scope_level) >= 90,
    public.bridge_agency_open_operations(p_organization_id) or public.bridge_phase5_role_rank(coalesce(ou.workspace_role, ou.organization_role, ou.organisation_role, ou.role), ou.scope_level) >= 60,
    public.bridge_agency_open_operations(p_organization_id) or public.bridge_phase5_role_rank(coalesce(ou.workspace_role, ou.organization_role, ou.organisation_role, ou.role), ou.scope_level) >= 40
  from public.organisation_users ou
  where ou.organisation_id = p_organization_id and ou.user_id = auth.uid()
    and (coalesce(ou.membership_status, ou.status) = 'active'
      or public.bridge_agency_open_operations(p_organization_id))
  order by public.bridge_phase5_role_rank(coalesce(ou.workspace_role, ou.organization_role, ou.organisation_role, ou.role), ou.scope_level) desc,
    ou.updated_at desc nulls last, ou.created_at desc
  limit 1
$$;

CREATE OR REPLACE FUNCTION public.bridge_phase5_can_manage_branch(p_organization_id uuid, p_branch_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_scope record;
  v_branch public.organisation_branches%rowtype;
begin
  if public.bridge_agency_open_operations(p_organization_id) then
    return exists (
      select 1 from public.organisation_branches where id = p_branch_id and organisation_id = p_organization_id
    );
  end if;
  select * into v_scope from public.bridge_phase5_membership_scope(p_organization_id) limit 1;
  if not found then
    return false;
  end if;
  if v_scope.can_manage_hierarchy then
    return true;
  end if;

  select * into v_branch
  from public.organisation_branches
  where id = p_branch_id
    and organisation_id = p_organization_id;

  if v_branch.id is null then
    return false;
  end if;

  if v_scope.can_manage_region and v_scope.region_id is not null and v_scope.region_id = v_branch.region_id then
    return true;
  end if;

  return v_scope.can_manage_branch and v_scope.branch_id is not null and v_scope.branch_id = p_branch_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.bridge_guard_organisation_user_role_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_actor public.organisation_users%rowtype;
  v_previous_role text;
  v_next_role text;
  v_actor_level integer;
  v_previous_level integer;
  v_next_level integer;
begin
  if new.organisation_id = old.organisation_id and public.bridge_agency_open_operations(old.organisation_id) then
    new.updated_at := now();
    return new;
  end if;
  if new.role is not distinct from old.role
    and new.workspace_role is not distinct from old.workspace_role
    and new.organisation_role is not distinct from old.organisation_role
    and new.organization_role is not distinct from old.organization_role then
    return new;
  end if;

  -- These transaction-local flags are set only by tightly authorised
  -- SECURITY DEFINER repair/ownership procedures below or in the ownership
  -- contract. They never relax the owner-contract trigger.
  if current_setting('bridge.ownership_transfer', true) = 'on'
    or current_setting('bridge.permission_integrity_repair', true) = 'on' then
    return new;
  end if;

  if auth.uid() is null then
    return new;
  end if;

  select * into v_actor
  from public.organisation_users actor
  where actor.organisation_id = old.organisation_id
    and actor.user_id = auth.uid()
    and coalesce(actor.membership_status, actor.status) = 'active'
  order by actor.is_primary_owner desc, actor.updated_at desc nulls last, actor.created_at desc
  limit 1;

  if v_actor.id is null then
    raise exception 'An active organisation membership is required to change roles.' using errcode = '42501';
  end if;
  if v_actor.id = old.id or (old.user_id is not null and old.user_id = auth.uid()) then
    raise exception 'You cannot change your own organisation role.' using errcode = '42501';
  end if;

  v_previous_role := lower(trim(coalesce(old.workspace_role, old.organisation_role, old.organization_role, old.role, 'viewer')));
  v_next_role := lower(trim(coalesce(new.workspace_role, new.organisation_role, new.organization_role, new.role, 'viewer')));
  v_actor_level := public.bridge_organisation_role_authority_level(coalesce(v_actor.workspace_role, v_actor.organisation_role, v_actor.organization_role, v_actor.role));
  v_previous_level := public.bridge_organisation_role_authority_level(v_previous_role);
  v_next_level := public.bridge_organisation_role_authority_level(v_next_role);

  if v_actor_level < 400 then
    raise exception 'Only an organisation owner or principal can change roles.' using errcode = '42501';
  end if;
  if v_previous_level >= v_actor_level then
    raise exception 'You cannot change the role of a peer or higher-authority member.' using errcode = '42501';
  end if;
  if v_next_level >= v_actor_level then
    raise exception 'You cannot assign a role at or above your own authority level.' using errcode = '42501';
  end if;
  if v_next_role in ('owner', 'super_admin') then
    raise exception 'Owner role changes must use the ownership transfer flow.' using errcode = '42501';
  end if;

  new.updated_at := now();
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.bridge_guard_organisation_user_job_title()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_organisation_id uuid;
begin
  if tg_op = 'INSERT' and new.job_title is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.job_title is not distinct from old.job_title then
    return new;
  end if;

  v_organisation_id := case when tg_op = 'INSERT' then new.organisation_id else old.organisation_id end;

  if public.bridge_agency_open_operations(v_organisation_id) then return new; end if;

  if auth.uid() is null or not exists (
    select 1
    from public.organisation_users actor
    where actor.organisation_id = v_organisation_id
      and actor.user_id = auth.uid()
      and coalesce(actor.membership_status, actor.status) = 'active'
      and lower(trim(coalesce(actor.workspace_role, actor.organisation_role, actor.role, ''))) = 'owner'
  ) then
    raise exception 'Only the organisation owner can change job titles.' using errcode = '42501';
  end if;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.bridge_set_organisation_user_job_title(p_membership_id uuid, p_job_title text)
 RETURNS organisation_users
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_target public.organisation_users%rowtype;
  v_job_title text := nullif(trim(coalesce(p_job_title, '')), '');
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  select * into v_target
  from public.organisation_users
  where id = p_membership_id;

  if v_target.id is null then
    raise exception 'Organisation user not found.' using errcode = 'P0002';
  end if;

  if not exists (
    select 1
    from public.organisation_users actor
    where actor.organisation_id = v_target.organisation_id
      and actor.user_id = auth.uid()
      and coalesce(actor.membership_status, actor.status) = 'active'
      and (public.bridge_agency_open_operations(v_target.organisation_id)
        or lower(trim(coalesce(actor.workspace_role, actor.organisation_role, actor.role, ''))) = 'owner')
  ) then
    raise exception 'Only the organisation owner can change job titles.' using errcode = '42501';
  end if;

  update public.organisation_users
  set job_title = v_job_title,
      updated_at = now()
  where id = v_target.id
  returning * into v_target;

  return v_target;
end;
$function$;

CREATE OR REPLACE FUNCTION public.bridge_grant_organisation_owner(p_target_membership_id uuid, p_make_primary boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_actor public.organisation_users%rowtype;
  v_target public.organisation_users%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  select * into v_target
  from public.organisation_users
  where id = p_target_membership_id
  for update;

  if v_target.id is null then
    raise exception 'The selected organisation member was not found.' using errcode = 'P0002';
  end if;
  if v_target.user_id is null or coalesce(v_target.membership_status, v_target.status) <> 'active' then
    raise exception 'Ownership can only be granted to an active member who has accepted their invite.' using errcode = '22023';
  end if;

  select * into v_actor
  from public.organisation_users
  where organisation_id = v_target.organisation_id
    and user_id = auth.uid()
    and coalesce(membership_status, status) = 'active'
    and (public.bridge_agency_open_operations(v_target.organisation_id) or (
      coalesce(is_primary_owner, false)
      and lower(trim(coalesce(workspace_role, organisation_role, organization_role, role, ''))) = 'owner'
    ))
  order by updated_at desc nulls last, created_at desc
  limit 1
  for update;

  if v_actor.id is null then
    raise exception 'Only the active primary organisation owner can grant ownership.' using errcode = '42501';
  end if;
  if v_target.id = v_actor.id and not public.bridge_agency_open_operations(v_target.organisation_id) then
    raise exception 'The primary owner already has ownership.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_target.organisation_id::text, 0));
  perform set_config('bridge.ownership_transfer', 'on', true);

  if p_make_primary then
    update public.organisation_users
    set is_primary_owner = false,
        updated_at = now()
    where organisation_id = v_target.organisation_id
      and id <> v_target.id
      and coalesce(is_primary_owner, false);
  end if;

  update public.organisation_users
  set role = 'owner',
      workspace_role = 'owner',
      organisation_role = 'owner',
      organization_role = 'owner',
      is_primary_owner = case when p_make_primary then true else coalesce(is_primary_owner, false) end,
      job_title = case when p_make_primary then 'organisation_owner' else job_title end,
      updated_at = now()
  where id = v_target.id
  returning * into v_target;

  insert into public.organization_events (
    organization_id, actor_user_id, target_user_id, event_type, event_data
  ) values (
    v_target.organisation_id,
    auth.uid(),
    v_target.user_id,
    case when p_make_primary then 'organisation_primary_owner_assigned' else 'organisation_owner_granted' end,
    jsonb_build_object('membershipId', v_target.id, 'primaryOwner', p_make_primary)
  );

  return jsonb_build_object('organisationId', v_target.organisation_id, 'owner', to_jsonb(v_target));
end;
$function$;

CREATE OR REPLACE FUNCTION public.bridge_transfer_organisation_ownership(p_target_membership_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_actor public.organisation_users%rowtype;
  v_target public.organisation_users%rowtype;
  v_previous_primary public.organisation_users%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  select * into v_target
  from public.organisation_users
  where id = p_target_membership_id
  for update;

  if v_target.id is null then
    raise exception 'The selected organisation member was not found.' using errcode = 'P0002';
  end if;

  select * into v_actor
  from public.organisation_users
  where organisation_id = v_target.organisation_id
    and user_id = auth.uid()
    and coalesce(membership_status, status) = 'active'
    and (public.bridge_agency_open_operations(v_target.organisation_id) or (
      coalesce(is_primary_owner, false)
      and lower(trim(coalesce(workspace_role, organisation_role, organization_role, role, ''))) = 'owner'
    ))
  order by updated_at desc nulls last, created_at desc
  limit 1
  for update;

  if v_actor.id is null then
    raise exception 'Only the active primary organisation owner can transfer primary ownership.' using errcode = '42501';
  end if;
  if v_target.id = v_actor.id and not public.bridge_agency_open_operations(v_target.organisation_id) then
    raise exception 'Choose another active member to receive primary ownership.' using errcode = '22023';
  end if;
  if v_target.user_id is null or coalesce(v_target.membership_status, v_target.status) <> 'active' then
    raise exception 'Primary ownership can only be assigned to an active member who has accepted their invite.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_target.organisation_id::text, 0));
  perform set_config('bridge.ownership_transfer', 'on', true);
  select * into v_previous_primary from public.organisation_users
  where organisation_id = v_target.organisation_id and coalesce(is_primary_owner, false)
  order by updated_at desc nulls last limit 1;

  update public.organisation_users
  set is_primary_owner = false,
      updated_at = now()
  where organisation_id = v_target.organisation_id
    and coalesce(is_primary_owner, false);

  update public.organisation_users
  set role = 'owner',
      workspace_role = 'owner',
      organisation_role = 'owner',
      organization_role = 'owner',
      is_primary_owner = true,
      job_title = 'organisation_owner',
      updated_at = now()
  where id = v_target.id
  returning * into v_target;

  insert into public.organization_events (
    organization_id, actor_user_id, target_user_id, event_type, event_data
  ) values (
    v_target.organisation_id,
    auth.uid(),
    v_target.user_id,
    'organisation_primary_ownership_transferred',
    jsonb_build_object('previousPrimaryOwnerMembershipId', v_previous_primary.id, 'newPrimaryOwnerMembershipId', v_target.id)
  );

  return jsonb_build_object(
    'organisationId', v_target.organisation_id,
    'previousOwner', to_jsonb(v_previous_primary),
    'newOwner', to_jsonb(v_target)
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.bridge_save_organisation_partner(p_organisation_id uuid, p_partner_role_configuration_id uuid DEFAULT NULL::uuid, p_external_partner_id uuid DEFAULT NULL::uuid, p_partner_organisation_id uuid DEFAULT NULL::uuid, p_role_type text DEFAULT 'transfer_attorney'::text, p_company_name text DEFAULT NULL::text, p_contact_person text DEFAULT NULL::text, p_email_address text DEFAULT NULL::text, p_phone_number text DEFAULT NULL::text, p_website text DEFAULT NULL::text, p_physical_address text DEFAULT NULL::text, p_province text DEFAULT NULL::text, p_notes text DEFAULT NULL::text, p_is_active boolean DEFAULT true, p_is_preferred_default boolean DEFAULT false, p_source text DEFAULT 'manual'::text, p_scope_type text DEFAULT 'all_developments'::text, p_scope_json jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_identity_result jsonb;
  v_role_result jsonb;
  v_external_partner_id uuid;
  v_relationship_id uuid;
  v_resolved_role_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if not public.bridge_phase3_can_manage_organization(p_organisation_id) then
    raise exception 'You cannot manage partners for this organisation.' using errcode = '42501';
  end if;

  v_identity_result := public.bridge_upsert_organisation_partner_identity(
    p_organisation_id,
    p_external_partner_id,
    case public.bridge_normalize_partner_role_type(p_role_type)
      when 'referral_agency' then 'agency'
      else public.bridge_normalize_partner_role_type(p_role_type)
    end,
    p_partner_organisation_id,
    p_company_name,
    p_contact_person,
    p_email_address,
    p_phone_number,
    p_website,
    p_physical_address,
    p_province,
    p_notes,
    p_is_active,
    p_is_preferred_default,
    p_source,
    p_scope_type,
    p_scope_json
  );
  v_external_partner_id := nullif(v_identity_result #>> '{partner,id}', '')::uuid;

  select role_config.id, role_config.relationship_id
  into v_resolved_role_id, v_relationship_id
  from public.organisation_partner_roles role_config
  where role_config.organisation_id = p_organisation_id
    and role_config.external_partner_id = v_external_partner_id
    and role_config.role_type = public.bridge_normalize_partner_role_type(p_role_type)
  limit 1;

  v_role_result := public.bridge_upsert_organisation_partner_role(
    p_organisation_id,
    coalesce(v_resolved_role_id, p_partner_role_configuration_id),
    v_relationship_id,
    v_external_partner_id,
    p_role_type,
    p_is_active,
    p_is_preferred_default,
    p_source,
    p_scope_type,
    p_scope_json
  );

  return jsonb_build_object(
    'success', true,
    'partner', (v_identity_result -> 'partner') || jsonb_build_object(
      'partner_role_configuration_id', v_role_result #>> '{role,id}',
      'partnerRoleConfigurationId', v_role_result #>> '{role,id}',
      'relationship_id', v_role_result #>> '{role,relationship_id}'
    ),
    'role', v_role_result -> 'role',
    'storage', 'organisation_partner_roles'
  );
end;
$function$;

create policy agency_open_operations on public.organisation_branches
for all to authenticated
using (public.bridge_agency_open_operations(organisation_id))
with check (public.bridge_agency_open_operations(organisation_id));

create policy agency_open_operations on public.commission_levels
for all to authenticated
using (public.bridge_agency_open_operations(organisation_id))
with check (public.bridge_agency_open_operations(organisation_id));

create policy agency_open_operations on public.referral_commission_rules
for all to authenticated
using (public.bridge_agency_open_operations(organisation_id))
with check (public.bridge_agency_open_operations(organisation_id));

create policy agency_open_operations on public.commission_targets
for all to authenticated
using (public.bridge_agency_open_operations(organisation_id))
with check (public.bridge_agency_open_operations(organisation_id));

create policy agency_open_operations on public.organisation_commission_structures
for all to authenticated
using (public.bridge_agency_open_operations(organisation_id))
with check (public.bridge_agency_open_operations(organisation_id));

create policy agency_open_operations on public.organisation_user_commission_profiles
for all to authenticated
using (public.bridge_agency_open_operations(organisation_id))
with check (public.bridge_agency_open_operations(organisation_id));

-- Keep member records anchored to their own agency through existing RLS.
-- Partner identity writes continue through the canonical RPC; no direct client grants.
revoke all on function public.bridge_grant_organisation_owner(uuid, boolean) from public, anon;
revoke all on function public.bridge_transfer_organisation_ownership(uuid) from public, anon;
grant execute on function public.bridge_grant_organisation_owner(uuid, boolean) to authenticated;
grant execute on function public.bridge_transfer_organisation_ownership(uuid) to authenticated;

commit;
