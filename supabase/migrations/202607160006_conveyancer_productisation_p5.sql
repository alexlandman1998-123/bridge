begin;

create table if not exists public.conveyancer_document_pipeline_controls (
  id uuid primary key default gen_random_uuid(), record_id uuid not null default gen_random_uuid(), revision integer not null check (revision > 0),
  organisation_id uuid not null references public.organisations(id) on delete restrict,
  attorney_firm_id uuid not null references public.attorney_firms(id) on delete restrict,
  mode text not null check (mode in ('disabled', 'observe', 'pilot', 'live')),
  allowed_operations text[] not null default '{}'::text[], allowed_adapters text[] not null default array['manual']::text[],
  pilot_transaction_ids uuid[] not null default '{}'::uuid[], kill_switch_enabled boolean not null default true,
  reason text not null check (length(trim(reason)) > 0), contract_version text not null default 'conveyancer_document_pipeline_p5_v1',
  fingerprint text not null check (length(trim(fingerprint)) >= 8), created_by uuid not null, created_at timestamptz not null default now(),
  unique(record_id, revision), unique(id, organisation_id, attorney_firm_id),
  check (allowed_operations <@ array['render','send_for_signing','finalise_signed_pack','manual_upload']::text[]),
  check (allowed_adapters <@ array['arch9_packet','manual']::text[])
);

create table if not exists public.conveyancer_document_jobs (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null references public.organisations(id) on delete restrict,
  attorney_firm_id uuid not null references public.attorney_firms(id) on delete restrict,
  transaction_id uuid not null references public.transactions(id) on delete restrict, control_id uuid not null,
  command_id text not null, operation text not null check (operation in ('render','send_for_signing','finalise_signed_pack','manual_upload')),
  adapter text not null check (adapter in ('arch9_packet','manual')), document_type text not null,
  command_fingerprint text not null check (length(trim(command_fingerprint)) >= 8), status text not null default 'queued' check (status in ('queued','processing','succeeded','failed','cancelled')),
  command_payload jsonb not null check (jsonb_typeof(command_payload) = 'object'), result_payload jsonb,
  claimed_by uuid, claimed_at timestamptz, completed_at timestamptz, last_error text,
  created_by uuid not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(attorney_firm_id, command_id), unique(id, organisation_id, attorney_firm_id, transaction_id),
  foreign key(control_id, organisation_id, attorney_firm_id) references public.conveyancer_document_pipeline_controls(id, organisation_id, attorney_firm_id) on delete restrict
);

create table if not exists public.conveyancer_signing_provider_events (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null references public.organisations(id) on delete restrict,
  attorney_firm_id uuid not null references public.attorney_firms(id) on delete restrict,
  transaction_id uuid not null references public.transactions(id) on delete restrict,
  provider_key text not null, provider_event_id text not null, event_type text not null,
  signature_verified boolean not null default false, payload_hash text not null check (length(trim(payload_hash)) >= 8),
  object_bucket text, object_path text, metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
  received_at timestamptz not null default now(), processed_at timestamptz,
  unique(attorney_firm_id, provider_key, provider_event_id),
  check ((object_bucket is null and object_path is null) or (object_bucket is not null and object_path is not null))
);

create index if not exists conveyancer_document_controls_scope_idx on public.conveyancer_document_pipeline_controls(organisation_id, attorney_firm_id, revision desc);
create index if not exists conveyancer_document_jobs_scope_idx on public.conveyancer_document_jobs(organisation_id, attorney_firm_id, transaction_id, created_at desc);
create index if not exists conveyancer_document_jobs_queue_idx on public.conveyancer_document_jobs(status, created_at) where status in ('queued','processing');
create index if not exists conveyancer_provider_events_scope_idx on public.conveyancer_signing_provider_events(organisation_id, attorney_firm_id, transaction_id, received_at desc);

alter table public.conveyancer_document_pipeline_controls enable row level security;
alter table public.conveyancer_document_jobs enable row level security;
alter table public.conveyancer_signing_provider_events enable row level security;
create policy conveyancer_document_controls_select_scoped on public.conveyancer_document_pipeline_controls for select to authenticated using (public.bridge_conveyancer_can_access_record(organisation_id, attorney_firm_id, null::uuid));
create policy conveyancer_document_jobs_select_scoped on public.conveyancer_document_jobs for select to authenticated using (public.bridge_conveyancer_can_access_record(organisation_id, attorney_firm_id, transaction_id));
create policy conveyancer_provider_events_select_scoped on public.conveyancer_signing_provider_events for select to authenticated using (public.bridge_conveyancer_can_access_record(organisation_id, attorney_firm_id, transaction_id));
revoke all on public.conveyancer_document_pipeline_controls, public.conveyancer_document_jobs, public.conveyancer_signing_provider_events from anon, authenticated, service_role;
grant select on public.conveyancer_document_pipeline_controls, public.conveyancer_document_jobs, public.conveyancer_signing_provider_events to authenticated, service_role;

drop trigger if exists conveyancer_document_controls_immutable on public.conveyancer_document_pipeline_controls;
create trigger conveyancer_document_controls_immutable before update or delete on public.conveyancer_document_pipeline_controls for each row execute function public.bridge_conveyancer_reject_mutation();
drop trigger if exists conveyancer_provider_events_immutable on public.conveyancer_signing_provider_events;
create trigger conveyancer_provider_events_immutable before update or delete on public.conveyancer_signing_provider_events for each row execute function public.bridge_conveyancer_reject_mutation();
drop trigger if exists conveyancer_document_controls_audit on public.conveyancer_document_pipeline_controls;
create trigger conveyancer_document_controls_audit after insert on public.conveyancer_document_pipeline_controls for each row execute function public.bridge_conveyancer_capture_insert_audit();

create or replace function public.bridge_set_conveyancer_document_pipeline_control(payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid(); v_org uuid; v_firm uuid; v_record uuid; v_revision integer;
  v_mode text := lower(trim(coalesce(payload ->> 'mode','disabled'))); v_operations text[]; v_adapters text[]; v_pilot uuid[];
  v_reason text := trim(coalesce(payload ->> 'reason','')); v_fingerprint text := trim(coalesce(payload ->> 'fingerprint',''));
  v_row public.conveyancer_document_pipeline_controls%rowtype;
begin
  if v_user is null then raise exception 'Authentication is required.' using errcode='42501'; end if;
  begin
    v_org := (payload ->> 'organisationId')::uuid; v_firm := (payload ->> 'attorneyFirmId')::uuid;
    select coalesce(array_agg(distinct value::uuid),'{}'::uuid[]) into v_pilot from jsonb_array_elements_text(coalesce(payload -> 'pilotTransactionIds','[]'::jsonb)) items(value);
  exception when invalid_text_representation then raise exception 'P5 control identity is invalid.' using errcode='22023'; end;
  if not public.attorney_user_is_firm_admin(v_firm) then raise exception 'Firm administrator authority is required.' using errcode='42501'; end if;
  if not exists(select 1 from public.attorney_firms where id=v_firm and organisation_id=v_org and is_active) then raise exception 'P5 firm binding is invalid.' using errcode='22023'; end if;
  select coalesce(array_agg(distinct lower(trim(value))),'{}'::text[]) into v_operations from jsonb_array_elements_text(coalesce(payload -> 'allowedOperations','[]'::jsonb)) items(value);
  select coalesce(array_agg(distinct lower(trim(value))),array['manual']::text[]) into v_adapters from jsonb_array_elements_text(coalesce(payload -> 'allowedAdapters','["manual"]'::jsonb)) items(value);
  if v_mode not in ('disabled','observe','pilot','live') or v_reason='' or length(v_fingerprint)<8 or not (v_operations <@ array['render','send_for_signing','finalise_signed_pack','manual_upload']::text[]) or not (v_adapters <@ array['arch9_packet','manual']::text[]) then raise exception 'P5 control is invalid.' using errcode='22023'; end if;
  if v_mode='pilot' and cardinality(v_pilot)=0 then raise exception 'P5 pilot mode requires a transaction cohort.' using errcode='22023'; end if;
  if v_mode in ('pilot','live') and coalesce((payload ->> 'killSwitchEnabled')::boolean,true) then raise exception 'P5 execution cannot be enabled while its kill switch is on.' using errcode='22023'; end if;
  select record_id,revision+1 into v_record,v_revision from public.conveyancer_document_pipeline_controls where organisation_id=v_org and attorney_firm_id=v_firm order by revision desc limit 1;
  insert into public.conveyancer_document_pipeline_controls(record_id,revision,organisation_id,attorney_firm_id,mode,allowed_operations,allowed_adapters,pilot_transaction_ids,kill_switch_enabled,reason,fingerprint,created_by)
  values(coalesce(v_record,gen_random_uuid()),coalesce(v_revision,1),v_org,v_firm,v_mode,v_operations,v_adapters,v_pilot,coalesce((payload ->> 'killSwitchEnabled')::boolean,true),v_reason,v_fingerprint,v_user) returning * into v_row;
  return jsonb_build_object('ok',true,'id',v_row.id,'recordId',v_row.record_id,'revision',v_row.revision,'mode',v_row.mode,'killSwitchEnabled',v_row.kill_switch_enabled);
end $$;

create or replace function public.bridge_enqueue_conveyancer_document_job(payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user uuid:=auth.uid(); v_org uuid; v_firm uuid; v_transaction uuid; v_control public.conveyancer_document_pipeline_controls%rowtype;
  v_existing public.conveyancer_document_jobs%rowtype; v_job uuid; v_operation text:=lower(trim(coalesce(payload ->> 'operation',''))); v_adapter text:=lower(trim(coalesce(payload ->> 'adapter','')));
  v_command text:=trim(coalesce(payload ->> 'commandId','')); v_fingerprint text:=trim(coalesce(payload ->> 'fingerprint','')); v_role text;
begin
  if v_user is null then raise exception 'Authentication is required.' using errcode='42501'; end if;
  begin v_org:=(payload ->> 'organisationId')::uuid; v_firm:=(payload ->> 'attorneyFirmId')::uuid; v_transaction:=(payload ->> 'transactionId')::uuid;
  exception when invalid_text_representation then raise exception 'P5 job identity is invalid.' using errcode='22023'; end;
  if coalesce(payload ->> 'version','')<>'conveyancer_document_pipeline_p5_v1' or v_command='' or length(v_fingerprint)<8 or octet_length(payload::text)>32768 then raise exception 'P5 job provenance is invalid.' using errcode='22023'; end if;
  if payload::text ~* '"(content|html|documentBytes|fileBytes|signingLink|accessToken|secret)"[[:space:]]*:' then raise exception 'P5 jobs may contain references only, never document bytes, links or secrets.' using errcode='22023'; end if;
  if not public.bridge_conveyancer_can_access_record(v_org,v_firm,v_transaction) then raise exception 'P5 matter access denied.' using errcode='42501'; end if;
  select role into v_role from public.attorney_firm_members where firm_id=v_firm and user_id=v_user and status='active';
  if v_role not in ('firm_admin','director_partner','transfer_attorney','conveyancing_secretary') then raise exception 'P5 document authority is required.' using errcode='42501'; end if;
  select * into v_existing from public.conveyancer_document_jobs where attorney_firm_id=v_firm and command_id=v_command;
  if found then
    if v_existing.command_fingerprint<>v_fingerprint then raise exception 'P5 command idempotency conflict.' using errcode='23505'; end if;
    return jsonb_build_object('ok',true,'duplicate',true,'jobId',v_existing.id,'status',v_existing.status);
  end if;
  select * into v_control from public.conveyancer_document_pipeline_controls where organisation_id=v_org and attorney_firm_id=v_firm order by revision desc limit 1;
  if not found or v_control.mode not in ('pilot','live') or v_control.kill_switch_enabled or not (v_operation=any(v_control.allowed_operations)) or not (v_adapter=any(v_control.allowed_adapters)) or (v_control.mode='pilot' and not (v_transaction=any(v_control.pilot_transaction_ids))) then raise exception 'P5 document execution is disabled for this command.' using errcode='42501'; end if;
  if v_operation='send_for_signing' and not exists(
    select 1 from public.conveyancer_document_artifacts artifact
    where artifact.id::text=(payload -> 'source' ->> 'artifactId') and artifact.organisation_id=v_org and artifact.attorney_firm_id=v_firm and artifact.transaction_id=v_transaction and artifact.lifecycle_status in ('generated','approved','issued')
  ) then raise exception 'P5 signing source artifact binding is invalid.' using errcode='22023'; end if;
  if v_operation='finalise_signed_pack' and (
    not exists(select 1 from public.conveyancer_signing_records signing where signing.id::text=(payload -> 'source' ->> 'signingRecordId') and signing.organisation_id=v_org and signing.attorney_firm_id=v_firm and signing.transaction_id=v_transaction)
    or not exists(select 1 from public.conveyancer_signing_provider_events event where (event.id::text=(payload -> 'source' ->> 'providerEventId') or event.provider_event_id=(payload -> 'source' ->> 'providerEventId')) and event.organisation_id=v_org and event.attorney_firm_id=v_firm and event.transaction_id=v_transaction and event.signature_verified)
  ) then raise exception 'P5 signed-pack provider evidence binding is invalid.' using errcode='22023'; end if;
  insert into public.conveyancer_document_jobs(organisation_id,attorney_firm_id,transaction_id,control_id,command_id,operation,adapter,document_type,command_fingerprint,command_payload,created_by)
  values(v_org,v_firm,v_transaction,v_control.id,v_command,v_operation,v_adapter,lower(trim(payload ->> 'documentType')),v_fingerprint,payload,v_user) returning id into v_job;
  return jsonb_build_object('ok',true,'duplicate',false,'jobId',v_job,'status','queued');
end $$;

create or replace function public.bridge_claim_conveyancer_document_job(p_job_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_user uuid:=auth.uid(); v_job public.conveyancer_document_jobs%rowtype; v_control public.conveyancer_document_pipeline_controls%rowtype;
begin
  if v_user is null then raise exception 'Authentication is required.' using errcode='42501'; end if;
  select * into v_job from public.conveyancer_document_jobs where id=p_job_id for update;
  if not found or not public.bridge_conveyancer_can_access_record(v_job.organisation_id,v_job.attorney_firm_id,v_job.transaction_id) then raise exception 'P5 job access denied.' using errcode='42501'; end if;
  if v_job.status='processing' and v_job.claimed_by=v_user then return jsonb_build_object('ok',true,'jobId',v_job.id,'command',v_job.command_payload); end if;
  if v_job.status<>'queued' then raise exception 'P5 job is not claimable.' using errcode='55000'; end if;
  select * into v_control from public.conveyancer_document_pipeline_controls where organisation_id=v_job.organisation_id and attorney_firm_id=v_job.attorney_firm_id order by revision desc limit 1;
  if not found or v_control.kill_switch_enabled or v_control.mode not in ('pilot','live') then raise exception 'P5 execution is paused.' using errcode='42501'; end if;
  update public.conveyancer_document_jobs set status='processing',claimed_by=v_user,claimed_at=now(),updated_at=now() where id=v_job.id;
  return jsonb_build_object('ok',true,'jobId',v_job.id,'command',v_job.command_payload);
end $$;

create or replace function public.bridge_complete_conveyancer_document_job(p_job_id uuid,payload jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_user uuid:=auth.uid(); v_job public.conveyancer_document_jobs%rowtype; v_result jsonb:=coalesce(payload -> 'result','{}'::jsonb);
  v_artifact uuid; v_signing uuid; v_record uuid; v_revision integer; v_error text:=trim(coalesce(payload ->> 'error',''));
begin
  if v_user is null then raise exception 'Authentication is required.' using errcode='42501'; end if;
  select * into v_job from public.conveyancer_document_jobs where id=p_job_id for update;
  if not found or v_job.status<>'processing' or v_job.claimed_by<>v_user then raise exception 'P5 job completion authority is invalid.' using errcode='42501'; end if;
  if coalesce(payload ->> 'version','')<>'conveyancer_document_pipeline_p5_v1' or coalesce(payload ->> 'commandId','')<>v_job.command_id then raise exception 'P5 completion provenance is invalid.' using errcode='22023'; end if;
  if v_error<>'' then
    update public.conveyancer_document_jobs set status='failed',result_payload=payload,last_error=left(v_error,500),completed_at=now(),updated_at=now() where id=v_job.id;
    return jsonb_build_object('ok',false,'jobId',v_job.id,'status','failed');
  end if;
  if length(trim(coalesce(payload ->> 'resultFingerprint','')))<8 or jsonb_typeof(v_result)<>'object' then raise exception 'P5 result evidence is invalid.' using errcode='22023'; end if;
  if v_job.operation in ('render','manual_upload','finalise_signed_pack') then
    if coalesce(v_result -> 'artifact' ->> 'bucket','')='' or coalesce(v_result -> 'artifact' ->> 'path','')='' or length(trim(coalesce(v_result -> 'artifact' ->> 'contentHash','')))<8 then raise exception 'P5 artifact object evidence is incomplete.' using errcode='22023'; end if;
    insert into public.conveyancer_document_artifacts(organisation_id,attorney_firm_id,transaction_id,document_type,lifecycle_status,template_reference,object_bucket,object_path,content_hash,mime_type,source_phase,contract_version,fingerprint,payload,created_by)
    values(v_job.organisation_id,v_job.attorney_firm_id,v_job.transaction_id,v_job.document_type,case when v_job.operation='finalise_signed_pack' then 'signed' when v_job.operation='manual_upload' then 'under_review' else 'generated' end,
      nullif(v_job.command_payload -> 'source' ->> 'templateReference',''),v_result -> 'artifact' ->> 'bucket',v_result -> 'artifact' ->> 'path',v_result -> 'artifact' ->> 'contentHash',coalesce(nullif(v_result -> 'artifact' ->> 'mimeType',''),'application/pdf'),
      case when v_job.operation='render' then 'C6' else 'C7' end,'conveyancer_document_pipeline_p5_v1',payload ->> 'resultFingerprint',jsonb_build_object('jobId',v_job.id,'providerReference',v_result ->> 'providerReference','sourceDocumentId',v_job.command_payload -> 'source' ->> 'documentId'),v_user) returning id into v_artifact;
  end if;
  if v_job.operation='send_for_signing' then
    insert into public.conveyancer_signing_records(organisation_id,attorney_firm_id,transaction_id,signing_status,signing_provider_reference,source_phase,contract_version,fingerprint,payload,created_by)
    values(v_job.organisation_id,v_job.attorney_firm_id,v_job.transaction_id,'in_progress',v_result ->> 'signingProviderReference','D2','conveyancer_document_pipeline_p5_v1',payload ->> 'resultFingerprint',jsonb_build_object('jobId',v_job.id,'sourceArtifactId',v_job.command_payload -> 'source' ->> 'artifactId','signingPlanFingerprint',v_job.command_payload -> 'signing' ->> 'planFingerprint','expiresAt',v_result ->> 'expiresAt'),v_user) returning id into v_signing;
  elsif v_job.operation='finalise_signed_pack' then
    begin v_signing:=(v_job.command_payload -> 'source' ->> 'signingRecordId')::uuid; exception when invalid_text_representation then raise exception 'P5 signing record binding is invalid.' using errcode='22023'; end;
    select record_id,revision+1 into v_record,v_revision from public.conveyancer_signing_records where id=v_signing and organisation_id=v_job.organisation_id and attorney_firm_id=v_job.attorney_firm_id and transaction_id=v_job.transaction_id;
    if not found then raise exception 'P5 signing record binding is invalid.' using errcode='22023'; end if;
    insert into public.conveyancer_signing_records(record_id,revision,organisation_id,attorney_firm_id,transaction_id,signing_status,signing_provider_reference,signed_pack_artifact_id,source_phase,contract_version,fingerprint,payload,created_by)
    values(v_record,v_revision,v_job.organisation_id,v_job.attorney_firm_id,v_job.transaction_id,'signed_pack_received',v_result ->> 'signingProviderReference',v_artifact,'D4','conveyancer_document_pipeline_p5_v1',payload ->> 'resultFingerprint',jsonb_build_object('jobId',v_job.id,'providerEventId',v_job.command_payload -> 'source' ->> 'providerEventId','completionCertificateReference',v_result ->> 'completionCertificateReference','humanReviewRequired',true),v_user) returning id into v_signing;
  end if;
  update public.conveyancer_document_jobs set status='succeeded',result_payload=payload,completed_at=now(),updated_at=now() where id=v_job.id;
  return jsonb_build_object('ok',true,'jobId',v_job.id,'status','succeeded','artifactId',v_artifact,'signingRecordId',v_signing);
end $$;

create or replace function public.bridge_record_conveyancer_signing_provider_event(payload jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_org uuid; v_firm uuid; v_transaction uuid; v_id uuid; v_existing uuid;
begin
  begin v_org:=(payload ->> 'organisationId')::uuid; v_firm:=(payload ->> 'attorneyFirmId')::uuid; v_transaction:=(payload ->> 'transactionId')::uuid;
  exception when invalid_text_representation then raise exception 'P5 provider event binding is invalid.' using errcode='22023'; end;
  if coalesce(payload ->> 'providerKey','')='' or coalesce(payload ->> 'providerEventId','')='' or coalesce(payload ->> 'eventType','')='' or length(trim(coalesce(payload ->> 'payloadHash','')))<8 or coalesce((payload ->> 'signatureVerified')::boolean,false)=false then raise exception 'P5 provider event signature or provenance is invalid.' using errcode='22023'; end if;
  if not exists(select 1 from public.attorney_firms where id=v_firm and organisation_id=v_org and is_active) or not exists(select 1 from public.transactions where id=v_transaction and organisation_id=v_org) then raise exception 'P5 provider event tenant binding is invalid.' using errcode='22023'; end if;
  select id into v_existing from public.conveyancer_signing_provider_events where attorney_firm_id=v_firm and provider_key=lower(payload ->> 'providerKey') and provider_event_id=payload ->> 'providerEventId';
  if v_existing is not null then return jsonb_build_object('ok',true,'duplicate',true,'eventId',v_existing); end if;
  insert into public.conveyancer_signing_provider_events(organisation_id,attorney_firm_id,transaction_id,provider_key,provider_event_id,event_type,signature_verified,payload_hash,object_bucket,object_path,metadata)
  values(v_org,v_firm,v_transaction,lower(payload ->> 'providerKey'),payload ->> 'providerEventId',lower(payload ->> 'eventType'),true,payload ->> 'payloadHash',nullif(payload ->> 'objectBucket',''),nullif(payload ->> 'objectPath',''),coalesce(payload -> 'metadata','{}'::jsonb)) returning id into v_id;
  return jsonb_build_object('ok',true,'duplicate',false,'eventId',v_id,'reviewRequired',true);
end $$;

revoke all on function public.bridge_set_conveyancer_document_pipeline_control(jsonb) from public,anon,authenticated,service_role;
revoke all on function public.bridge_enqueue_conveyancer_document_job(jsonb) from public,anon,authenticated,service_role;
revoke all on function public.bridge_claim_conveyancer_document_job(uuid) from public,anon,authenticated,service_role;
revoke all on function public.bridge_complete_conveyancer_document_job(uuid,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.bridge_record_conveyancer_signing_provider_event(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.bridge_set_conveyancer_document_pipeline_control(jsonb) to authenticated;
grant execute on function public.bridge_enqueue_conveyancer_document_job(jsonb) to authenticated;
grant execute on function public.bridge_claim_conveyancer_document_job(uuid) to authenticated;
grant execute on function public.bridge_complete_conveyancer_document_job(uuid,jsonb) to authenticated;
grant execute on function public.bridge_record_conveyancer_signing_provider_event(jsonb) to service_role;

comment on table public.conveyancer_document_jobs is 'P5 reference-only document render/sign work. Document bytes and signing links are forbidden from command payloads.';
comment on table public.conveyancer_signing_provider_events is 'P5 verified provider callbacks retained as evidence requiring human signed-pack review.';
notify pgrst,'reload schema';
commit;
