begin;

create table if not exists public.legal_document_jobs (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  packet_id uuid not null references public.document_packets(id) on delete cascade,
  packet_version_id uuid references public.document_packet_versions(id) on delete set null,
  job_type text not null,
  status text not null default 'queued',
  idempotency_key text not null,
  generation_attempt_id uuid,
  dispatch_id uuid,
  target_signer_role text,
  request_payload_json jsonb not null default '{}'::jsonb,
  result_json jsonb not null default '{}'::jsonb,
  error_json jsonb not null default '{}'::jsonb,
  metadata_json jsonb not null default '{}'::jsonb,
  created_by uuid,
  claimed_by uuid,
  attempt_count integer not null default 0,
  max_attempts integer not null default 3,
  available_at timestamptz not null default now(),
  next_retry_at timestamptz,
  claimed_at timestamptz,
  started_at timestamptz,
  last_heartbeat_at timestamptz,
  completed_at timestamptz,
  failed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint legal_document_jobs_job_type_check
    check (job_type in ('generate_packet_version','send_for_signature','generate_and_send_for_signature')),
  constraint legal_document_jobs_status_check
    check (status in ('queued','claimed','running','succeeded','failed','cancelled')),
  constraint legal_document_jobs_idempotency_key_check
    check (
      char_length(idempotency_key) between 16 and 160
      and idempotency_key ~ '^[A-Za-z0-9._:-]+$'
    ),
  constraint legal_document_jobs_attempt_count_check
    check (attempt_count >= 0 and max_attempts between 1 and 10),
  constraint legal_document_jobs_json_object_check
    check (
      jsonb_typeof(request_payload_json) = 'object'
      and jsonb_typeof(result_json) = 'object'
      and jsonb_typeof(error_json) = 'object'
      and jsonb_typeof(metadata_json) = 'object'
    ),
  constraint legal_document_jobs_packet_version_packet_check
    check (packet_version_id is null or packet_id is not null)
);

create unique index if not exists legal_document_jobs_idempotency_phase1_idx
  on public.legal_document_jobs (organisation_id, job_type, idempotency_key);

create index if not exists legal_document_jobs_packet_status_phase1_idx
  on public.legal_document_jobs (packet_id, status, created_at desc);

create index if not exists legal_document_jobs_runnable_phase1_idx
  on public.legal_document_jobs (status, available_at, created_at)
  where status in ('queued','failed');

create index if not exists legal_document_jobs_organisation_created_phase1_idx
  on public.legal_document_jobs (organisation_id, created_at desc);

drop trigger if exists legal_document_jobs_set_updated_at_phase1 on public.legal_document_jobs;
create trigger legal_document_jobs_set_updated_at_phase1
before update on public.legal_document_jobs
for each row execute function public.bridge_set_updated_at();

alter table public.legal_document_jobs enable row level security;
revoke all on table public.legal_document_jobs from public, anon, authenticated;
grant select, insert, update on table public.legal_document_jobs to service_role;

create or replace function public.bridge_legal_document_job_phase1_row(p_job public.legal_document_jobs)
returns jsonb
language sql
security definer
set search_path=public
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'contract','legal-document-job-phase1-v1',
    'jobId',p_job.id,
    'organisationId',p_job.organisation_id,
    'packetId',p_job.packet_id,
    'packetVersionId',p_job.packet_version_id,
    'jobType',p_job.job_type,
    'status',p_job.status,
    'idempotencyKey',p_job.idempotency_key,
    'generationAttemptId',p_job.generation_attempt_id,
    'dispatchId',p_job.dispatch_id,
    'targetSignerRole',p_job.target_signer_role,
    'attemptCount',p_job.attempt_count,
    'maxAttempts',p_job.max_attempts,
    'availableAt',p_job.available_at,
    'nextRetryAt',p_job.next_retry_at,
    'claimedAt',p_job.claimed_at,
    'startedAt',p_job.started_at,
    'lastHeartbeatAt',p_job.last_heartbeat_at,
    'completedAt',p_job.completed_at,
    'failedAt',p_job.failed_at,
    'cancelledAt',p_job.cancelled_at,
    'createdAt',p_job.created_at,
    'updatedAt',p_job.updated_at,
    'result',case when p_job.result_json = '{}'::jsonb then null else p_job.result_json end,
    'error',case when p_job.error_json = '{}'::jsonb then null else p_job.error_json end,
    'metadata',case when p_job.metadata_json = '{}'::jsonb then null else p_job.metadata_json end,
    'trackingOnly',true
  ));
$$;

create or replace function public.bridge_create_legal_document_job_phase1(
  p_packet_id uuid,
  p_job_type text,
  p_idempotency_key text,
  p_request_payload_json jsonb default '{}'::jsonb,
  p_target_signer_role text default null,
  p_available_at timestamptz default null,
  p_metadata_json jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_packet public.document_packets%rowtype;
  v_job public.legal_document_jobs%rowtype;
  v_job_type text:=lower(trim(coalesce(p_job_type,'')));
  v_idempotency_key text:=trim(coalesce(p_idempotency_key,''));
  v_target_signer_role text:=nullif(lower(trim(coalesce(p_target_signer_role,''))),'');
  v_request_payload jsonb:=coalesce(p_request_payload_json,'{}'::jsonb);
  v_metadata jsonb:=coalesce(p_metadata_json,'{}'::jsonb);
begin
  if auth.role()<>'service_role' then
    raise exception 'Service-role job tracking authority is required.' using errcode='42501';
  end if;
  if v_job_type not in ('generate_packet_version','send_for_signature','generate_and_send_for_signature') then
    raise exception 'Legal document job type is invalid.' using errcode='22023';
  end if;
  if char_length(v_idempotency_key) not between 16 and 160 or v_idempotency_key !~ '^[A-Za-z0-9._:-]+$' then
    raise exception 'Legal document job idempotency key is invalid.' using errcode='22023';
  end if;
  if jsonb_typeof(v_request_payload)<>'object' or jsonb_typeof(v_metadata)<>'object' then
    raise exception 'Legal document job payloads must be JSON objects.' using errcode='22023';
  end if;
  select * into v_packet from public.document_packets where id=p_packet_id;
  if v_packet.id is null then
    raise exception 'Document packet not found.' using errcode='P0002';
  end if;

  insert into public.legal_document_jobs (
    organisation_id,
    packet_id,
    job_type,
    status,
    idempotency_key,
    target_signer_role,
    request_payload_json,
    metadata_json,
    created_by,
    available_at
  ) values (
    v_packet.organisation_id,
    v_packet.id,
    v_job_type,
    'queued',
    v_idempotency_key,
    v_target_signer_role,
    v_request_payload,
    v_metadata || jsonb_build_object('createdByContract','phase1-tracking-only'),
    auth.uid(),
    coalesce(p_available_at,now())
  )
  on conflict (organisation_id, job_type, idempotency_key) do update set
    updated_at=public.legal_document_jobs.updated_at,
    metadata_json=public.legal_document_jobs.metadata_json || jsonb_build_object('lastIdempotentCreateAt',now())
  returning * into v_job;

  return public.bridge_legal_document_job_phase1_row(v_job) || jsonb_build_object('mutatedData',true);
end;
$$;

create or replace function public.bridge_update_legal_document_job_phase1(
  p_job_id uuid,
  p_status text,
  p_result_json jsonb default null,
  p_error_json jsonb default null,
  p_packet_version_id uuid default null,
  p_generation_attempt_id uuid default null,
  p_dispatch_id uuid default null,
  p_next_retry_at timestamptz default null,
  p_metadata_json jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_job public.legal_document_jobs%rowtype;
  v_updated public.legal_document_jobs%rowtype;
  v_status text:=lower(trim(coalesce(p_status,'')));
  v_result jsonb:=coalesce(p_result_json,'{}'::jsonb);
  v_error jsonb:=coalesce(p_error_json,'{}'::jsonb);
  v_metadata jsonb:=coalesce(p_metadata_json,'{}'::jsonb);
begin
  if auth.role()<>'service_role' then
    raise exception 'Service-role job tracking authority is required.' using errcode='42501';
  end if;
  if v_status not in ('queued','claimed','running','succeeded','failed','cancelled') then
    raise exception 'Legal document job status is invalid.' using errcode='22023';
  end if;
  if jsonb_typeof(v_result)<>'object' or jsonb_typeof(v_error)<>'object' or jsonb_typeof(v_metadata)<>'object' then
    raise exception 'Legal document job status payloads must be JSON objects.' using errcode='22023';
  end if;
  select * into v_job from public.legal_document_jobs where id=p_job_id for update;
  if v_job.id is null then
    raise exception 'Legal document job not found.' using errcode='P0002';
  end if;
  if p_packet_version_id is not null and not exists (
    select 1 from public.document_packet_versions
    where id=p_packet_version_id and packet_id=v_job.packet_id
  ) then
    raise exception 'Legal document job packet version does not belong to the tracked packet.' using errcode='22023';
  end if;

  update public.legal_document_jobs
  set status=v_status,
      packet_version_id=coalesce(p_packet_version_id,packet_version_id),
      generation_attempt_id=coalesce(p_generation_attempt_id,generation_attempt_id),
      dispatch_id=coalesce(p_dispatch_id,dispatch_id),
      result_json=case when p_result_json is null then result_json else v_result end,
      error_json=case when p_error_json is null then error_json else v_error end,
      metadata_json=metadata_json || v_metadata,
      attempt_count=case
        when v_status='running' and status<>'running' then attempt_count+1
        else attempt_count
      end,
      next_retry_at=case when p_next_retry_at is null then next_retry_at else p_next_retry_at end,
      claimed_by=case when v_status in ('claimed','running') then coalesce(auth.uid(),claimed_by) else claimed_by end,
      claimed_at=case when v_status='claimed' and claimed_at is null then now() else claimed_at end,
      started_at=case when v_status='running' and started_at is null then now() else started_at end,
      last_heartbeat_at=case when v_status in ('claimed','running') then now() else last_heartbeat_at end,
      completed_at=case when v_status='succeeded' then now() else completed_at end,
      failed_at=case when v_status='failed' then now() else failed_at end,
      cancelled_at=case when v_status='cancelled' then now() else cancelled_at end
  where id=p_job_id
  returning * into v_updated;

  return public.bridge_legal_document_job_phase1_row(v_updated) || jsonb_build_object('mutatedData',true);
end;
$$;

create or replace function public.bridge_get_legal_document_job_phase1(p_job_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_job public.legal_document_jobs%rowtype;
begin
  select * into v_job from public.legal_document_jobs where id=p_job_id;
  if v_job.id is null then
    raise exception 'Legal document job not found.' using errcode='P0002';
  end if;
  if auth.role()<>'service_role' and not public.bridge_can_access_legal_packet_h2(v_job.packet_id) then
    raise exception 'Legal document job access is required.' using errcode='42501';
  end if;
  return public.bridge_legal_document_job_phase1_row(v_job) || jsonb_build_object('mutatedData',false);
end;
$$;

create or replace function public.bridge_list_legal_document_jobs_for_packet_phase1(
  p_packet_id uuid,
  p_limit integer default 10
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_packet public.document_packets%rowtype;
  v_limit integer:=least(greatest(coalesce(p_limit,10),1),50);
  v_jobs jsonb:='[]'::jsonb;
begin
  if auth.role()<>'service_role' and not public.bridge_can_access_legal_packet_h2(p_packet_id) then
    raise exception 'Legal document job access is required.' using errcode='42501';
  end if;
  select * into v_packet from public.document_packets where id=p_packet_id;
  if v_packet.id is null then
    raise exception 'Document packet not found.' using errcode='P0002';
  end if;
  select coalesce(jsonb_agg(public.bridge_legal_document_job_phase1_row(job) order by job.created_at desc),'[]'::jsonb)
    into v_jobs
  from (
    select *
    from public.legal_document_jobs
    where packet_id=p_packet_id
    order by created_at desc
    limit v_limit
  ) job;
  return jsonb_build_object(
    'contract','legal-document-job-phase1-list-v1',
    'packetId',p_packet_id,
    'packetType',lower(v_packet.packet_type),
    'jobs',v_jobs,
    'trackingOnly',true,
    'mutatedData',false,
    'checkedAt',now()
  );
end;
$$;

revoke all on function public.bridge_legal_document_job_phase1_row(public.legal_document_jobs) from public,anon,authenticated;
revoke all on function public.bridge_create_legal_document_job_phase1(uuid,text,text,jsonb,text,timestamptz,jsonb) from public,anon,authenticated;
revoke all on function public.bridge_update_legal_document_job_phase1(uuid,text,jsonb,jsonb,uuid,uuid,uuid,timestamptz,jsonb) from public,anon,authenticated;
revoke all on function public.bridge_get_legal_document_job_phase1(uuid) from public,anon;
revoke all on function public.bridge_list_legal_document_jobs_for_packet_phase1(uuid,integer) from public,anon;

grant execute on function public.bridge_legal_document_job_phase1_row(public.legal_document_jobs) to service_role;
grant execute on function public.bridge_create_legal_document_job_phase1(uuid,text,text,jsonb,text,timestamptz,jsonb) to service_role;
grant execute on function public.bridge_update_legal_document_job_phase1(uuid,text,jsonb,jsonb,uuid,uuid,uuid,timestamptz,jsonb) to service_role;
grant execute on function public.bridge_get_legal_document_job_phase1(uuid) to authenticated,service_role;
grant execute on function public.bridge_list_legal_document_jobs_for_packet_phase1(uuid,integer) to authenticated,service_role;

comment on table public.legal_document_jobs is
  'Phase 1 durable tracking records for legal document generation/send jobs. This table is intentionally tracking-only until a server-side worker is introduced.';
comment on column public.legal_document_jobs.idempotency_key is
  'Caller-stable key used to deduplicate job records before any background worker is allowed to consume them.';

commit;
