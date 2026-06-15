begin;
create or replace function public.bridge_sync_organisation_branches_from_settings(
  p_organisation_id uuid,
  p_settings_json jsonb,
  p_actor_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_settings jsonb := coalesce(p_settings_json, '{}'::jsonb);
  v_branches jsonb := '[]'::jsonb;
  v_branch jsonb;
  v_position integer;
  v_name text;
  v_slug text;
  v_province text;
  v_city text;
  v_address text;
  v_location text;
  v_manager_name text;
  v_phone text;
  v_email text;
  v_agent_count integer;
  v_is_active boolean;
  v_is_head_office boolean;
  v_is_default boolean;
  v_existing_id uuid;
  v_synced_count integer := 0;
begin
  if p_organisation_id is null then
    return 0;
  end if;

  if jsonb_typeof(v_settings->'organisationBranches') = 'array' then
    v_branches := v_settings->'organisationBranches';
  elsif jsonb_typeof(v_settings #> '{agencyOnboarding,branchStructure,branches}') = 'array' then
    v_branches := v_settings #> '{agencyOnboarding,branchStructure,branches}';
  else
    return 0;
  end if;

  for v_branch, v_position in
    select value, ordinality::integer
    from jsonb_array_elements(v_branches) with ordinality
  loop
    v_name := nullif(trim(coalesce(
      v_branch->>'name',
      v_branch->>'branch_name',
      v_branch->>'branchName',
      ''
    )), '');

    if v_name is null then
      continue;
    end if;

    v_slug := trim(both '-' from regexp_replace(lower(v_name), '[^a-z0-9]+', '-', 'g'));
    if v_slug is null or v_slug = '' then
      v_slug := 'branch-' || v_position::text;
    end if;

    v_province := nullif(trim(coalesce(v_branch->>'province', '')), '');
    v_city := nullif(trim(coalesce(v_branch->>'city', '')), '');
    v_address := nullif(trim(coalesce(v_branch->>'address', v_branch->>'officeLocation', '')), '');
    v_location := nullif(trim(coalesce(v_branch->>'location', v_branch->>'officeLocation', v_city, v_province, '')), '');
    v_manager_name := nullif(trim(coalesce(v_branch->>'manager_name', v_branch->>'branchManager', '')), '');
    v_phone := nullif(trim(coalesce(v_branch->>'phone', '')), '');
    v_email := nullif(lower(trim(coalesce(v_branch->>'email', ''))), '');
    v_agent_count := case
      when coalesce(v_branch->>'agent_count', v_branch->>'numberOfAgents', '') ~ '^[0-9]+$'
        then coalesce(v_branch->>'agent_count', v_branch->>'numberOfAgents')::integer
      else 0
    end;
    v_is_active := case lower(coalesce(v_branch->>'is_active', v_branch->>'isActive', 'true'))
      when 'false' then false
      when '0' then false
      when 'no' then false
      else true
    end;
    v_is_head_office := case lower(coalesce(v_branch->>'is_head_office', v_branch->>'isHeadOffice', ''))
      when 'true' then true
      when '1' then true
      when 'yes' then true
      else v_position = 1
    end;
    v_is_default := case lower(coalesce(v_branch->>'is_default', v_branch->>'isDefault', ''))
      when 'true' then true
      when '1' then true
      when 'yes' then true
      else v_position = 1
    end;

    select id into v_existing_id
    from public.organisation_branches
    where organisation_id = p_organisation_id
      and lower(slug) = lower(v_slug)
    order by created_at asc
    limit 1;

    if v_is_default then
      update public.organisation_branches
      set is_default = false
      where organisation_id = p_organisation_id
        and (v_existing_id is null or id <> v_existing_id);
    end if;

    if v_existing_id is null then
      insert into public.organisation_branches (
        organisation_id,
        name,
        slug,
        province,
        city,
        address,
        location,
        manager_name,
        phone,
        email,
        is_head_office,
        is_default,
        is_active,
        status,
        agent_count,
        metadata_json,
        created_by
      )
      values (
        p_organisation_id,
        v_name,
        v_slug,
        v_province,
        v_city,
        v_address,
        v_location,
        v_manager_name,
        v_phone,
        v_email,
        v_is_head_office,
        v_is_default,
        v_is_active,
        case when v_is_active then 'active' else 'inactive' end,
        v_agent_count,
        jsonb_build_object(
          'source', 'settings_branch_sync',
          'syncedAt', now(),
          'raw', v_branch
        ),
        p_actor_id
      );
    else
      update public.organisation_branches
      set
        name = v_name,
        province = coalesce(v_province, public.organisation_branches.province),
        city = coalesce(v_city, public.organisation_branches.city),
        address = coalesce(v_address, public.organisation_branches.address),
        location = coalesce(v_location, public.organisation_branches.location),
        manager_name = coalesce(v_manager_name, public.organisation_branches.manager_name),
        phone = coalesce(v_phone, public.organisation_branches.phone),
        email = coalesce(v_email, public.organisation_branches.email),
        is_head_office = public.organisation_branches.is_head_office or v_is_head_office,
        is_default = public.organisation_branches.is_default or v_is_default,
        is_active = v_is_active,
        status = case when v_is_active then 'active' else 'inactive' end,
        agent_count = greatest(public.organisation_branches.agent_count, v_agent_count),
        metadata_json = coalesce(public.organisation_branches.metadata_json, '{}'::jsonb)
          || jsonb_build_object(
            'source', 'settings_branch_sync',
            'lastSyncedAt', now(),
            'raw', v_branch
          )
      where id = v_existing_id;
    end if;

    v_synced_count := v_synced_count + 1;
    v_existing_id := null;
  end loop;

  return v_synced_count;
end;
$$;
create or replace function public.bridge_sync_organisation_branches_from_settings_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.bridge_sync_organisation_branches_from_settings(
    new.organisation_id,
    new.settings_json,
    null
  );
  return new;
end;
$$;
drop trigger if exists trg_bridge_sync_organisation_branches_from_settings on public.organisation_settings;
create trigger trg_bridge_sync_organisation_branches_from_settings
after insert or update of settings_json on public.organisation_settings
for each row
execute function public.bridge_sync_organisation_branches_from_settings_trigger();
do $$
declare
  v_settings record;
begin
  for v_settings in
    select organisation_id, settings_json
    from public.organisation_settings
  loop
    perform public.bridge_sync_organisation_branches_from_settings(
      v_settings.organisation_id,
      v_settings.settings_json,
      null
    );
  end loop;
end $$;
grant execute on function public.bridge_sync_organisation_branches_from_settings(uuid, jsonb, uuid) to authenticated;
commit;
