begin;

-- Admin CRM intake leads Phase 1
--
-- demo_enquiries remains the single source of truth. This migration adds the
-- durable contract needed by the future public new-business intake without
-- granting public table access or creating a competing leads table.

alter table public.demo_enquiries
  add column if not exists intake_kind text not null default 'demo_request',
  add column if not exists form_key text not null default 'arch9-book-demo-wizard',
  add column if not exists form_version text,
  add column if not exists submission_key text,
  add column if not exists preferred_contact_method text,
  add column if not exists services_interested text[] not null default '{}'::text[],
  add column if not exists popia_consent_given boolean not null default false,
  add column if not exists popia_consent_at timestamptz,
  add column if not exists privacy_policy_version text,
  add column if not exists marketing_consent boolean not null default false,
  add column if not exists request_fingerprint text,
  add column if not exists dedupe_status text not null default 'canonical',
  add column if not exists duplicate_of_enquiry_id uuid,
  add column if not exists normalized_email text generated always as (
    lower(btrim(email))
  ) stored,
  add column if not exists normalized_phone text generated always as (
    regexp_replace(phone, '[^0-9]', '', 'g')
  ) stored,
  add column if not exists normalized_company text generated always as (
    lower(btrim(company))
  ) stored,
  add column if not exists dedupe_key text generated always as (
    lower(btrim(email)) || '|' ||
    regexp_replace(phone, '[^0-9]', '', 'g') || '|' ||
    lower(btrim(company))
  ) stored;

alter table public.demo_enquiries
  drop constraint if exists demo_enquiries_intake_kind_check;
alter table public.demo_enquiries
  add constraint demo_enquiries_intake_kind_check
  check (intake_kind in ('demo_request', 'new_business_partner'));

alter table public.demo_enquiries
  drop constraint if exists demo_enquiries_preferred_contact_method_check;
alter table public.demo_enquiries
  add constraint demo_enquiries_preferred_contact_method_check
  check (
    preferred_contact_method is null
    or preferred_contact_method in ('email', 'phone', 'whatsapp', 'no_preference')
  );

alter table public.demo_enquiries
  drop constraint if exists demo_enquiries_dedupe_status_check;
alter table public.demo_enquiries
  add constraint demo_enquiries_dedupe_status_check
  check (dedupe_status in ('canonical', 'possible_duplicate', 'confirmed_duplicate', 'merged'));

alter table public.demo_enquiries
  drop constraint if exists demo_enquiries_submission_key_check;
alter table public.demo_enquiries
  add constraint demo_enquiries_submission_key_check
  check (
    submission_key is null
    or (
      submission_key = lower(btrim(submission_key))
      and char_length(submission_key) between 8 and 160
    )
  );

alter table public.demo_enquiries
  drop constraint if exists demo_enquiries_form_contract_check;
alter table public.demo_enquiries
  add constraint demo_enquiries_form_contract_check
  check (
    char_length(btrim(form_key)) between 3 and 100
    and (form_version is null or char_length(btrim(form_version)) between 1 and 50)
  );

alter table public.demo_enquiries
  drop constraint if exists demo_enquiries_services_interested_check;
alter table public.demo_enquiries
  add constraint demo_enquiries_services_interested_check
  check (cardinality(services_interested) <= 20);

alter table public.demo_enquiries
  drop constraint if exists demo_enquiries_popia_evidence_check;
alter table public.demo_enquiries
  add constraint demo_enquiries_popia_evidence_check
  check (
    popia_consent_given = false
    or (
      popia_consent_at is not null
      and nullif(btrim(privacy_policy_version), '') is not null
    )
  );

alter table public.demo_enquiries
  drop constraint if exists demo_enquiries_marketing_consent_check;
alter table public.demo_enquiries
  add constraint demo_enquiries_marketing_consent_check
  check (marketing_consent = false or popia_consent_given = true);

alter table public.demo_enquiries
  drop constraint if exists demo_enquiries_duplicate_reference_check;
alter table public.demo_enquiries
  add constraint demo_enquiries_duplicate_reference_check
  check (duplicate_of_enquiry_id is null or duplicate_of_enquiry_id <> id);

alter table public.demo_enquiries
  drop constraint if exists demo_enquiries_duplicate_reference_fkey;
alter table public.demo_enquiries
  add constraint demo_enquiries_duplicate_reference_fkey
  foreign key (duplicate_of_enquiry_id)
  references public.demo_enquiries(id)
  on delete set null;

create unique index if not exists demo_enquiries_submission_key_unique_idx
  on public.demo_enquiries (submission_key)
  where submission_key is not null;

create index if not exists demo_enquiries_normalized_email_idx
  on public.demo_enquiries (normalized_email, created_at desc);

create index if not exists demo_enquiries_normalized_phone_idx
  on public.demo_enquiries (normalized_phone, created_at desc)
  where normalized_phone <> '';

create index if not exists demo_enquiries_normalized_company_idx
  on public.demo_enquiries (normalized_company, created_at desc);

create index if not exists demo_enquiries_dedupe_queue_idx
  on public.demo_enquiries (dedupe_status, created_at desc)
  where dedupe_status <> 'canonical';

create index if not exists demo_enquiries_admin_filters_idx
  on public.demo_enquiries (intake_kind, source, sales_stage, created_at desc);

comment on column public.demo_enquiries.submission_key is
  'Caller-supplied, normalized idempotency key. The future public endpoint must reuse it for safe retries.';
comment on column public.demo_enquiries.request_fingerprint is
  'One-way request fingerprint for abuse controls. Never store a raw IP address in this field.';
comment on column public.demo_enquiries.dedupe_key is
  'Generated matching key for review grouping. It is intentionally not unique because a contact may submit again legitimately.';
comment on column public.demo_enquiries.popia_consent_given is
  'Records whether the submitter accepted the stated POPIA privacy processing notice.';

-- Preserve the existing RLS boundary. Public intake will use a separately
-- validated server endpoint in the final phase, never an anon table policy.
alter table public.demo_enquiries enable row level security;

commit;
