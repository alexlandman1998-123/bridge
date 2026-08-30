begin;

create table if not exists public.listing_background_jobs (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  listing_id uuid not null references public.private_listings(id) on delete cascade,
  job_type text not null check (job_type in (
    'media_reconcile', 'property24_publish', 'private_property_publish',
    'document_generate', 'webhook_deliver'
  )),
  status text not null default 'queued' check (status in (
    'queued', 'processing', 'retry_scheduled', 'completed',
    'failed', 'manual_review', 'cancelled'
  )),
  payload jsonb not null default '{}'::jsonb,
  result jsonb,
  idempotency_key text,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  max_attempts integer not null default 5 check (max_attempts between 1 and 20),
  available_at timestamptz not null default now(),
  lease_owner text,
  lease_expires_at timestamptz,
  last_error text,
  last_error_code text,
  requested_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint listing_background_jobs_idempotency_key_length
    check (idempotency_key is null or length(idempotency_key) between 1 and 200)
);

create unique index if not exists listing_background_jobs_idempotency_idx
  on public.listing_background_jobs (organisation_id, job_type, idempotency_key)
  where idempotency_key is not null;
create index if not exists listing_background_jobs_claim_idx
  on public.listing_background_jobs (available_at, created_at)
  where status in ('queued', 'retry_scheduled', 'processing');
create index if not exists listing_background_jobs_listing_idx
  on public.listing_background_jobs (listing_id, created_at desc);

alter table public.listing_background_jobs enable row level security;

drop policy if exists listing_background_jobs_select_visible_listing on public.listing_background_jobs;
create policy listing_background_jobs_select_visible_listing
  on public.listing_background_jobs for select to authenticated
  using (exists (
    select 1 from public.private_listings listing
    where listing.id = listing_background_jobs.listing_id
      and listing.organisation_id = listing_background_jobs.organisation_id
  ));

drop policy if exists listing_background_jobs_insert_visible_listing on public.listing_background_jobs;
create policy listing_background_jobs_insert_visible_listing
  on public.listing_background_jobs for insert to authenticated
  with check (
    requested_by = auth.uid()
    and exists (
      select 1 from public.private_listings listing
      where listing.id = listing_background_jobs.listing_id
        and listing.organisation_id = listing_background_jobs.organisation_id
    )
  );

revoke all on table public.listing_background_jobs from public, anon, authenticated;
grant select, insert on table public.listing_background_jobs to authenticated;
grant all on table public.listing_background_jobs to service_role;

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

  insert into public.listing_background_jobs (
    organisation_id, listing_id, job_type, payload, idempotency_key,
    max_attempts, requested_by
  ) values (
    v_organisation_id, p_listing_id, p_job_type, coalesce(p_payload, '{}'::jsonb),
    nullif(trim(p_idempotency_key), ''), least(20, greatest(1, coalesce(p_max_attempts, 5))), auth.uid()
  )
  on conflict (organisation_id, job_type, idempotency_key)
    where idempotency_key is not null
  do update set updated_at = public.listing_background_jobs.updated_at
  returning * into v_job;

  return v_job;
end;
$$;

create or replace function public.bridge_claim_listing_jobs_v1(
  p_worker_id text,
  p_limit integer default 5,
  p_lease_seconds integer default 120
)
returns setof public.listing_background_jobs
language plpgsql
security invoker
set search_path = public, extensions
as $$
begin
  if nullif(trim(p_worker_id), '') is null then raise exception 'Worker id is required.'; end if;
  return query
  with candidates as (
    select id
    from public.listing_background_jobs
    where (
      status in ('queued', 'retry_scheduled') and available_at <= now()
    ) or (
      status = 'processing' and lease_expires_at < now()
    )
    order by available_at, created_at
    for update skip locked
    limit least(25, greatest(1, coalesce(p_limit, 5)))
  )
  update public.listing_background_jobs jobs
  set status = 'processing',
      attempt_count = jobs.attempt_count + 1,
      lease_owner = trim(p_worker_id),
      lease_expires_at = now() + make_interval(secs => least(900, greatest(30, coalesce(p_lease_seconds, 120)))),
      updated_at = now()
  from candidates
  where jobs.id = candidates.id
  returning jobs.*;
end;
$$;

create or replace function public.bridge_complete_listing_job_v1(
  p_job_id uuid,
  p_worker_id text,
  p_result jsonb default '{}'::jsonb
)
returns public.listing_background_jobs
language plpgsql
security invoker
set search_path = public, extensions
as $$
declare v_job public.listing_background_jobs;
begin
  update public.listing_background_jobs
  set status = 'completed', result = coalesce(p_result, '{}'::jsonb),
      lease_owner = null, lease_expires_at = null, completed_at = now(), updated_at = now()
  where id = p_job_id and status = 'processing' and lease_owner = trim(p_worker_id)
  returning * into v_job;
  if v_job.id is null then raise exception 'Job lease is unavailable.' using errcode = '55P03'; end if;
  return v_job;
end;
$$;

create or replace function public.bridge_fail_listing_job_v1(
  p_job_id uuid,
  p_worker_id text,
  p_error text,
  p_error_code text default null,
  p_retryable boolean default true
)
returns public.listing_background_jobs
language plpgsql
security invoker
set search_path = public, extensions
as $$
declare v_job public.listing_background_jobs;
begin
  update public.listing_background_jobs jobs
  set status = case
        when coalesce(p_retryable, true) and jobs.attempt_count < jobs.max_attempts then 'retry_scheduled'
        else 'manual_review'
      end,
      available_at = case
        when coalesce(p_retryable, true) and jobs.attempt_count < jobs.max_attempts
          then now() + make_interval(secs => least(3600, 30 * power(2, greatest(0, jobs.attempt_count - 1)))::integer)
        else jobs.available_at
      end,
      last_error = left(coalesce(p_error, 'Unknown worker failure.'), 4000),
      last_error_code = left(nullif(trim(p_error_code), ''), 100),
      lease_owner = null, lease_expires_at = null, updated_at = now()
  where id = p_job_id and status = 'processing' and lease_owner = trim(p_worker_id)
  returning * into v_job;
  if v_job.id is null then raise exception 'Job lease is unavailable.' using errcode = '55P03'; end if;
  return v_job;
end;
$$;

revoke all on function public.bridge_enqueue_listing_job_v1(uuid, text, jsonb, text, integer) from public, anon;
grant execute on function public.bridge_enqueue_listing_job_v1(uuid, text, jsonb, text, integer) to authenticated;
revoke all on function public.bridge_claim_listing_jobs_v1(text, integer, integer) from public, anon, authenticated;
revoke all on function public.bridge_complete_listing_job_v1(uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.bridge_fail_listing_job_v1(uuid, text, text, text, boolean) from public, anon, authenticated;
grant execute on function public.bridge_claim_listing_jobs_v1(text, integer, integer) to service_role;
grant execute on function public.bridge_complete_listing_job_v1(uuid, text, jsonb) to service_role;
grant execute on function public.bridge_fail_listing_job_v1(uuid, text, text, text, boolean) to service_role;

comment on table public.listing_background_jobs is
  'Durable, tenant-scoped listing work queue with idempotency, leases, bounded retries and manual review.';

commit;
