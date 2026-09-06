begin;

create table if not exists public.listing_job_worker_runs (
  id uuid primary key default gen_random_uuid(),
  worker_id text not null,
  requested_limit integer not null check (requested_limit between 1 and 25),
  claimed_count integer not null default 0,
  completed_count integer not null default 0,
  retry_scheduled_count integer not null default 0,
  manual_review_count integer not null default 0,
  status text not null default 'running' check (status in ('running', 'completed', 'failed')),
  duration_ms integer,
  error_code text,
  error_message text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create index if not exists listing_job_worker_runs_started_idx
  on public.listing_job_worker_runs (started_at desc);

alter table public.listing_job_worker_runs enable row level security;
revoke all on table public.listing_job_worker_runs from public, anon, authenticated;
grant all on table public.listing_job_worker_runs to service_role;

drop policy if exists listing_background_jobs_admin_update on public.listing_background_jobs;
create policy listing_background_jobs_admin_update
  on public.listing_background_jobs for update to authenticated
  using (public.bridge_is_org_admin(organisation_id))
  with check (public.bridge_is_org_admin(organisation_id));

grant update (
  status, available_at, attempt_count, max_attempts, lease_owner,
  lease_expires_at, last_error, last_error_code, result,
  updated_at, completed_at
) on public.listing_background_jobs to authenticated;

create or replace function public.bridge_retry_listing_job_v1(p_job_id uuid)
returns public.listing_background_jobs
language plpgsql
security invoker
set search_path = public, extensions
as $$
declare v_job public.listing_background_jobs;
begin
  update public.listing_background_jobs jobs
  set status = 'queued',
      available_at = now(),
      max_attempts = least(20, greatest(jobs.max_attempts, jobs.attempt_count + 1)),
      lease_owner = null,
      lease_expires_at = null,
      last_error = null,
      last_error_code = null,
      result = null,
      completed_at = null,
      updated_at = now()
  where jobs.id = p_job_id
    and jobs.status in ('failed', 'manual_review')
  returning * into v_job;
  if v_job.id is null then
    raise exception 'Job is unavailable or cannot be retried.' using errcode = '42501';
  end if;
  return v_job;
end;
$$;

create or replace function public.bridge_cancel_listing_job_v1(p_job_id uuid)
returns public.listing_background_jobs
language plpgsql
security invoker
set search_path = public, extensions
as $$
declare v_job public.listing_background_jobs;
begin
  update public.listing_background_jobs jobs
  set status = 'cancelled',
      lease_owner = null,
      lease_expires_at = null,
      completed_at = now(),
      updated_at = now()
  where jobs.id = p_job_id
    and jobs.status in ('queued', 'retry_scheduled', 'processing', 'manual_review')
  returning * into v_job;
  if v_job.id is null then
    raise exception 'Job is unavailable or cannot be cancelled.' using errcode = '42501';
  end if;
  return v_job;
end;
$$;

revoke all on function public.bridge_retry_listing_job_v1(uuid) from public, anon;
revoke all on function public.bridge_cancel_listing_job_v1(uuid) from public, anon;
grant execute on function public.bridge_retry_listing_job_v1(uuid) to authenticated;
grant execute on function public.bridge_cancel_listing_job_v1(uuid) to authenticated;

create or replace function public.bridge_listing_worker_health_v1()
returns jsonb
language sql
stable
security invoker
set search_path = public, extensions
as $$
  select jsonb_build_object(
    'lastRunAt', max(started_at),
    'lastSuccessAt', max(finished_at) filter (where status = 'completed'),
    'running', count(*) filter (where status = 'running' and started_at >= now() - interval '15 minutes'),
    'failedLastHour', count(*) filter (where status = 'failed' and started_at >= now() - interval '1 hour'),
    'runsLastHour', count(*) filter (where started_at >= now() - interval '1 hour'),
    'claimedLastHour', coalesce(sum(claimed_count) filter (where started_at >= now() - interval '1 hour'), 0),
    'stale', coalesce(max(started_at) < now() - interval '5 minutes', true),
    'measuredAt', now()
  )
  from public.listing_job_worker_runs;
$$;

revoke all on function public.bridge_listing_worker_health_v1() from public, anon, authenticated;
grant execute on function public.bridge_listing_worker_health_v1() to service_role;

-- Include the authenticated operator in subsequent lifecycle audit events.
create or replace function private.record_listing_job_event_v1()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare v_event_type text;
begin
  if tg_op = 'INSERT' then
    v_event_type := 'queued';
  elsif new.status is not distinct from old.status then
    return new;
  else
    v_event_type := case new.status when 'processing' then 'claimed' else new.status end;
  end if;
  insert into public.listing_background_job_events (
    job_id, organisation_id, listing_id, event_type, attempt_count,
    worker_id, error_code, metadata
  ) values (
    new.id, new.organisation_id, new.listing_id, v_event_type, new.attempt_count,
    new.lease_owner, new.last_error_code,
    jsonb_strip_nulls(jsonb_build_object(
      'actorId', auth.uid(),
      'availableAt', new.available_at,
      'leaseExpiresAt', new.lease_expires_at,
      'completedAt', new.completed_at
    ))
  );
  return new;
end;
$$;

revoke all on function private.record_listing_job_event_v1() from public, anon, authenticated;

comment on table public.listing_job_worker_runs is
  'Service-role-only worker heartbeat and scheduler execution evidence.';

commit;
