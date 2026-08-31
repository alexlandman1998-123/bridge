begin;

-- property24_accounts is the sole agency-connection record. Agent identity,
-- contact details and photos continue to belong to profiles/organisation_users.
with legacy_connections as (
  select
    organisation_id,
    settings_json -> 'property24' as property24
  from public.organisation_settings
  where jsonb_typeof(settings_json -> 'property24') = 'object'
    and coalesce(settings_json -> 'property24' ->> 'agencyId', '') ~ '^[0-9]+$'
)
insert into public.property24_accounts (
  organisation_id,
  environment,
  agency_id,
  enabled
)
select
  organisation_id,
  case
    when lower(coalesce(property24 ->> 'environment', '')) = 'production' then 'production'
    else 'exdev'
  end,
  (property24 ->> 'agencyId')::integer,
  case
    when jsonb_typeof(property24 -> 'enabled') = 'boolean' then (property24 ->> 'enabled')::boolean
    else false
  end
from legacy_connections
on conflict (organisation_id, environment) do nothing;

-- Remove connection-owned values and agent-profile snapshots from the legacy
-- JSON document only after a canonical account row exists. The remaining
-- arrays contain external identifiers and sync metadata only.
with sanitized_settings as (
  select
    organisation_settings.organisation_id,
    (
      coalesce(organisation_settings.settings_json -> 'property24', '{}'::jsonb)
        - 'agencyId'
        - 'agency_id'
        - 'enabled'
        - 'environment'
        - 'lastAgentSyncAt'
        - 'last_agent_sync_at'
        - 'property24Agents'
        - 'property24_agents'
        - 'agentMappings'
        - 'agent_mappings'
    ) || jsonb_build_object(
      'dataOwnershipVersion', 'arch9_property24_canonical_v1',
      'property24Agents', coalesce((
        select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
          'rowId', coalesce(agent -> 'rowId', agent -> 'row_id'),
          'property24AgentId', coalesce(agent -> 'property24AgentId', agent -> 'property24_agent_id', agent -> 'agentId'),
          'sourceReference', coalesce(agent -> 'sourceReference', agent -> 'source_reference'),
          'status', agent -> 'status',
          'lastSyncedAt', coalesce(agent -> 'lastSyncedAt', agent -> 'last_synced_at'),
          'lastSyncError', coalesce(agent -> 'lastSyncError', agent -> 'last_sync_error')
        )))
        from jsonb_array_elements(
          case
            when jsonb_typeof(coalesce(
              organisation_settings.settings_json -> 'property24' -> 'property24Agents',
              organisation_settings.settings_json -> 'property24' -> 'property24_agents'
            )) = 'array'
            then coalesce(
              organisation_settings.settings_json -> 'property24' -> 'property24Agents',
              organisation_settings.settings_json -> 'property24' -> 'property24_agents'
            )
            else '[]'::jsonb
          end
        ) as agent
      ), '[]'::jsonb),
      'agentMappings', coalesce((
        select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
          'arch9UserId', coalesce(mapping -> 'arch9UserId', mapping -> 'arch9_user_id', mapping -> 'userId'),
          'arch9MembershipId', coalesce(mapping -> 'arch9MembershipId', mapping -> 'arch9_membership_id', mapping -> 'membershipId'),
          'property24AgentId', coalesce(mapping -> 'property24AgentId', mapping -> 'property24_agent_id', mapping -> 'agentId'),
          'sourceReference', coalesce(mapping -> 'sourceReference', mapping -> 'source_reference'),
          'matchMethod', coalesce(mapping -> 'matchMethod', mapping -> 'match_type'),
          'matchStatus', coalesce(mapping -> 'matchStatus', mapping -> 'match_status', mapping -> 'status'),
          'confidence', mapping -> 'confidence',
          'lastSyncedAt', coalesce(mapping -> 'lastSyncedAt', mapping -> 'last_synced_at'),
          'lastSyncError', coalesce(mapping -> 'lastSyncError', mapping -> 'last_sync_error')
        )))
        from jsonb_array_elements(
          case
            when jsonb_typeof(coalesce(
              organisation_settings.settings_json -> 'property24' -> 'agentMappings',
              organisation_settings.settings_json -> 'property24' -> 'agent_mappings'
            )) = 'array'
            then coalesce(
              organisation_settings.settings_json -> 'property24' -> 'agentMappings',
              organisation_settings.settings_json -> 'property24' -> 'agent_mappings'
            )
            else '[]'::jsonb
          end
        ) as mapping
      ), '[]'::jsonb)
    ) as property24
  from public.organisation_settings as organisation_settings
  where jsonb_typeof(organisation_settings.settings_json -> 'property24') = 'object'
    and exists (
      select 1
      from public.property24_accounts as account
      where account.organisation_id = organisation_settings.organisation_id
    )
)
update public.organisation_settings as organisation_settings
set settings_json = jsonb_set(
  organisation_settings.settings_json,
  '{property24}',
  sanitized_settings.property24,
  true
)
from sanitized_settings
where sanitized_settings.organisation_id = organisation_settings.organisation_id;

commit;
