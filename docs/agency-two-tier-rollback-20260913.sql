begin;
do $undo$ declare item record; begin for item in select tablename,policyname from pg_policies where schemaname='public' and policyname like 'agency_two_tier%' loop execute format('drop policy %I on public.%I',item.policyname,item.tablename); end loop; end $undo$;
CREATE OR REPLACE FUNCTION public.bridge_agency_open_operations(p_organisation_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select auth.uid() is not null and exists (
    select 1 from public.organisation_users member
    join public.organisations organisation on organisation.id = member.organisation_id
    where member.organisation_id = p_organisation_id
      and member.user_id = auth.uid()
      and lower(coalesce(member.membership_status, member.status, '')) in ('active', 'accepted')
      and organisation.type = 'agency'
  );
$function$

CREATE OR REPLACE FUNCTION public.bridge_can_access_assignment(target_org uuid, assigned_user uuid, target_branch uuid DEFAULT NULL::uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    public.bridge_is_org_admin(target_org)
    or (
      public.bridge_is_active_member(target_org)
      and (assigned_user is null or assigned_user = auth.uid())
    );
$function$

CREATE OR REPLACE FUNCTION public.bridge_can_access_transaction_org_member(target_transaction_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.transactions tx
    where tx.id = target_transaction_id
      and tx.organisation_id is not null
      and public.bridge_is_active_member(tx.organisation_id)
  );
$function$

CREATE OR REPLACE FUNCTION public.bridge_can_access_transaction_spine(target_transaction_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_email text;
  tx record;
begin
  if v_uid is null then
    return false;
  end if;

  select
    t.owner_user_id,
    t.assigned_user_id,
    t.assigned_agent_email,
    t.assigned_attorney_email,
    t.assigned_bond_originator_email,
    t.organisation_id,
    t.assigned_branch_id
  into tx
  from public.transactions t
  where t.id = target_transaction_id;

  if not found then
    return false;
  end if;

  v_email := lower(coalesce(auth.jwt() ->> 'email', ''));

  if public.bridge_transaction_scope_is_internal_user() then return true; end if;
  if tx.owner_user_id = v_uid then return true; end if;
  if tx.assigned_user_id = v_uid then return true; end if;
  if lower(coalesce(tx.assigned_agent_email, '')) = v_email then return true; end if;
  if lower(coalesce(tx.assigned_attorney_email, '')) = v_email then return true; end if;
  if lower(coalesce(tx.assigned_bond_originator_email, '')) = v_email then return true; end if;

  if public.bridge_support_can_access_record(
    tx.organisation_id,
    tx.assigned_branch_id,
    'transaction',
    tx.owner_user_id,
    tx.assigned_user_id,
    null
  ) then return true; end if;

  if exists (
    select 1
    from public.organisation_users ou
    where ou.organisation_id = tx.organisation_id
      and ou.user_id = v_uid
      and coalesce(ou.status, 'active') in ('active', 'accepted')
      and (
        ou.scope_level in ('organisation', 'organization', 'workspace_hq')
        or coalesce(ou.workspace_role, ou.organisation_role, ou.role) in (
          'owner', 'principal', 'director', 'partner', 'admin', 'admin_staff', 'manager', 'hq_manager'
        )
        or (ou.scope_level = 'branch' and ou.workspace_unit_id = tx.assigned_branch_id)
      )
  ) then return true; end if;

  if exists (
    select 1
    from public.transaction_participants tp
    where tp.transaction_id = target_transaction_id
      and coalesce(tp.status, 'active') = 'active'
      and tp.removed_at is null
      and (
        tp.user_id = v_uid
        or tp.assigned_user_id = v_uid
        or lower(coalesce(tp.participant_email, '')) = v_email
      )
  ) then return true; end if;

  if exists (
    select 1
    from public.transaction_role_players trp
    where trp.transaction_id = target_transaction_id
      and coalesce(trp.status, 'active') <> 'removed'
      and trp.removed_at is null
      and (
        trp.user_id = v_uid
        or trp.assigned_user_id = v_uid
        or lower(coalesce(trp.email_address, '')) = v_email
      )
  ) then return true; end if;

  -- Keep production's firm-first visibility: an active member may access a
  -- matter assigned to either its firm or the firm's organisation.
  if exists (
    select 1
    from public.transaction_attorney_assignments taa
    left join public.attorney_firms af
      on af.id = coalesce(taa.attorney_firm_id, taa.firm_id)
    where taa.transaction_id = target_transaction_id
      and coalesce(taa.assignment_status, 'pending') in ('pending', 'active', 'paused')
      and coalesce(taa.status, 'active') <> 'removed'
      and (
        taa.assigned_user_id = v_uid
        or taa.primary_attorney_id = v_uid
        or taa.attorney_user_id = v_uid
        or public.bridge_is_active_member(taa.assigned_organisation_id)
        or public.bridge_is_active_member(af.organisation_id)
        or exists (
          select 1
          from public.attorney_firm_members member
          where member.firm_id = coalesce(taa.attorney_firm_id, taa.firm_id, taa.assigned_organisation_id)
            and member.user_id = v_uid
            and coalesce(member.status, 'active') in ('active', 'accepted')
        )
      )
  ) then return true; end if;

  if exists (
    select 1
    from public.transaction_bond_applications tba
    where tba.transaction_id = target_transaction_id
      and public.bridge_can_access_bond_application_scope(tba.id)
  ) then return true; end if;

  return false;
end;
$function$

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
$function$

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
$function$

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
$function$

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
$function$

CREATE OR REPLACE FUNCTION public.bridge_phase5_membership_scope(p_organization_id uuid)
 RETURNS TABLE(membership_id uuid, user_id uuid, role text, scope_level text, region_id uuid, branch_id uuid, can_manage_hierarchy boolean, can_manage_region boolean, can_manage_branch boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$

drop function public.bridge_agency_management_scope(uuid);
drop function public.bridge_agency_lead_scope(uuid),public.bridge_agency_transaction_scope(uuid);
drop function public.bridge_agency_record_scope(uuid,uuid,uuid,uuid);
commit;
