begin;

alter table if exists public.inbound_lead_emails
  add column if not exists repaired_payload jsonb not null default '{}'::jsonb,
  add column if not exists repaired_by uuid references auth.users(id) on delete set null,
  add column if not exists repaired_at timestamptz,
  add column if not exists lead_ingestion_log_id uuid references public.lead_ingestion_logs(log_id) on delete set null;

alter table if exists public.lead_parse_failures
  add column if not exists repaired_payload jsonb not null default '{}'::jsonb,
  add column if not exists repaired_by uuid references auth.users(id) on delete set null,
  add column if not exists repaired_at timestamptz,
  add column if not exists lead_ingestion_log_id uuid references public.lead_ingestion_logs(log_id) on delete set null;

create index if not exists inbound_lead_emails_repaired_idx
  on public.inbound_lead_emails (organisation_id, repaired_at desc)
  where repaired_at is not null;

create index if not exists inbound_lead_emails_ingestion_log_idx
  on public.inbound_lead_emails (lead_ingestion_log_id)
  where lead_ingestion_log_id is not null;

create index if not exists lead_parse_failures_repaired_idx
  on public.lead_parse_failures (organisation_id, repaired_at desc)
  where repaired_at is not null;

create index if not exists lead_parse_failures_ingestion_log_idx
  on public.lead_parse_failures (lead_ingestion_log_id)
  where lead_ingestion_log_id is not null;

commit;
