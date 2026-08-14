begin;

create unique index if not exists agency_public_intake_links_active_agent_card_unique_idx
  on public.agency_public_intake_links (organisation_id, default_assigned_agent_id)
  where status = 'active'
    and is_primary = false
    and default_assigned_agent_id is not null
    and metadata_json ->> 'surface' = 'agent_digital_card';

create index if not exists agency_public_intake_links_agent_card_lookup_idx
  on public.agency_public_intake_links (organisation_id, default_assigned_agent_id, updated_at desc)
  where is_primary = false
    and default_assigned_agent_id is not null
    and metadata_json ->> 'surface' = 'agent_digital_card';

comment on index public.agency_public_intake_links_active_agent_card_unique_idx is
  'Ensures each organisation can have only one active public agent digital card intake link per assigned agent.';

comment on index public.agency_public_intake_links_agent_card_lookup_idx is
  'Supports management and dashboard lookup of agent digital card intake links without a separate card table.';

comment on column public.agency_public_intake_links.metadata_json is
  'Typed public-link metadata. Agent digital cards use surface=agent_digital_card and store card display/configuration under agentDigitalCard.';

commit;
