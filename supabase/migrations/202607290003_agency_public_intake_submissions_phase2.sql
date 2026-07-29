begin;

create extension if not exists "pgcrypto";

create table if not exists public.agency_public_intake_submissions (
  id uuid primary key default gen_random_uuid(),
  intake_link_id uuid not null,
  organisation_id uuid not null,
  lead_id uuid,
  idempotency_key text not null,
  intent text not null,
  status text not null default 'received',
  source_channel text not null default 'other',
  campaign_code text,
  utm_json jsonb not null default '{}'::jsonb,
  ip_hash text,
  request_metadata_json jsonb not null default '{}'::jsonb,
  privacy_consent boolean not null default false,
  privacy_consented_at timestamptz not null default now(),
  privacy_policy_version text not null,
  contact_name text,
  contact_email text,
  contact_phone text,
  budget_min numeric(14, 2),
  budget_max numeric(14, 2),
  selected_listings_json jsonb not null default '[]'::jsonb,
  payload_json jsonb not null default '{}'::jsonb,
  processing_error text,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint agency_public_intake_submissions_link_org_fkey
    foreign key (intake_link_id, organisation_id)
    references public.agency_public_intake_links(id, organisation_id)
    on delete restrict,
  constraint agency_public_intake_submissions_lead_org_fkey
    foreign key (lead_id, organisation_id)
    references public.leads(lead_id, organisation_id)
    on delete restrict,
  constraint agency_public_intake_submissions_idempotency_key_check
    check (
      char_length(idempotency_key) between 16 and 128
      and idempotency_key ~ '^[A-Za-z0-9._:-]+$'
    ),
  constraint agency_public_intake_submissions_intent_check
    check (intent in ('buy', 'sell')),
  constraint agency_public_intake_submissions_status_check
    check (status in ('received', 'processing', 'accepted', 'failed', 'spam', 'duplicate')),
  constraint agency_public_intake_submissions_source_channel_check
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
  constraint agency_public_intake_submissions_campaign_code_check
    check (
      campaign_code is null
      or (
        char_length(campaign_code) between 1 and 80
        and campaign_code = lower(campaign_code)
        and campaign_code ~ '^[a-z0-9][a-z0-9._-]*$'
      )
    ),
  constraint agency_public_intake_submissions_utm_check
    check (jsonb_typeof(utm_json) = 'object' and octet_length(utm_json::text) <= 8192),
  constraint agency_public_intake_submissions_request_metadata_check
    check (jsonb_typeof(request_metadata_json) = 'object' and octet_length(request_metadata_json::text) <= 8192),
  constraint agency_public_intake_submissions_privacy_consent_check
    check (privacy_consent = true and privacy_consented_at is not null and char_length(trim(privacy_policy_version)) between 1 and 80),
  constraint agency_public_intake_submissions_contact_name_length_check
    check (contact_name is null or char_length(contact_name) <= 240),
  constraint agency_public_intake_submissions_contact_email_length_check
    check (contact_email is null or char_length(contact_email) <= 254),
  constraint agency_public_intake_submissions_contact_phone_length_check
    check (contact_phone is null or char_length(contact_phone) <= 40),
  constraint agency_public_intake_submissions_contact_identity_check
    check (
      nullif(trim(coalesce(contact_email, '')), '') is not null
      or nullif(trim(coalesce(contact_phone, '')), '') is not null
    ),
  constraint agency_public_intake_submissions_budget_check
    check (
      (budget_min is null or budget_min >= 0)
      and (budget_max is null or budget_max >= 0)
      and (budget_min is null or budget_max is null or budget_min <= budget_max)
    ),
  constraint agency_public_intake_submissions_selected_listings_check
    check (jsonb_typeof(selected_listings_json) = 'array' and octet_length(selected_listings_json::text) <= 16384),
  constraint agency_public_intake_submissions_payload_check
    check (jsonb_typeof(payload_json) = 'object' and octet_length(payload_json::text) <= 65536),
  constraint agency_public_intake_submissions_processing_error_length_check
    check (processing_error is null or char_length(processing_error) <= 2000)
);

create unique index if not exists agency_public_intake_submissions_idempotency_unique_idx
  on public.agency_public_intake_submissions (intake_link_id, idempotency_key);
create index if not exists agency_public_intake_submissions_org_created_idx
  on public.agency_public_intake_submissions (organisation_id, created_at desc);
create index if not exists agency_public_intake_submissions_link_created_idx
  on public.agency_public_intake_submissions (intake_link_id, created_at desc);
create index if not exists agency_public_intake_submissions_org_status_idx
  on public.agency_public_intake_submissions (organisation_id, status, created_at desc);
create index if not exists agency_public_intake_submissions_lead_idx
  on public.agency_public_intake_submissions (lead_id)
  where lead_id is not null;
create index if not exists agency_public_intake_submissions_ip_window_idx
  on public.agency_public_intake_submissions (intake_link_id, ip_hash, created_at desc)
  where ip_hash is not null;

drop trigger if exists agency_public_intake_submissions_set_updated_at on public.agency_public_intake_submissions;
create trigger agency_public_intake_submissions_set_updated_at
before update on public.agency_public_intake_submissions
for each row
execute function public.bridge_set_updated_at();

alter table public.agency_public_intake_submissions enable row level security;

revoke all on table public.agency_public_intake_submissions from anon, authenticated;

drop policy if exists agency_public_intake_submissions_member_select on public.agency_public_intake_submissions;
create policy agency_public_intake_submissions_member_select on public.agency_public_intake_submissions
for select to authenticated
using (public.bridge_is_active_member(organisation_id));

grant select on public.agency_public_intake_submissions to authenticated;

comment on table public.agency_public_intake_submissions is
  'Public agency buy/sell intake submissions accepted by the server-side public intake API before CRM lead hydration.';
comment on column public.agency_public_intake_submissions.idempotency_key is
  'Caller supplied idempotency key; unique per intake link to avoid duplicate public submissions.';
comment on column public.agency_public_intake_submissions.lead_id is
  'Nullable until a later CRM ingestion phase converts the submission into an agency lead.';

commit;
