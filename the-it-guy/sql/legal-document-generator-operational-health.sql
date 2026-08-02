-- Legal document generator operational health checks.
-- Run the read-only sections in the Supabase SQL editor during an incident.
-- Run each "create index concurrently" statement by itself in production.

-- 1. Apply first: hot-path indexes for the one-minute watchdog and packet job history.
-- These are also captured as a normal migration in:
-- supabase/migrations/202608020004_legal_document_jobs_hot_path_indexes.sql
create index concurrently if not exists legal_document_jobs_watchdog_generate_created_idx
  on public.legal_document_jobs (created_at)
  where job_type = 'generate_packet_version'
    and status in ('queued','claimed','running','failed');

create index concurrently if not exists legal_document_jobs_packet_created_idx
  on public.legal_document_jobs (packet_id, created_at desc);

-- 2. Confirm the indexes exist.
select
  schemaname,
  tablename,
  indexname,
  indexdef
from pg_indexes
where schemaname = 'public'
  and tablename = 'legal_document_jobs'
  and indexname in (
    'legal_document_jobs_watchdog_generate_created_idx',
    'legal_document_jobs_packet_created_idx'
  )
order by indexname;

-- 3. Check whether the generator/watchdog is active right now.
select
  pid,
  now() - query_start as age,
  state,
  wait_event_type,
  wait_event,
  left(query, 800) as query
from pg_stat_activity
where state <> 'idle'
  and (
    query ilike '%legal_document_jobs%'
    or query ilike '%generate-mandate%'
    or query ilike '%legal-document-job-runner%'
  )
order by query_start asc
limit 50;

-- 4. Check job backlog and retry exhaustion.
select
  job_type,
  status,
  count(*) as jobs,
  min(created_at) as oldest,
  max(updated_at) as newest_update,
  count(*) filter (where attempt_count >= max_attempts) as exhausted_jobs
from public.legal_document_jobs
group by job_type, status
order by jobs desc, job_type, status;

-- 5. Check the most recent generator failures.
select
  id,
  status,
  attempt_count,
  max_attempts,
  created_at,
  updated_at,
  last_heartbeat_at,
  failed_at,
  error_json->>'errorCode' as error_code,
  error_json->>'error' as error_message,
  error_json
from public.legal_document_jobs
where job_type = 'generate_packet_version'
order by updated_at desc
limit 25;

-- 6. Inspect timing rows, including storage/upload byte metadata when present.
select
  job_id,
  stage,
  status,
  duration_ms,
  error_code,
  error_message,
  nullif(metadata_json->>'byteLength', '')::bigint as byte_length,
  metadata_json->>'bucket' as bucket,
  metadata_json->>'filePath' as file_path,
  created_at
from public.legal_document_job_stage_timings
where created_at >= now() - interval '24 hours'
order by created_at desc
limit 100;

-- 7. Check generated mandate storage objects and sizes.
select
  bucket_id,
  name,
  nullif(metadata->>'size', '')::bigint as byte_length,
  round((nullif(metadata->>'size', '')::numeric / 1024 / 1024), 2) as size_mb,
  created_at,
  updated_at
from storage.objects
where name like 'packet-%/mandate-documents/%'
order by created_at desc
limit 50;

-- 8. Storage/compute decision rule.
-- If Database Health shows depleted Disk IO Budget and users are blocked,
-- upgrade compute temporarily for breathing room.
-- Do not upgrade storage unless storage usage, bucket/global upload limits,
-- or object sizes prove a storage capacity/limit problem.
