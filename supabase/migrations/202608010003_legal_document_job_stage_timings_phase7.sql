begin;

create table if not exists public.legal_document_job_stage_timings (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  job_id uuid references public.legal_document_jobs(id) on delete cascade,
  packet_id uuid not null references public.document_packets(id) on delete cascade,
  packet_version_id uuid references public.document_packet_versions(id) on delete set null,
  stage text not null,
  started_at timestamptz not null,
  completed_at timestamptz,
  duration_ms integer,
  status text not null default 'running',
  error_code text,
  error_message text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint legal_document_job_stage_timings_status_check
    check (status in ('running','succeeded','failed','skipped')),
  constraint legal_document_job_stage_timings_duration_check
    check (duration_ms is null or duration_ms >= 0),
  constraint legal_document_job_stage_timings_stage_check
    check (
      stage in (
        'resolve_template',
        'map_mandate_data',
        'resolve_merge_fields',
        'create_editable_draft',
        'freeze_draft',
        'render_pdf',
        'certify_pdf',
        'prepare_signing_fields',
        'apply_signing_layout',
        'create_signing_links',
        'send_email',
        'record_delivery'
      )
    ),
  constraint legal_document_job_stage_timings_json_object_check
    check (jsonb_typeof(metadata_json) = 'object')
);

create index if not exists legal_document_job_stage_timings_job_phase7_idx
  on public.legal_document_job_stage_timings (job_id, started_at);

create index if not exists legal_document_job_stage_timings_packet_phase7_idx
  on public.legal_document_job_stage_timings (packet_id, stage, started_at desc);

create index if not exists legal_document_job_stage_timings_status_phase7_idx
  on public.legal_document_job_stage_timings (status, stage, started_at desc);

alter table public.legal_document_job_stage_timings enable row level security;
revoke all on table public.legal_document_job_stage_timings from public, anon, authenticated;
grant select, insert, update, delete on table public.legal_document_job_stage_timings to service_role;

create or replace function public.bridge_legal_document_job_stage_timing_phase7_row(
  p_timing public.legal_document_job_stage_timings
)
returns jsonb
language sql
security definer
set search_path=public
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'contract','legal-document-job-stage-timing-phase7-v1',
    'id',p_timing.id,
    'organisationId',p_timing.organisation_id,
    'jobId',p_timing.job_id,
    'packetId',p_timing.packet_id,
    'packetVersionId',p_timing.packet_version_id,
    'stage',p_timing.stage,
    'startedAt',p_timing.started_at,
    'completedAt',p_timing.completed_at,
    'durationMs',p_timing.duration_ms,
    'status',p_timing.status,
    'errorCode',p_timing.error_code,
    'errorMessage',p_timing.error_message,
    'metadata',case when p_timing.metadata_json = '{}'::jsonb then null else p_timing.metadata_json end
  ));
$$;

create or replace function public.bridge_list_legal_document_job_stage_timings_phase7(
  p_packet_id uuid,
  p_job_id uuid default null,
  p_limit integer default 100
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_limit integer:=least(greatest(coalesce(p_limit,100),1),250);
  v_timings jsonb:='[]'::jsonb;
begin
  if auth.role()<>'service_role' and not public.bridge_can_access_legal_packet_h2(p_packet_id) then
    raise exception 'Legal document timing access is required.' using errcode='42501';
  end if;

  select coalesce(jsonb_agg(public.bridge_legal_document_job_stage_timing_phase7_row(timing) order by timing.started_at asc),'[]'::jsonb)
    into v_timings
  from (
    select *
    from public.legal_document_job_stage_timings
    where packet_id=p_packet_id
      and (p_job_id is null or job_id=p_job_id)
    order by started_at asc
    limit v_limit
  ) timing;

  return jsonb_build_object(
    'contract','legal-document-job-stage-timing-phase7-list-v1',
    'packetId',p_packet_id,
    'jobId',p_job_id,
    'timings',v_timings,
    'mutatedData',false,
    'checkedAt',now()
  );
end;
$$;

revoke all on function public.bridge_legal_document_job_stage_timing_phase7_row(public.legal_document_job_stage_timings) from public, anon, authenticated;
revoke all on function public.bridge_list_legal_document_job_stage_timings_phase7(uuid,uuid,integer) from public, anon;

grant execute on function public.bridge_legal_document_job_stage_timing_phase7_row(public.legal_document_job_stage_timings) to service_role;
grant execute on function public.bridge_list_legal_document_job_stage_timings_phase7(uuid,uuid,integer) to authenticated, service_role;

comment on table public.legal_document_job_stage_timings is
  'Phase 7 structured timing rows for mandate generation and signature-send job stages.';
comment on column public.legal_document_job_stage_timings.duration_ms is
  'Elapsed time between started_at and completed_at for the recorded legal document stage.';

commit;
