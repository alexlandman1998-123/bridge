begin;

alter table if exists public.property24_listing_syncs
  add column if not exists last_payload_hash text,
  add column if not exists last_image_payload_hash text;

create table if not exists public.property24_sync_attempts (
  id uuid primary key default gen_random_uuid(),
  private_listing_id uuid references public.private_listings(id) on delete set null,
  environment text not null default 'exdev',
  agency_id integer,
  listing_number integer,
  action text not null,
  status text not null default 'running',
  idempotency_key text not null,
  payload_hash text,
  image_payload_hash text,
  request_payload_summary jsonb not null default '{}'::jsonb,
  response_summary jsonb not null default '{}'::jsonb,
  error_summary jsonb not null default '{}'::jsonb,
  property24_http_status integer,
  duration_ms integer,
  retry_count integer not null default 0,
  actor_user_id uuid,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint property24_sync_attempts_environment_check
    check (environment in ('exdev', 'production')),
  constraint property24_sync_attempts_action_check
    check (action in ('create', 'update', 'status_update', 'reconcile', 'lead_import')),
  constraint property24_sync_attempts_status_check
    check (status in ('running', 'succeeded', 'failed', 'blocked', 'skipped')),
  constraint property24_sync_attempts_request_object_check
    check (jsonb_typeof(request_payload_summary) = 'object'),
  constraint property24_sync_attempts_response_object_check
    check (jsonb_typeof(response_summary) = 'object'),
  constraint property24_sync_attempts_error_object_check
    check (jsonb_typeof(error_summary) = 'object'),
  constraint property24_sync_attempts_duration_check
    check (duration_ms is null or duration_ms >= 0),
  constraint property24_sync_attempts_retry_check
    check (retry_count >= 0)
);

create unique index if not exists property24_sync_attempts_idempotency_uidx
  on public.property24_sync_attempts(idempotency_key);

create index if not exists property24_sync_attempts_listing_idx
  on public.property24_sync_attempts(private_listing_id, environment, created_at desc);

create index if not exists property24_sync_attempts_status_idx
  on public.property24_sync_attempts(status, created_at desc);

create or replace function public.property24_sync_attempts_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_property24_sync_attempts_updated_at on public.property24_sync_attempts;
create trigger trg_property24_sync_attempts_updated_at
before update on public.property24_sync_attempts
for each row execute function public.property24_sync_attempts_set_updated_at();

alter table public.property24_sync_attempts enable row level security;

grant select, insert, update, delete on public.property24_sync_attempts to service_role;

comment on table public.property24_sync_attempts is
  'Service-role audit trail for Property24 create/update/status/reconcile/lead import attempts. Request payloads are summaries, not raw credentials or raw image bytes.';

comment on column public.property24_sync_attempts.idempotency_key is
  'Stable key used to avoid duplicate external writes for the same action and payload.';

commit;
