begin;

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

  -- The transfer RPC performs both owner changes in one transaction after its own
  -- stricter checks. Ordinary role updates can never enable this transaction flag.
  if current_setting('bridge.ownership_transfer', true) = 'on' then
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
  order by actor.is_primary_owner desc,
           actor.updated_at desc nulls last,
           actor.created_at desc
  limit 1;

  if v_actor.id is null then
    raise exception 'An active organisation membership is required to change roles.' using errcode = '42501';
  end if;
  if v_actor.id = old.id or (old.user_id is not null and old.user_id = auth.uid()) then
    raise exception 'You cannot change your own organisation role.' using errcode = '42501';
  end if;

  v_previous_role := lower(trim(coalesce(old.workspace_role, old.organisation_role, old.organization_role, old.role, 'viewer')));
  v_next_role := lower(trim(coalesce(
    case when new.workspace_role is distinct from old.workspace_role then new.workspace_role end,
    case when new.organisation_role is distinct from old.organisation_role then new.organisation_role end,
    case when new.organization_role is distinct from old.organization_role then new.organization_role end,
    case when new.role is distinct from old.role then new.role end,
    new.workspace_role,
    new.organisation_role,
    new.organization_role,
    new.role,
    'viewer'
  )));

  v_actor_level := public.bridge_organisation_role_authority_level(
    coalesce(v_actor.workspace_role, v_actor.organisation_role, v_actor.organization_role, v_actor.role)
  );
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

  new.role := v_next_role;
  new.workspace_role := v_next_role;
  new.organisation_role := v_next_role;
  new.organization_role := v_next_role;
  new.updated_at := now();
  return new;
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
  v_previous_owner public.organisation_users%rowtype;
  v_new_owner public.organisation_users%rowtype;
  v_organisation_type text;
  v_previous_owner_role text;
  v_previous_owner_job_title text;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  select * into v_target
  from public.organisation_users target
  where target.id = p_target_membership_id;

  if v_target.id is null then
    raise exception 'The selected organisation member was not found.' using errcode = 'P0002';
  end if;

  select * into v_actor
  from public.organisation_users actor
  where actor.user_id = auth.uid()
    and actor.organisation_id = v_target.organisation_id
    and coalesce(actor.membership_status, actor.status) = 'active'
    and lower(trim(coalesce(actor.workspace_role, actor.organisation_role, actor.organization_role, actor.role, ''))) = 'owner'
  order by actor.is_primary_owner desc,
           actor.updated_at desc nulls last,
           actor.created_at desc
  limit 1;

  if v_actor.id is null then
    raise exception 'Only the active organisation owner can transfer ownership.' using errcode = '42501';
  end if;

  -- Serialise transfers for this organisation so concurrent requests cannot leave
  -- two primary owners or demote the wrong owner.
  perform pg_advisory_xact_lock(hashtextextended(v_actor.organisation_id::text, 0));

  select * into v_actor
  from public.organisation_users actor
  where actor.id = v_actor.id
    and actor.user_id = auth.uid()
    and actor.organisation_id = v_target.organisation_id
    and coalesce(actor.membership_status, actor.status) = 'active'
    and lower(trim(coalesce(actor.workspace_role, actor.organisation_role, actor.organization_role, actor.role, ''))) = 'owner'
  for update;

  if v_actor.id is null then
    raise exception 'Ownership changed before this transfer completed. Refresh and try again.' using errcode = '40001';
  end if;

  select * into v_target
  from public.organisation_users target
  where target.id = p_target_membership_id
    and target.organisation_id = v_actor.organisation_id
  for update;

  if v_target.id is null then
    raise exception 'The selected organisation member was not found.' using errcode = 'P0002';
  end if;
  if v_target.id = v_actor.id or v_target.user_id = auth.uid() then
    raise exception 'Choose another member to receive ownership.' using errcode = '22023';
  end if;
  if v_target.user_id is null or coalesce(v_target.membership_status, v_target.status) <> 'active' then
    raise exception 'Ownership can only be transferred to an active member who has accepted their invite.' using errcode = '22023';
  end if;
  if lower(trim(coalesce(v_target.workspace_role, v_target.organisation_role, v_target.organization_role, v_target.role, ''))) = 'owner' then
    raise exception 'The selected member is already an organisation owner.' using errcode = '22023';
  end if;

  select lower(trim(coalesce(type, organization_type, 'agency')))
  into v_organisation_type
  from public.organisations
  where id = v_actor.organisation_id;

  v_previous_owner_role := case v_organisation_type
    when 'developer_company' then 'director'
    when 'developer' then 'director'
    when 'attorney_firm' then 'partner'
    when 'bond_originator' then 'hq_manager'
    else 'principal'
  end;
  v_previous_owner_job_title := case v_organisation_type
    when 'developer_company' then 'director'
    when 'developer' then 'director'
    when 'attorney_firm' then 'partner'
    when 'bond_originator' then 'administrator'
    else 'principal'
  end;

  perform set_config('bridge.ownership_transfer', 'on', true);

  update public.organisation_users
  set role = 'owner',
      workspace_role = 'owner',
      organisation_role = 'owner',
      organization_role = 'owner',
      is_primary_owner = true,
      job_title = 'organisation_owner',
      updated_at = now()
  where id = v_target.id
  returning * into v_new_owner;

  update public.organisation_users
  set role = v_previous_owner_role,
      workspace_role = v_previous_owner_role,
      organisation_role = v_previous_owner_role,
      organization_role = v_previous_owner_role,
      is_primary_owner = false,
      job_title = v_previous_owner_job_title,
      updated_at = now()
  where id = v_actor.id
  returning * into v_previous_owner;

  update public.organisation_users
  set is_primary_owner = false,
      updated_at = now()
  where organisation_id = v_actor.organisation_id
    and id not in (v_new_owner.id, v_previous_owner.id)
    and coalesce(is_primary_owner, false) = true;

  insert into public.organization_events (
    organization_id,
    actor_user_id,
    target_user_id,
    event_type,
    event_data
  ) values (
    v_actor.organisation_id,
    auth.uid(),
    v_target.user_id,
    'ownership_transferred',
    jsonb_build_object(
      'previousOwnerMembershipId', v_previous_owner.id,
      'newOwnerMembershipId', v_new_owner.id,
      'previousOwnerRole', v_previous_owner_role,
      'previousOwnerJobTitle', v_previous_owner_job_title
    )
  );

  return jsonb_build_object(
    'organisationId', v_actor.organisation_id,
    'previousOwner', to_jsonb(v_previous_owner),
    'newOwner', to_jsonb(v_new_owner)
  );
end;
$$;

revoke all on function public.bridge_transfer_organisation_ownership(uuid) from public;
grant execute on function public.bridge_transfer_organisation_ownership(uuid) to authenticated;

commit;
