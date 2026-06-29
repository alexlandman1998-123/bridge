begin;

alter table if exists public.inbound_lead_emails
  add column if not exists parser_name text,
  add column if not exists parse_confidence numeric(5, 2),
  add column if not exists parse_warnings text[] not null default '{}'::text[],
  add column if not exists matched_fields jsonb not null default '{}'::jsonb;

alter table if exists public.lead_parse_failures
  add column if not exists parser_name text,
  add column if not exists parse_confidence numeric(5, 2),
  add column if not exists parse_warnings text[] not null default '{}'::text[];

create index if not exists inbound_lead_emails_parser_idx
  on public.inbound_lead_emails (parser_name, parse_confidence);

create index if not exists inbound_lead_emails_review_signal_idx
  on public.inbound_lead_emails (organisation_id, status, parse_confidence, received_at desc)
  where status in ('failed', 'unmatched', 'received', 'parsed');

commit;
