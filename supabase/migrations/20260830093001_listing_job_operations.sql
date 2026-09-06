begin;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists public.listing_background_job_events (
  id bigint generated always as identity primary key,
  job_id uuid not null references public.listing_background_jobs(id) on delete cascade,
  organisation_id uuid not null,
  listing_id uuid not null references public.private_listings(id) on delete cascade,
  event_type text not null check (event_type in (
    'queued', 'claimed', 'retry_scheduled', 'completed',
    'manual_review', 'cancelled', 'failed'
  )),
  attempt_count integer not null default 0,
  worker_id text,
  error_code text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists listing_background_job_events_job_idx
  on public.listing_background_job_events (job_id, created_at desc);
create index if not exists listing_background_job_events_listing_idx
  on public.listing_background_job_events (listing_id, created_at desc);
create index if not exists listing_background_jobs_expired_lease_idx
  on public.listing_background_jobs (lease_expires_at)
  where status = 'processing';
create index if not exists listing_background_jobs_org_health_idx
  on public.listing_background_jobs (organisation_id, status, created_at);

alter table public.listing_background_job_events enable row level security;

drop policy if exists listing_background_job_events_select_visible_listing on public.listing_background_job_events;
create policy listing_background_job_events_select_visible_listing
  on public.listing_background_job_events for select to authenticated
  using (exists (
    select 1
    from public.private_listings listing
    where listing.id = listing_background_job_events.listing_id
      and listing.organisation_id = listing_background_job_events.organisation_id
  ));

revoke all on table public.listing_background_job_events from public, anon, authenticated;
grant select on table public.listing_background_job_events to authenticated;
grant all on table public.listing_background_job_events to service_role;

create or replace function private.record_listing_job_event_v1()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_event_type text;
begin
  if tg_op = 'INSERT' then
    v_event_type := 'queued';
  elsif new.status is not distinct from old.status then
    return new;
  else
    v_event_type := case new.status
      when 'processing' then 'claimed'
      else new.status
    end;
  end if;

  insert into public.listing_background_job_events (
    job_id, organisation_id, listing_id, event_type, attempt_count,
    worker_id, error_code, metadata
  ) values (
    new.id, new.organisation_id, new.listing_id, v_event_type, new.attempt_count,
    new.lease_owner, new.last_error_code,
    jsonb_strip_nulls(jsonb_build_object(
      'availableAt', new.available_at,
      'leaseExpiresAt', new.lease_expires_at,
      'completedAt', new.completed_at
    ))
  );
  return new;
end;
$$;

revoke all on function private.record_listing_job_event_v1() from public, anon, authenticated;

drop trigger if exists listing_background_jobs_record_event on public.listing_background_jobs;
create trigger listing_background_jobs_record_event
after insert or update of status on public.listing_background_jobs
for each row execute function private.record_listing_job_event_v1();

-- Replace the Phase 4 enqueue function with per-tenant backpressure. The
-- transaction-scoped advisory lock prevents concurrent requests bypassing the cap.
create or replace function public.bridge_enqueue_listing_job_v1(
  p_listing_id uuid,
  p_job_type text,
  p_payload jsonb default '{}'::jsonb,
  p_idempotency_key text default null,
  p_max_attempts integer default 5
)
returns public.listing_background_jobs
language plpgsql
security invoker
set search_path = public, extensions
as $$
declare
  v_organisation_id uuid;
  v_job public.listing_background_jobs;
  v_key text := nullif(trim(p_idempotency_key), '');
begin
  if p_listing_id is null then raise exception 'Listing id is required.'; end if;
  if p_job_type not in ('media_reconcile', 'property24_publish', 'private_property_publish', 'document_generate', 'webhook_deliver') then
    raise exception 'Unsupported listing job type.';
  end if;

  select organisation_id into v_organisation_id
  from public.private_listings
  where id = p_listing_id;
  if v_organisation_id is null then
    raise exception 'Listing is unavailable.' using errcode = '42501';
  end if;

  if v_key is not null then
    select * into v_job
    from public.listing_background_jobs
    where organisation_id = v_organisation_id
      and job_type = p_job_type
      and idempotency_key = v_key;
    if v_job.id is not null then return v_job; end if;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_organisation_id::text, 918273));
  if (
    select count(*)
    from public.listing_background_jobs
    where organisation_id = v_organisation_id
      and status in ('queued', 'retry_scheduled', 'processing')
  ) >= 500 then
    raise exception 'Listing job queue is at capacity; retry later.' using errcode = '53300';
  end if;

  insert into public.listing_background_jobs (
    organisation_id, listing_id, job_type, payload, idempotency_key,
    max_attempts, requested_by
  ) values (
    v_organisation_id, p_listing_id, p_job_type, coalesce(p_payload, '{}'::jsonb),
    v_key, least(20, greatest(1, coalesce(p_max_attempts, 5))), auth.uid()
  )
  on conflict (organisation_id, job_type, idempotency_key)
    where idempotency_key is not null
  do update set updated_at = public.listing_background_jobs.updated_at
  returning * into v_job;
  return v_job;
end;
$$;

create or replace function public.bridge_listing_job_health_v1(
  p_listing_id uuid default null
)
returns jsonb
language sql
stable
security invoker
set search_path = public, extensions
as $$
  with visible_jobs as (
    select *
    from public.listing_background_jobs
    where p_listing_id is null or listing_id = p_listing_id
  ), counts as (
    select status, count(*)::integer as total
    from visible_jobs
    group by status
  )
  select jsonb_build_object(
    'total', (select count(*) from visible_jobs),
    'queued', coalesce((select total from counts where status = 'queued'), 0),
    'processing', coalesce((select total from counts where status = 'processing'), 0),
    'retryScheduled', coalesce((select total from counts where status = 'retry_scheduled'), 0),
    'manualReview', coalesce((select total from counts where status = 'manual_review'), 0),
    'completed', coalesce((select total from counts where status = 'completed'), 0),
    'cancelled', coalesce((select total from counts where status = 'cancelled'), 0),
    'expiredLeases', (select count(*) from visible_jobs where status = 'processing' and lease_expires_at < now()),
    'oldestReadyAgeSeconds', coalesce((
      select floor(extract(epoch from (now() - min(available_at))))::bigint
      from visible_jobs
      where status in ('queued', 'retry_scheduled') and available_at <= now()
    ), 0),
    'measuredAt', now()
  );
$$;

revoke all on function public.bridge_listing_job_health_v1(uuid) from public, anon;
grant execute on function public.bridge_listing_job_health_v1(uuid) to authenticated, service_role;

comment on table public.listing_background_job_events is
  'Append-only listing job lifecycle evidence for operations, support and reconciliation.';
comment on function public.bridge_listing_job_health_v1(uuid) is
  'Returns RLS-filtered listing queue health without exposing payload or result data.';

commit;
