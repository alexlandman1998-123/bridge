begin;

create extension if not exists "pgcrypto";

-- The shared lead aggregate remains backwards-compatible with the existing
-- agency CRM. Existing rows are classified as agency leads; Attorney rows
-- receive a stricter lifecycle contract through conditional checks.
alter table if exists public.leads
  add column if not exists lead_domain text not null default 'agency',
  add column if not exists source_channel text,
  add column if not exists campaign_code text,
  add column if not exists last_contacted_at timestamptz,
  add column if not exists next_follow_up_at timestamptz,
  add column if not exists closed_at timestamptz,
  add column if not exists lost_reason text;

alter table if exists public.leads
  drop constraint if exists leads_lead_domain_check;
alter table if exists public.leads
  add constraint leads_lead_domain_check
  check (lead_domain in ('agency', 'attorney', 'bond_originator', 'developer'));

alter table if exists public.leads
  drop constraint if exists leads_source_channel_check;
alter table if exists public.leads
  add constraint leads_source_channel_check
  check (
    source_channel is null
    or source_channel in (
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
  );

alter table if exists public.leads
  drop constraint if exists leads_campaign_code_check;
alter table if exists public.leads
  add constraint leads_campaign_code_check
  check (
    campaign_code is null
    or (
      char_length(campaign_code) between 1 and 80
      and campaign_code = lower(campaign_code)
      and campaign_code ~ '^[a-z0-9][a-z0-9._-]*$'
    )
  );

alter table if exists public.leads
  drop constraint if exists leads_attorney_lifecycle_check;
alter table if exists public.leads
  add constraint leads_attorney_lifecycle_check
  check (
    lead_domain <> 'attorney'
    or (
      stage in ('new', 'contacted', 'qualified', 'quote_sent', 'follow_up', 'won', 'lost')
      and status in ('open', 'won', 'lost', 'archived')
      and (
        (stage = 'won' and status = 'won')
        or (stage = 'lost' and status = 'lost')
        or (stage not in ('won', 'lost') and status in ('open', 'archived'))
      )
    )
  );

alter table if exists public.leads
  drop constraint if exists leads_lost_reason_length_check;
alter table if exists public.leads
  add constraint leads_lost_reason_length_check
  check (lost_reason is null or char_length(lost_reason) <= 1000);

create unique index if not exists leads_lead_org_unique_idx
  on public.leads (lead_id, organisation_id);
create index if not exists leads_org_domain_created_idx
  on public.leads (organisation_id, lead_domain, created_at desc);
create index if not exists leads_org_domain_stage_updated_idx
  on public.leads (organisation_id, lead_domain, stage, updated_at desc);
create index if not exists leads_attorney_assignee_updated_idx
  on public.leads (organisation_id, assigned_user_id, updated_at desc)
  where lead_domain = 'attorney';
create index if not exists leads_attorney_follow_up_idx
  on public.leads (organisation_id, next_follow_up_at, updated_at desc)
  where lead_domain = 'attorney' and status = 'open' and next_follow_up_at is not null;

create index if not exists contacts_org_normalized_email_idx
  on public.contacts (organisation_id, lower(trim(email)))
  where nullif(trim(email), '') is not null;
create index if not exists contacts_org_normalized_phone_idx
  on public.contacts (organisation_id, regexp_replace(phone, '[^0-9]+', '', 'g'))
  where nullif(regexp_replace(phone, '[^0-9]+', '', 'g'), '') is not null;

-- Composite unique indexes let the new foundation enforce tenant-consistent
-- foreign keys without changing existing primary keys.
create unique index if not exists attorney_firms_id_org_unique_idx
  on public.attorney_firms (id, organisation_id);

create table if not exists public.public_intake_links (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  attorney_firm_id uuid not null,
  slug text not null,
  status text not null default 'active',
  heading text,
  introduction text,
  service_config_json jsonb not null default '["transfer_quote","property_transfer","bond_registration","bond_cancellation","property_legal_advice","general_enquiry"]'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  disabled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint public_intake_links_firm_org_fkey
    foreign key (attorney_firm_id, organisation_id)
    references public.attorney_firms(id, organisation_id)
    on delete restrict,
  constraint public_intake_links_slug_check
    check (
      char_length(slug) between 3 and 80
      and slug = lower(slug)
      and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    ),
  constraint public_intake_links_status_check
    check (status in ('active', 'disabled', 'archived')),
  constraint public_intake_links_heading_length_check
    check (heading is null or char_length(heading) <= 160),
  constraint public_intake_links_introduction_length_check
    check (introduction is null or char_length(introduction) <= 1000),
  constraint public_intake_links_service_config_check
    check (jsonb_typeof(service_config_json) = 'array'),
  constraint public_intake_links_disabled_state_check
    check (
      (status = 'active' and disabled_at is null)
      or status in ('disabled', 'archived')
    )
);

create unique index if not exists public_intake_links_slug_unique_idx
  on public.public_intake_links (lower(slug));
create unique index if not exists public_intake_links_active_org_unique_idx
  on public.public_intake_links (organisation_id)
  where status = 'active';
create unique index if not exists public_intake_links_id_org_unique_idx
  on public.public_intake_links (id, organisation_id);
create index if not exists public_intake_links_firm_status_idx
  on public.public_intake_links (attorney_firm_id, status, updated_at desc);

create table if not exists public.attorney_lead_details (
  lead_id uuid primary key,
  organisation_id uuid not null,
  service_type text not null,
  property_address text,
  property_value numeric(14, 2),
  party_role text not null default 'unknown',
  enquiry_message text,
  intake_link_id uuid,
  privacy_consent boolean not null default false,
  privacy_consented_at timestamptz,
  privacy_policy_version text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint attorney_lead_details_lead_org_fkey
    foreign key (lead_id, organisation_id)
    references public.leads(lead_id, organisation_id)
    on delete cascade,
  constraint attorney_lead_details_intake_link_org_fkey
    foreign key (intake_link_id, organisation_id)
    references public.public_intake_links(id, organisation_id)
    on delete restrict,
  constraint attorney_lead_details_service_type_check
    check (
      service_type in (
        'transfer_quote',
        'property_transfer',
        'bond_registration',
        'bond_cancellation',
        'property_legal_advice',
        'general_enquiry'
      )
    ),
  constraint attorney_lead_details_property_value_check
    check (property_value is null or property_value >= 0),
  constraint attorney_lead_details_party_role_check
    check (party_role in ('buyer', 'seller', 'other', 'unknown')),
  constraint attorney_lead_details_property_address_length_check
    check (property_address is null or char_length(property_address) <= 1000),
  constraint attorney_lead_details_enquiry_message_length_check
    check (enquiry_message is null or char_length(enquiry_message) <= 5000),
  constraint attorney_lead_details_privacy_policy_version_length_check
    check (privacy_policy_version is null or char_length(privacy_policy_version) <= 80),
  constraint attorney_lead_details_public_consent_check
    check (
      intake_link_id is null
      or (
        privacy_consent = true
        and privacy_consented_at is not null
        and nullif(trim(privacy_policy_version), '') is not null
      )
    ),
  constraint attorney_lead_details_metadata_check
    check (
      jsonb_typeof(metadata_json) = 'object'
      and octet_length(metadata_json::text) <= 16384
    )
);

create index if not exists attorney_lead_details_org_service_created_idx
  on public.attorney_lead_details (organisation_id, service_type, created_at desc);
create index if not exists attorney_lead_details_intake_link_idx
  on public.attorney_lead_details (intake_link_id, created_at desc)
  where intake_link_id is not null;

create table if not exists public.public_intake_submissions (
  id uuid primary key default gen_random_uuid(),
  intake_link_id uuid not null,
  organisation_id uuid not null,
  lead_id uuid,
  idempotency_key text not null,
  source_channel text not null default 'other',
  campaign_code text,
  utm_json jsonb not null default '{}'::jsonb,
  ip_hash text,
  request_metadata_json jsonb not null default '{}'::jsonb,
  privacy_consent boolean not null,
  privacy_consented_at timestamptz not null,
  privacy_policy_version text not null,
  status text not null default 'received',
  rejection_reason text,
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  constraint public_intake_submissions_link_org_fkey
    foreign key (intake_link_id, organisation_id)
    references public.public_intake_links(id, organisation_id)
    on delete restrict,
  constraint public_intake_submissions_lead_org_fkey
    foreign key (lead_id, organisation_id)
    references public.leads(lead_id, organisation_id)
    on delete restrict,
  constraint public_intake_submissions_idempotency_key_check
    check (
      char_length(idempotency_key) between 16 and 128
      and idempotency_key ~ '^[A-Za-z0-9._:-]+$'
    ),
  constraint public_intake_submissions_source_channel_check
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
  constraint public_intake_submissions_campaign_code_check
    check (
      campaign_code is null
      or (
        char_length(campaign_code) between 1 and 80
        and campaign_code = lower(campaign_code)
        and campaign_code ~ '^[a-z0-9][a-z0-9._-]*$'
      )
    ),
  constraint public_intake_submissions_utm_check
    check (jsonb_typeof(utm_json) = 'object' and octet_length(utm_json::text) <= 8192),
  constraint public_intake_submissions_ip_hash_check
    check (
      ip_hash is null
      or (
        char_length(ip_hash) between 16 and 128
        and ip_hash ~ '^[A-Za-z0-9_-]+$'
      )
    ),
  constraint public_intake_submissions_request_metadata_check
    check (
      jsonb_typeof(request_metadata_json) = 'object'
      and octet_length(request_metadata_json::text) <= 16384
    ),
  constraint public_intake_submissions_privacy_consent_check
    check (
      privacy_consent = true
      and nullif(trim(privacy_policy_version), '') is not null
      and char_length(privacy_policy_version) <= 80
    ),
  constraint public_intake_submissions_status_check
    check (status in ('received', 'processed', 'duplicate', 'rejected', 'spam')),
  constraint public_intake_submissions_rejection_reason_length_check
    check (rejection_reason is null or char_length(rejection_reason) <= 1000),
  constraint public_intake_submissions_processed_state_check
    check (
      (status in ('received', 'rejected', 'spam'))
      or (status in ('processed', 'duplicate') and processed_at is not null and lead_id is not null)
    )
);

create unique index if not exists public_intake_submissions_link_idempotency_unique_idx
  on public.public_intake_submissions (intake_link_id, idempotency_key);
create index if not exists public_intake_submissions_org_created_idx
  on public.public_intake_submissions (organisation_id, created_at desc);
create index if not exists public_intake_submissions_link_ip_created_idx
  on public.public_intake_submissions (intake_link_id, ip_hash, created_at desc)
  where ip_hash is not null;
create index if not exists public_intake_submissions_lead_idx
  on public.public_intake_submissions (lead_id, created_at desc)
  where lead_id is not null;
create index if not exists public_intake_submissions_status_created_idx
  on public.public_intake_submissions (status, created_at desc);

create or replace function public.bridge_touch_attorney_lead_foundation_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_public_intake_links_updated_at on public.public_intake_links;
create trigger trg_public_intake_links_updated_at
before update on public.public_intake_links
for each row execute function public.bridge_touch_attorney_lead_foundation_updated_at();

drop trigger if exists trg_attorney_lead_details_updated_at on public.attorney_lead_details;
create trigger trg_attorney_lead_details_updated_at
before update on public.attorney_lead_details
for each row execute function public.bridge_touch_attorney_lead_foundation_updated_at();

-- Phase 2 is intentionally closed. Phase 3 will add narrowly scoped internal
-- policies, grants, public resolution, and atomic submission commands.
alter table public.public_intake_links enable row level security;
alter table public.attorney_lead_details enable row level security;
alter table public.public_intake_submissions enable row level security;

revoke all on table public.public_intake_links from anon, authenticated;
revoke all on table public.attorney_lead_details from anon, authenticated;
revoke all on table public.public_intake_submissions from anon, authenticated;

comment on column public.leads.lead_domain is
  'CRM vertical discriminator. Existing shared Lead rows default to agency; Attorney Leads use attorney.';
comment on table public.public_intake_links is
  'Organisation-level canonical public Attorney journey links. No public read policy is installed in Phase 2.';
comment on table public.attorney_lead_details is
  'Attorney-specific extension of the shared Leads aggregate.';
comment on table public.public_intake_submissions is
  'Idempotency, attribution, consent, and abuse-control audit for public Attorney intake submissions.';

commit;

