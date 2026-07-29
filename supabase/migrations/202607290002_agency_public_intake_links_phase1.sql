begin;

create extension if not exists "pgcrypto";

create table if not exists public.agency_public_intake_links (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  slug text not null,
  status text not null default 'draft',
  is_primary boolean not null default true,
  heading text,
  introduction text,
  buyer_cta_label text,
  seller_cta_label text,
  enabled_intents text[] not null default array['buy', 'sell']::text[],
  lead_source_label text not null default 'Public Intake',
  source_channel text not null default 'other',
  campaign_code text,
  default_branch_id uuid references public.organisation_branches(id) on delete set null,
  default_assigned_agent_id uuid references auth.users(id) on delete set null,
  privacy_policy_version text,
  consent_copy text,
  branding_config_json jsonb not null default '{}'::jsonb,
  buyer_config_json jsonb not null default '{}'::jsonb,
  seller_config_json jsonb not null default '{}'::jsonb,
  listing_match_config_json jsonb not null default '{}'::jsonb,
  routing_config_json jsonb not null default '{}'::jsonb,
  attribution_config_json jsonb not null default '{}'::jsonb,
  metadata_json jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  disabled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint agency_public_intake_links_slug_check
    check (
      char_length(slug) between 3 and 80
      and slug = lower(slug)
      and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    ),
  constraint agency_public_intake_links_status_check
    check (status in ('draft', 'active', 'disabled', 'archived')),
  constraint agency_public_intake_links_disabled_state_check
    check (
      (status in ('draft', 'active') and disabled_at is null)
      or status in ('disabled', 'archived')
    ),
  constraint agency_public_intake_links_enabled_intents_check
    check (
      cardinality(enabled_intents) between 1 and 2
      and enabled_intents <@ array['buy', 'sell']::text[]
    ),
  constraint agency_public_intake_links_heading_length_check
    check (heading is null or char_length(heading) <= 160),
  constraint agency_public_intake_links_introduction_length_check
    check (introduction is null or char_length(introduction) <= 1000),
  constraint agency_public_intake_links_buyer_cta_label_length_check
    check (buyer_cta_label is null or char_length(buyer_cta_label) <= 80),
  constraint agency_public_intake_links_seller_cta_label_length_check
    check (seller_cta_label is null or char_length(seller_cta_label) <= 80),
  constraint agency_public_intake_links_lead_source_label_length_check
    check (char_length(trim(lead_source_label)) between 1 and 120),
  constraint agency_public_intake_links_source_channel_check
    check (
      source_channel in (
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
  constraint agency_public_intake_links_campaign_code_check
    check (
      campaign_code is null
      or (
        char_length(campaign_code) between 1 and 80
        and campaign_code = lower(campaign_code)
        and campaign_code ~ '^[a-z0-9][a-z0-9._-]*$'
      )
    ),
  constraint agency_public_intake_links_privacy_policy_version_length_check
    check (privacy_policy_version is null or char_length(privacy_policy_version) <= 80),
  constraint agency_public_intake_links_consent_copy_length_check
    check (consent_copy is null or char_length(consent_copy) <= 1000),
  constraint agency_public_intake_links_branding_config_check
    check (jsonb_typeof(branding_config_json) = 'object' and octet_length(branding_config_json::text) <= 16384),
  constraint agency_public_intake_links_buyer_config_check
    check (jsonb_typeof(buyer_config_json) = 'object' and octet_length(buyer_config_json::text) <= 16384),
  constraint agency_public_intake_links_seller_config_check
    check (jsonb_typeof(seller_config_json) = 'object' and octet_length(seller_config_json::text) <= 16384),
  constraint agency_public_intake_links_listing_match_config_check
    check (jsonb_typeof(listing_match_config_json) = 'object' and octet_length(listing_match_config_json::text) <= 16384),
  constraint agency_public_intake_links_routing_config_check
    check (jsonb_typeof(routing_config_json) = 'object' and octet_length(routing_config_json::text) <= 16384),
  constraint agency_public_intake_links_attribution_config_check
    check (jsonb_typeof(attribution_config_json) = 'object' and octet_length(attribution_config_json::text) <= 16384),
  constraint agency_public_intake_links_metadata_check
    check (jsonb_typeof(metadata_json) = 'object' and octet_length(metadata_json::text) <= 16384)
);

create unique index if not exists agency_public_intake_links_slug_unique_idx
  on public.agency_public_intake_links (lower(slug));
create unique index if not exists agency_public_intake_links_primary_active_org_unique_idx
  on public.agency_public_intake_links (organisation_id)
  where status = 'active' and is_primary = true;
create unique index if not exists agency_public_intake_links_id_org_unique_idx
  on public.agency_public_intake_links (id, organisation_id);
create index if not exists agency_public_intake_links_org_status_idx
  on public.agency_public_intake_links (organisation_id, status, updated_at desc);
create index if not exists agency_public_intake_links_default_branch_idx
  on public.agency_public_intake_links (default_branch_id)
  where default_branch_id is not null;
create index if not exists agency_public_intake_links_default_agent_idx
  on public.agency_public_intake_links (default_assigned_agent_id)
  where default_assigned_agent_id is not null;
create index if not exists agency_public_intake_links_campaign_idx
  on public.agency_public_intake_links (organisation_id, campaign_code)
  where campaign_code is not null;

create or replace function public.bridge_validate_agency_public_intake_link()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.slug := lower(trim(new.slug));
  new.status := lower(trim(coalesce(new.status, 'draft')));
  new.source_channel := lower(trim(coalesce(new.source_channel, 'other')));
  new.campaign_code := nullif(lower(trim(coalesce(new.campaign_code, ''))), '');
  new.lead_source_label := nullif(trim(coalesce(new.lead_source_label, '')), '');

  select coalesce(array_agg(distinct normalized.intent order by normalized.intent), array[]::text[])
  into new.enabled_intents
  from (
    select lower(trim(intent)) as intent
    from unnest(coalesce(new.enabled_intents, array[]::text[])) as intent
    where nullif(trim(intent), '') is not null
  ) normalized;

  if new.lead_source_label is null then
    raise exception 'Agency public intake lead source label is required';
  end if;

  if new.default_branch_id is not null and not exists (
    select 1
    from public.organisation_branches branch
    where branch.id = new.default_branch_id
      and branch.organisation_id = new.organisation_id
  ) then
    raise exception 'Default branch must belong to the agency public intake organisation';
  end if;

  if new.default_assigned_agent_id is not null and not exists (
    select 1
    from public.organisation_users member
    where member.organisation_id = new.organisation_id
      and member.user_id = new.default_assigned_agent_id
      and member.status = 'active'
  ) then
    raise exception 'Default assigned agent must be an active member of the agency public intake organisation';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_bridge_validate_agency_public_intake_link on public.agency_public_intake_links;
create trigger trg_bridge_validate_agency_public_intake_link
before insert or update on public.agency_public_intake_links
for each row
execute function public.bridge_validate_agency_public_intake_link();

drop trigger if exists agency_public_intake_links_set_updated_at on public.agency_public_intake_links;
create trigger agency_public_intake_links_set_updated_at
before update on public.agency_public_intake_links
for each row
execute function public.bridge_set_updated_at();

alter table public.agency_public_intake_links enable row level security;

drop policy if exists agency_public_intake_links_member_select on public.agency_public_intake_links;
create policy agency_public_intake_links_member_select on public.agency_public_intake_links
for select to authenticated
using (public.bridge_is_active_member(organisation_id));

drop policy if exists agency_public_intake_links_admin_insert on public.agency_public_intake_links;
create policy agency_public_intake_links_admin_insert on public.agency_public_intake_links
for insert to authenticated
with check (public.bridge_is_org_admin(organisation_id));

drop policy if exists agency_public_intake_links_admin_update on public.agency_public_intake_links;
create policy agency_public_intake_links_admin_update on public.agency_public_intake_links
for update to authenticated
using (public.bridge_is_org_admin(organisation_id))
with check (public.bridge_is_org_admin(organisation_id));

grant select, insert, update on public.agency_public_intake_links to authenticated;

comment on table public.agency_public_intake_links is
  'Agency-owned public buy/sell intake link configuration. Public APIs resolve safe fields from this model and submit leads through trusted server-side CRM ingestion.';
comment on column public.agency_public_intake_links.slug is
  'Globally unique public slug used for agency intake URLs such as /intake/{slug}.';
comment on column public.agency_public_intake_links.enabled_intents is
  'Enabled public intake paths for this link. Supported values are buy and sell.';
comment on column public.agency_public_intake_links.default_branch_id is
  'Optional branch routing default; validated to belong to the same organisation.';
comment on column public.agency_public_intake_links.default_assigned_agent_id is
  'Optional user routing default; validated as an active member of the same organisation.';

commit;
