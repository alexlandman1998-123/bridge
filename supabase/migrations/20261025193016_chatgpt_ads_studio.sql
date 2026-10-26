begin;
-- ChatGPT is a draft/planning channel only; no delivery IDs or permissions added.
alter table public.marketing_channel_templates drop constraint marketing_channel_templates_channel_check;
alter table public.marketing_channel_templates add constraint marketing_channel_templates_channel_check
 check(channel in ('email','whatsapp','meta','social','chatgpt'));
alter table public.marketing_campaigns drop constraint marketing_campaign_channels_valid;
alter table public.marketing_campaigns add constraint marketing_campaign_channels_valid check(
 cardinality(planned_channels) between 1 and 5 and array_position(planned_channels,null) is null
 and planned_channels <@ array['email','whatsapp','meta','social','chatgpt']::text[]
);
alter table public.marketing_campaign_templates drop constraint marketing_campaign_templates_planned_channels_check;
alter table public.marketing_campaign_templates add constraint marketing_campaign_templates_planned_channels_check check(
 cardinality(planned_channels) between 1 and 5 and array_position(planned_channels,null) is null
 and planned_channels <@ array['email','whatsapp','meta','social','chatgpt']::text[]
);
notify pgrst,'reload schema';
commit;
