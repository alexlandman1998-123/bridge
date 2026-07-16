-- H2 application orchestration: guarded, idempotent persistence for runtime records.

begin;

create table if not exists public.conveyancer_application_receipts (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete restrict,
  attorney_firm_id uuid not null references public.attorney_firms(id) on delete restrict,
  transaction_id uuid not null references public.transactions(id) on delete restrict,
  event_id text not null,
  event_type text not null,
  source_reference text not null,
  input_fingerprint text not null check (length(trim(input_fingerprint)) >= 8),
  output_fingerprint text not null check (length(trim(output_fingerprint)) >= 8),
  command_results jsonb not null default '[]'::jsonb check (jsonb_typeof(command_results) = 'array'),
  actor_user_id uuid not null,
  occurred_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (attorney_firm_id, event_id)
);

alter table public.conveyancer_application_receipts enable row level security;
create policy conveyancer_application_receipts_select_scoped
on public.conveyancer_application_receipts for select to authenticated
using (public.bridge_conveyancer_can_access_record(organisation_id, attorney_firm_id, transaction_id));
revoke all on public.conveyancer_application_receipts from anon, authenticated, service_role;
grant select on public.conveyancer_application_receipts to authenticated, service_role;
create trigger conveyancer_application_receipts_immutable before update or delete on public.conveyancer_application_receipts for each row execute function public.bridge_conveyancer_reject_mutation();
create trigger conveyancer_application_receipts_audit_insert after insert on public.conveyancer_application_receipts for each row execute function public.bridge_conveyancer_capture_insert_audit();

create or replace function public.bridge_apply_conveyancer_application_batch(payload jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_user uuid:=auth.uid(); v_org uuid; v_firm uuid; v_tx uuid; v_at timestamptz;
  v_event text:=trim(coalesce(payload->>'eventId','')); v_type text:=lower(trim(coalesce(payload->>'eventType',''))); v_control_type text;
  v_source text:=trim(coalesce(payload->>'sourceReference','')); v_input text:=trim(coalesce(payload->>'inputFingerprint',''));
  v_output text:=trim(coalesce(payload->>'outputFingerprint','')); v_command jsonb; v_kind text; v_id uuid; v_record uuid; v_results jsonb:='[]'::jsonb;
  v_control public.conveyancer_orchestration_controls%rowtype; v_existing public.conveyancer_application_receipts%rowtype;
begin
  if v_user is null then raise exception 'Authentication is required.' using errcode='42501'; end if;
  begin v_org:=(payload->>'organisationId')::uuid; v_firm:=(payload->>'attorneyFirmId')::uuid; v_tx:=(payload->>'transactionId')::uuid; v_at:=(payload->>'occurredAt')::timestamptz;
  exception when invalid_text_representation then raise exception 'H2 application identity is invalid.' using errcode='22023'; end;
  if v_event='' or v_type='' or v_source='' or length(v_input)<8 or length(v_output)<8 or jsonb_typeof(payload->'commands')<>'array' or jsonb_array_length(payload->'commands')>16 then raise exception 'H2 application provenance is incomplete.' using errcode='22023'; end if;
  if not public.bridge_conveyancer_can_access_record(v_org,v_firm,v_tx) then raise exception 'H2 matter access denied.' using errcode='42501'; end if;
  if not exists(select 1 from public.attorney_firm_members m where m.firm_id=v_firm and m.user_id=v_user and m.status='active' and m.role in('firm_admin','director_partner','transfer_attorney','secretary','accounts')) then raise exception 'H2 firm authority required.' using errcode='42501'; end if;
  select * into v_existing from public.conveyancer_application_receipts where attorney_firm_id=v_firm and event_id=v_event;
  if found then if v_existing.input_fingerprint<>v_input then raise exception 'H2 event idempotency conflict.' using errcode='23505'; end if; return jsonb_build_object('ok',true,'duplicate',true,'receiptId',v_existing.id,'commandResults',v_existing.command_results); end if;
  select * into v_control from public.conveyancer_orchestration_controls c where c.organisation_id=v_org and c.attorney_firm_id=v_firm order by c.revision desc limit 1;
  if not found or v_control.mode not in('pilot','live') or v_control.kill_switch_enabled or (v_control.mode='pilot' and not(v_tx=any(v_control.pilot_transaction_ids))) then raise exception 'H2 application writes are disabled.' using errcode='42501'; end if;
  v_control_type:=case v_type
    when 'matter_exception_observed' then 'external_evidence_received'
    when 'matter_coordination_recorded' then 'coordination_changed'
    when 'matter_evidence_captured' then 'external_evidence_received'
    when 'matter_financial_snapshot_recorded' then 'action_command_requested'
    when 'matter_closeout_assessed' then 'action_command_requested'
    else v_type end;
  if cardinality(v_control.allowed_event_types)>0 and not(v_type=any(v_control.allowed_event_types)) and not(v_control_type=any(v_control.allowed_event_types)) then raise exception 'H2 event type is disabled.' using errcode='42501'; end if;

  for v_command in select value from jsonb_array_elements(payload->'commands') loop
    v_kind:=lower(trim(coalesce(v_command->>'kind',''))); v_record:=coalesce(nullif(v_command->>'recordId','')::uuid,gen_random_uuid());
    if v_kind='exception_revision' then
      insert into public.conveyancer_exceptions(record_id,revision,organisation_id,attorney_firm_id,transaction_id,exception_code,status,severity,source_phase,contract_version,fingerprint,classification,retention_policy,legal_hold,payload,created_by)
      values(v_record,(v_command->>'revision')::integer,v_org,v_firm,v_tx,v_command->>'exceptionCode',v_command->>'exceptionStatus',v_command->>'severity',v_command->>'sourcePhase',v_command->>'contractVersion',v_command->>'fingerprint',coalesce(v_command->>'classification','privileged'),coalesce(v_command->>'retentionPolicy','legal_matter_record'),coalesce((v_command->>'legalHold')::boolean,false),v_command->'payload',v_user) returning id into v_id;
      insert into public.conveyancer_exception_events(organisation_id,attorney_firm_id,transaction_id,exception_id,event_type,reason,idempotency_key,source_phase,contract_version,fingerprint,payload,occurred_at,created_by)
      values(v_org,v_firm,v_tx,v_id,coalesce(v_command->>'eventType','activated'),v_command->>'eventReason',v_command->>'idempotencyKey',v_command->>'sourcePhase',v_command->>'contractVersion',v_command->>'fingerprint',v_command->'payload',v_at,v_user);
    elsif v_kind='coordination_revision' then
      insert into public.conveyancer_coordinations(record_id,revision,organisation_id,attorney_firm_id,transaction_id,coordination_status,transfer_firm_id,bond_firm_id,cancellation_firm_id,source_phase,contract_version,fingerprint,classification,retention_policy,legal_hold,payload,created_by)
      values(v_record,(v_command->>'revision')::integer,v_org,v_firm,v_tx,v_command->>'coordinationStatus',nullif(v_command->>'transferFirmId','')::uuid,nullif(v_command->>'bondFirmId','')::uuid,nullif(v_command->>'cancellationFirmId','')::uuid,v_command->>'sourcePhase',v_command->>'contractVersion',v_command->>'fingerprint',coalesce(v_command->>'classification','privileged'),coalesce(v_command->>'retentionPolicy','legal_matter_record'),coalesce((v_command->>'legalHold')::boolean,false),v_command->'payload',v_user) returning id into v_id;
    elsif v_kind='evidence_revision' then
      insert into public.conveyancer_evidence(record_id,revision,organisation_id,attorney_firm_id,transaction_id,evidence_type,evidence_status,source_system,object_bucket,object_path,content_hash,observed_at,expires_at,source_phase,contract_version,fingerprint,classification,retention_policy,legal_hold,payload,created_by)
      values(v_record,(v_command->>'revision')::integer,v_org,v_firm,v_tx,v_command->>'evidenceType',v_command->>'evidenceStatus',v_command->>'sourceSystem',nullif(v_command->>'objectBucket',''),nullif(v_command->>'objectPath',''),v_command->>'contentHash',(v_command->>'observedAt')::timestamptz,nullif(v_command->>'expiresAt','')::timestamptz,v_command->>'sourcePhase',v_command->>'contractVersion',v_command->>'fingerprint',coalesce(v_command->>'classification','privileged'),coalesce(v_command->>'retentionPolicy','legal_matter_record'),coalesce((v_command->>'legalHold')::boolean,false),v_command->'payload',v_user) returning id into v_id;
    elsif v_kind='financial_model_revision' then
      insert into public.conveyancer_financial_models(record_id,revision,organisation_id,attorney_firm_id,transaction_id,model_status,currency,source_phase,contract_version,fingerprint,classification,retention_policy,legal_hold,payload,created_by)
      values(v_record,(v_command->>'revision')::integer,v_org,v_firm,v_tx,v_command->>'modelStatus',v_command->>'currency',v_command->>'sourcePhase',v_command->>'contractVersion',v_command->>'fingerprint','restricted','legal_financial_record',coalesce((v_command->>'legalHold')::boolean,false),v_command->'payload',v_user) returning id into v_id;
    else raise exception 'Unsupported H2 command: %',v_kind using errcode='22023'; end if;
    v_results:=v_results||jsonb_build_array(jsonb_build_object('kind',v_kind,'id',v_id,'recordId',v_record,'revision',(v_command->>'revision')::integer));
  end loop;
  insert into public.conveyancer_application_receipts(organisation_id,attorney_firm_id,transaction_id,event_id,event_type,source_reference,input_fingerprint,output_fingerprint,command_results,actor_user_id,occurred_at)
  values(v_org,v_firm,v_tx,v_event,v_type,v_source,v_input,v_output,v_results,v_user,v_at) returning id into v_id;
  return jsonb_build_object('ok',true,'duplicate',false,'receiptId',v_id,'commandResults',v_results);
end $$;

revoke all on function public.bridge_apply_conveyancer_application_batch(jsonb) from public;
grant execute on function public.bridge_apply_conveyancer_application_batch(jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
