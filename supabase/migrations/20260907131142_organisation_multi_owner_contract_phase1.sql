begin;

-- Phase 1 ownership contract
--
-- Organisations may have many active owners, but only one may be designated
-- as the active primary owner.  `principal` is an operational role and is not
-- an ownership alias.  This guard applies the contract to all future writes;
-- the separate remediation phase reconciles historical rows before a unique
-- index is added.
-- The current onboarding RPC historically creates the primary agency member as
-- `principal` and then marks it primary.  Canonicalise that explicit
-- onboarding declaration before the general role guard runs; this is not a
-- general principal-to-owner promotion path.
create or replace function public.bridge_canonicalize_onboarding_primary_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(new.is_primary_owner, false)
    and coalesce(new.scope_metadata->>'source', '') = 'bridge_complete_workspace_onboarding_phase2'
  then
    new.role := 'owner';
    new.workspace_role := 'owner';
    new.organisation_role := 'owner';
    new.organization_role := 'owner';
  end if;
  return new;
end;
$$;

drop trigger if exists a00_bridge_canonicalize_onboarding_primary_owner on public.organisation_users;
create trigger a00_bridge_canonicalize_onboarding_primary_owner
before insert or update of role, workspace_role, organisation_role, organization_role, scope_metadata, is_primary_owner
on public.organisation_users
for each row execute function public.bridge_canonicalize_onboarding_primary_owner();

create or replace function public.bridge_guard_organisation_owner_contract()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new_role text;
  v_new_is_active boolean;
  v_old_role text;
  v_old_is_active boolean;
begin
  if tg_op <> 'DELETE' then
    v_new_role := lower(trim(coalesce(new.workspace_role, new.organisation_role, new.organization_role, new.role, 'viewer')));
    v_new_is_active := coalesce(new.membership_status, new.status) = 'active';

    if coalesce(new.is_primary_owner, false) and (v_new_role <> 'owner' or not v_new_is_active) then
      raise exception 'A primary organisation owner must be an active member with the owner role.' using errcode = '23514';
    end if;

    if coalesce(new.is_primary_owner, false) and exists (
      select 1
      from public.organisation_users existing
      where existing.organisation_id = new.organisation_id
        and existing.id is distinct from new.id
        and coalesce(existing.membership_status, existing.status) = 'active'
        and coalesce(existing.is_primary_owner, false)
    ) then
      raise exception 'An organisation can have only one active primary owner.' using errcode = '23505';
    end if;
  end if;

  if tg_op in ('UPDATE', 'DELETE') then
    v_old_role := lower(trim(coalesce(old.workspace_role, old.organisation_role, old.organization_role, old.role, 'viewer')));
    v_old_is_active := coalesce(old.membership_status, old.status) = 'active';

    if v_old_role = 'owner' and v_old_is_active and (
      tg_op = 'DELETE' or v_new_role <> 'owner' or not v_new_is_active
    ) and not exists (
      select 1
      from public.organisation_users existing
      where existing.organisation_id = old.organisation_id
        and existing.id <> old.id
        and coalesce(existing.membership_status, existing.status) = 'active'
        and lower(trim(coalesce(existing.workspace_role, existing.organisation_role, existing.organization_role, existing.role, 'viewer'))) = 'owner'
    ) then
      raise exception 'An active organisation must retain at least one owner.' using errcode = '23514';
    end if;
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists zzz_bridge_guard_organisation_owner_contract on public.organisation_users;
create trigger zzz_bridge_guard_organisation_owner_contract
before insert or update of role, workspace_role, organisation_role, organization_role, status, membership_status, is_primary_owner or delete
on public.organisation_users
for each row execute function public.bridge_guard_organisation_owner_contract();

create or replace function public.bridge_grant_organisation_owner(
  p_target_membership_id uuid,
  p_make_primary boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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
    and coalesce(is_primary_owner, false)
    and lower(trim(coalesce(workspace_role, organisation_role, organization_role, role, ''))) = 'owner'
  order by updated_at desc nulls last, created_at desc
  limit 1
  for update;

  if v_actor.id is null then
    raise exception 'Only the active primary organisation owner can grant ownership.' using errcode = '42501';
  end if;
  if v_target.id = v_actor.id then
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
$$;

create or replace function public.bridge_transfer_organisation_ownership(p_target_membership_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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

  select * into v_actor
  from public.organisation_users
  where organisation_id = v_target.organisation_id
    and user_id = auth.uid()
    and coalesce(membership_status, status) = 'active'
    and coalesce(is_primary_owner, false)
    and lower(trim(coalesce(workspace_role, organisation_role, organization_role, role, ''))) = 'owner'
  order by updated_at desc nulls last, created_at desc
  limit 1
  for update;

  if v_actor.id is null then
    raise exception 'Only the active primary organisation owner can transfer primary ownership.' using errcode = '42501';
  end if;
  if v_target.id = v_actor.id then
    raise exception 'Choose another active member to receive primary ownership.' using errcode = '22023';
  end if;
  if v_target.user_id is null or coalesce(v_target.membership_status, v_target.status) <> 'active' then
    raise exception 'Primary ownership can only be assigned to an active member who has accepted their invite.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_target.organisation_id::text, 0));
  perform set_config('bridge.ownership_transfer', 'on', true);

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
    jsonb_build_object('previousPrimaryOwnerMembershipId', v_actor.id, 'newPrimaryOwnerMembershipId', v_target.id)
  );

  return jsonb_build_object(
    'organisationId', v_target.organisation_id,
    'previousOwner', to_jsonb(v_actor),
    'newOwner', to_jsonb(v_target)
  );
end;
$$;

revoke all on function public.bridge_grant_organisation_owner(uuid, boolean) from public;
grant execute on function public.bridge_grant_organisation_owner(uuid, boolean) to authenticated;
revoke all on function public.bridge_transfer_organisation_ownership(uuid) from public;
grant execute on function public.bridge_transfer_organisation_ownership(uuid) to authenticated;

commit;
