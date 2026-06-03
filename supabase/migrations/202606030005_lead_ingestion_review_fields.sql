alter table if exists public.lead_ingestion_logs
  add column if not exists review_status text,
  add column if not exists reviewed_by uuid references auth.users(id) on delete set null,
  add column if not exists reviewed_at timestamptz,
  add column if not exists resolved_at timestamptz,
  add column if not exists duplicate_of_log_id uuid references public.lead_ingestion_logs(log_id) on delete set null,
  add column if not exists retry_count integer not null default 0,
  add column if not exists last_retry_at timestamptz,
  add column if not exists listing_id uuid references public.private_listings(id) on delete set null,
  add column if not exists assigned_agent_id uuid references auth.users(id) on delete set null,
  add column if not exists processed_at timestamptz;

alter table if exists public.lead_ingestion_logs
  drop constraint if exists lead_ingestion_logs_review_status_check;

alter table if exists public.lead_ingestion_logs
  add constraint lead_ingestion_logs_review_status_check
  check (
    review_status is null
    or review_status in ('needs_review', 'reviewed', 'resolved', 'duplicate')
  );

create index if not exists idx_lead_ingestion_logs_review_status on public.lead_ingestion_logs(review_status);
create index if not exists idx_lead_ingestion_logs_duplicate_of on public.lead_ingestion_logs(duplicate_of_log_id);
create index if not exists idx_lead_ingestion_logs_listing_id on public.lead_ingestion_logs(listing_id);
create index if not exists idx_lead_ingestion_logs_assigned_agent_id on public.lead_ingestion_logs(assigned_agent_id);
create index if not exists idx_lead_ingestion_logs_processed_at on public.lead_ingestion_logs(processed_at desc);
