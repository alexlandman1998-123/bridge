begin;

-- Phase 2: prevent new role-field drift and provide an explicit, audited
-- repair path for the only unambiguous case: a membership whose populated role
-- fields already agree and merely need their legacy mirrors completed.
create or replace function public.bridge_canonicalize_organisation_membership_role()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_role text;
begin
  if tg_op = 'UPDATE' and new.role is not distinct from old.role
    and new.workspace_role is not distinct from old.workspace_role
    and new.organisation_role is not distinct from old.organisation_role
    and new.organization_role is not distinct from old.organization_role then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    v_role := coalesce(
      nullif(lower(trim(case when new.workspace_role is distinct from old.workspace_role then new.workspace_role end)), ''),
      nullif(lower(trim(case when new.organisation_role is distinct from old.organisation_role then new.organisation_role end)), ''),
      nullif(lower(trim(case when new.organization_role is distinct from old.organization_role then new.organization_role end)), ''),
      nullif(lower(trim(case when new.role is distinct from old.role then new.role end)), ''),
      nullif(lower(trim(new.workspace_role)), ''),
      nullif(lower(trim(new.organisation_role)), ''),
      nullif(lower(trim(new.organization_role)), ''),
      nullif(lower(trim(new.role)), '')
    );
  else
    v_role := coalesce(
      nullif(lower(trim(new.workspace_role)), ''),
      nullif(lower(trim(new.organisation_role)), ''),
      nullif(lower(trim(new.organization_role)), ''),
      nullif(lower(trim(new.role)), '')
    );
  end if;

  if v_role is not null then
    new.role := v_role;
    new.workspace_role := v_role;
    new.organisation_role := v_role;
    new.organization_role := v_role;
  end if;
  return new;
end;
$$;

drop trigger if exists a01_bridge_canonicalize_organisation_membership_role on public.organisation_users;
create trigger a01_bridge_canonicalize_organisation_membership_role
before insert or update of role, workspace_role, organisation_role, organization_role
on public.organisation_users
for each row execute function public.bridge_canonicalize_organisation_membership_role();

create or replace function public.bridge_guard_organisation_user_role_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor public.organisation_users%rowtype;
  v_previous_role text;
  v_next_role text;
  v_actor_level integer;
  v_previous_level integer;
  v_next_level integer;
begin
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
$$;

create or replace function public.bridge_apply_safe_organisation_permission_integrity_repair(
  p_organisation_id uuid,
  p_apply boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_candidate record;
  v_candidates jsonb := '[]'::jsonb;
  v_repaired jsonb := '[]'::jsonb;
begin
  if not public.bridge_is_platform_admin() then
    raise exception 'Only platform administrators can repair organisation permission integrity.' using errcode = '42501';
  end if;
  if p_organisation_id is null then
    raise exception 'An organisation is required for permission-integrity repair.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_organisation_id::text, 0));

  for v_candidate in
    with active_memberships as (
      select
        ou.id, ou.user_id, coalesce(ou.is_primary_owner, false) as is_primary_owner,
        nullif(lower(trim(ou.role)), '') as role_value,
        nullif(lower(trim(ou.workspace_role)), '') as workspace_role_value,
        nullif(lower(trim(ou.organisation_role)), '') as organisation_role_value,
        nullif(lower(trim(ou.organization_role)), '') as organization_role_value
      from public.organisation_users ou
      where ou.organisation_id = p_organisation_id
        and coalesce(ou.membership_status, ou.status) = 'active'
      for update
    ), candidates as (
      select m.*, coalesce(m.workspace_role_value, m.organisation_role_value, m.organization_role_value, m.role_value) as effective_role,
        cardinality(array_remove(array[m.role_value, m.workspace_role_value, m.organisation_role_value, m.organization_role_value], null)) as populated_role_field_count,
        (select count(distinct value) from unnest(array[m.role_value, m.workspace_role_value, m.organisation_role_value, m.organization_role_value]) as value where value is not null) as distinct_role_value_count
      from active_memberships m
    )
    select * from candidates
    where populated_role_field_count < 4
      and distinct_role_value_count = 1
      and effective_role is not null
      and (not is_primary_owner or effective_role = 'owner')
    order by id
  loop
    v_candidates := v_candidates || jsonb_build_array(jsonb_build_object(
      'membershipId', v_candidate.id, 'userId', v_candidate.user_id, 'role', v_candidate.effective_role
    ));

    if not p_apply then
      continue;
    end if;

    perform set_config('bridge.permission_integrity_repair', 'on', true);
    update public.organisation_users
    set role = v_candidate.effective_role,
        workspace_role = v_candidate.effective_role,
        organisation_role = v_candidate.effective_role,
        organization_role = v_candidate.effective_role,
        updated_at = now()
    where id = v_candidate.id
      and organisation_id = p_organisation_id;

    if not found then
      raise exception 'Permission-integrity repair changed concurrently for membership %.', v_candidate.id using errcode = '40001';
    end if;

    insert into public.organization_events (organization_id, actor_user_id, target_user_id, event_type, event_data)
    values (p_organisation_id, auth.uid(), v_candidate.user_id, 'organisation_permission_integrity_repaired_phase2',
      jsonb_build_object('membershipId', v_candidate.id, 'role', v_candidate.effective_role, 'mode', 'safe_role_mirror_repair'));
    v_repaired := v_repaired || jsonb_build_array(jsonb_build_object('membershipId', v_candidate.id));
  end loop;

  return jsonb_build_object('applied', p_apply, 'candidates', v_candidates, 'repaired', v_repaired);
end;
$$;

revoke all on function public.bridge_apply_safe_organisation_permission_integrity_repair(uuid, boolean) from public;
grant execute on function public.bridge_apply_safe_organisation_permission_integrity_repair(uuid, boolean) to authenticated;

commit;
