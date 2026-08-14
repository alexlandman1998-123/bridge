begin;

create extension if not exists "pgcrypto";

create table if not exists public.agency_agent_card_events (
  id uuid primary key default gen_random_uuid(),
  intake_link_id uuid not null,
  organisation_id uuid not null,
  agent_user_id uuid,
  slug text not null,
  event_type text not null,
  source_channel text not null default 'card',
  listing_id uuid,
  listing_slug text,
  metadata_json jsonb not null default '{}'::jsonb,
  request_metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint agency_agent_card_events_link_org_fkey
    foreign key (intake_link_id, organisation_id)
    references public.agency_public_intake_links(id, organisation_id)
    on delete cascade,
  constraint agency_agent_card_events_agent_fkey
    foreign key (agent_user_id)
    references auth.users(id)
    on delete set null,
  constraint agency_agent_card_events_slug_check
    check (
      char_length(slug) between 3 and 80
      and slug = lower(slug)
      and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    ),
  constraint agency_agent_card_events_type_check
    check (
      event_type in (
        'card_view',
        'call_click',
        'whatsapp_click',
        'email_click',
        'buyer_cta_click',
        'seller_cta_click',
        'listing_click',
        'vcf_download',
        'share_click',
        'copy_link',
        'website_click'
      )
    ),
  constraint agency_agent_card_events_source_channel_check
    check (
      source_channel in (
        'card',
        'instagram',
        'facebook',
        'linkedin',
        'website',
        'whatsapp',
        'email',
        'qr',
        'referral',
        'manual',
        'other'
      )
    ),
  constraint agency_agent_card_events_listing_slug_check
    check (listing_slug is null or char_length(listing_slug) <= 160),
  constraint agency_agent_card_events_metadata_check
    check (jsonb_typeof(metadata_json) = 'object' and octet_length(metadata_json::text) <= 8192),
  constraint agency_agent_card_events_request_metadata_check
    check (jsonb_typeof(request_metadata_json) = 'object' and octet_length(request_metadata_json::text) <= 8192)
);

create index if not exists agency_agent_card_events_link_created_idx
  on public.agency_agent_card_events (intake_link_id, created_at desc);
create index if not exists agency_agent_card_events_org_created_idx
  on public.agency_agent_card_events (organisation_id, created_at desc);
create index if not exists agency_agent_card_events_agent_created_idx
  on public.agency_agent_card_events (agent_user_id, created_at desc)
  where agent_user_id is not null;
create index if not exists agency_agent_card_events_org_type_created_idx
  on public.agency_agent_card_events (organisation_id, event_type, created_at desc);
create index if not exists agency_agent_card_events_listing_idx
  on public.agency_agent_card_events (listing_id)
  where listing_id is not null;

alter table public.agency_agent_card_events enable row level security;

revoke all on table public.agency_agent_card_events from anon, authenticated;

drop policy if exists agency_agent_card_events_member_select on public.agency_agent_card_events;
create policy agency_agent_card_events_member_select on public.agency_agent_card_events
for select to authenticated
using (public.bridge_is_active_member(organisation_id));

grant select on public.agency_agent_card_events to authenticated;

comment on table public.agency_agent_card_events is
  'Public interaction events for agent digital cards. Public writes are accepted only through the trusted server API; organisation members can read aggregated V1 usage.';
comment on column public.agency_agent_card_events.intake_link_id is
  'Agent digital card link that received the event.';
comment on column public.agency_agent_card_events.event_type is
  'V1 card interaction type such as card_view, whatsapp_click, buyer_cta_click, or vcf_download.';

commit;
