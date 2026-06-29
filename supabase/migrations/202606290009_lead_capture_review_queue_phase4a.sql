begin;

alter table if exists public.inbound_lead_emails
  add column if not exists review_status text,
  add column if not exists reviewed_by uuid references auth.users(id) on delete set null,
  add column if not exists reviewed_at timestamptz,
  add column if not exists resolved_at timestamptz,
  add column if not exists ignored_at timestamptz,
  add column if not exists review_note text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'inbound_lead_emails_review_status_check'
      and conrelid = 'public.inbound_lead_emails'::regclass
  ) then
    alter table public.inbound_lead_emails
      add constraint inbound_lead_emails_review_status_check
      check (review_status is null or review_status in ('open', 'resolved', 'ignored'));
  end if;
end;
$$;

alter table if exists public.lead_parse_failures
  add column if not exists ignored_by uuid references auth.users(id) on delete set null,
  add column if not exists ignored_at timestamptz,
  add column if not exists review_note text;

create index if not exists inbound_lead_emails_review_queue_idx
  on public.inbound_lead_emails (organisation_id, review_status, received_at desc)
  where review_status is not null;

create index if not exists inbound_lead_emails_low_confidence_review_idx
  on public.inbound_lead_emails (organisation_id, parse_confidence, received_at desc)
  where parse_confidence is not null and parse_confidence < 0.65;

create index if not exists lead_parse_failures_review_queue_idx
  on public.lead_parse_failures (organisation_id, status, created_at desc);

commit;
