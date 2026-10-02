-- Provision a private draft when an agency agent becomes active. Publishing
-- remains an explicit card action; existing, disabled and edited cards survive.
create schema if not exists arch9_private;
revoke all on schema arch9_private from public, anon, authenticated;

create or replace function arch9_private.ensure_agent_digital_card(p_organisation_id uuid, p_user_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  member_json jsonb;
  profile_json jsonb;
begin
  select to_jsonb(member) into member_json
  from public.organisation_users member
  join public.organisations organisation on organisation.id = member.organisation_id
  where member.organisation_id = p_organisation_id and member.user_id = p_user_id
    and lower(coalesce(member.status, '')) in ('active', 'accepted')
    and lower(coalesce(organisation.type, 'agency')) = 'agency'
    and lower(coalesce(to_jsonb(member)->>'workspace_role', to_jsonb(member)->>'organisation_role', member.role, ''))
      in ('agent', 'owner', 'principal', 'branch_manager', 'team_leader', 'team_lead')
  limit 1;
  if member_json is null then return; end if;
  -- Serialise competing membership changes for the same agent and agency.
  perform pg_advisory_xact_lock(hashtextextended(p_organisation_id::text || ':' || p_user_id::text, 0));
  if exists (select 1 from public.agency_public_intake_links
    where organisation_id = p_organisation_id and default_assigned_agent_id = p_user_id
      and metadata_json->>'surface' = 'agent_digital_card') then return; end if;
  select to_jsonb(profile) into profile_json from public.profiles profile where profile.id = p_user_id;
  insert into public.agency_public_intake_links (
    organisation_id, slug, status, is_primary, default_assigned_agent_id,
    lead_source_label, source_channel, metadata_json
  ) values (
    p_organisation_id, 'agent-' || replace(p_organisation_id::text, '-', '') || '-' || replace(p_user_id::text, '-', ''),
    'draft', false, p_user_id, 'Agent Digital Card', 'qr',
    jsonb_build_object('surface', 'agent_digital_card', 'version', 1, 'agentDigitalCard', jsonb_build_object(
      'agent', jsonb_build_object('userId', p_user_id,
        'name', coalesce(nullif(profile_json->>'full_name',''), nullif(profile_json->>'name',''), nullif(trim(concat_ws(' ',profile_json->>'first_name',profile_json->>'last_name')),''), member_json->>'email', 'Agent'),
        'email', coalesce(profile_json->>'email', member_json->>'email', ''),
        'phone', coalesce(profile_json->>'phone', profile_json->>'phone_number', ''),
        'avatarUrl', coalesce(profile_json->>'avatar_url', ''),
        'jobTitle', coalesce(profile_json->>'job_title', 'Property Practitioner')),
      'features', jsonb_build_object('qr',true,'share',true,'listings',true,'leadCapture',true),
      'rollout', jsonb_build_object('stage','standard')))
  );
end;
$$;
revoke all on function arch9_private.ensure_agent_digital_card(uuid, uuid) from public, anon, authenticated;

create or replace function arch9_private.provision_agent_digital_card()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform arch9_private.ensure_agent_digital_card(new.organisation_id, new.user_id);
  return new;
end;
$$;
revoke all on function arch9_private.provision_agent_digital_card() from public, anon, authenticated;
create trigger provision_agent_digital_card
  after insert or update of user_id, status, role, workspace_role, organisation_role
  on public.organisation_users for each row execute function arch9_private.provision_agent_digital_card();

-- Existing agents receive missing drafts, without republishing disabled cards.
do $$
declare member record;
begin
  for member in select distinct organisation_id, user_id from public.organisation_users where user_id is not null loop
    perform arch9_private.ensure_agent_digital_card(member.organisation_id, member.user_id);
  end loop;
end;
$$;
