begin;

-- Keep existing defaults and permissions; rental capture is enabled per card.
alter table public.agency_public_intake_links
  drop constraint agency_public_intake_links_enabled_intents_check,
  add constraint agency_public_intake_links_enabled_intents_check
    check (cardinality(enabled_intents) between 1 and 3
      and enabled_intents <@ array['buy', 'sell', 'rent']::text[]
      and (not ('rent' = any(enabled_intents)) or coalesce(metadata_json->>'surface', '') = 'agent_digital_card'));

alter table public.agency_public_intake_submissions
  drop constraint agency_public_intake_submissions_intent_check,
  add constraint agency_public_intake_submissions_intent_check
    check (intent in ('buy', 'sell', 'rent'));

alter table public.agency_agent_card_events
  drop constraint agency_agent_card_events_type_check,
  add constraint agency_agent_card_events_type_check
    check (event_type in ('card_view', 'call_click', 'whatsapp_click', 'email_click',
      'buyer_cta_click', 'seller_cta_click', 'rental_cta_click', 'listing_click',
      'vcf_download', 'share_click', 'copy_link', 'website_click'));

commit;
