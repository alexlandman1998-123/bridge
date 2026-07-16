begin;

create or replace function public.bridge_conveyancer_p6_capabilities_valid(values_to_check text[])
returns boolean language sql immutable set search_path=public as $$
  select coalesce(values_to_check,'{}'::text[]) <@ array[
    'receive_bank_instruction','receive_bank_conditions','receive_bank_approval','receive_cancellation_figures','receive_guarantee','submit_bank_pack','submit_guarantee',
    'receive_deeds_event','submit_deeds_lodgement','request_signature','receive_signing_event','send_document','receive_document','send_message','sync_calendar','receive_registry_event',
    'receive_practice_snapshot','sync_practice_workspace','link_practice_matter','receive_trust_ledger_snapshot','prepare_trust_posting','link_trust_account',
    'receive_transfer_duty_outcome','submit_transfer_duty_declaration','submit_transfer_duty_supporting_documents','manage_transfer_duty_declaration',
    'receive_property_clearance_outcome','request_property_clearance_figures','submit_property_clearance_payment_evidence','manage_property_clearance_request',
    'request_bank_guarantee','manage_bank_guarantee','request_cancellation_figures','submit_registration_advice','receive_guarantee_settlement'
  ]::text[]
$$;

create table if not exists public.conveyancer_provider_runtime_controls (
  id uuid primary key default gen_random_uuid(), record_id uuid not null default gen_random_uuid(), revision integer not null check (revision > 0),
  organisation_id uuid not null references public.organisations(id) on delete restrict,
  attorney_firm_id uuid not null references public.attorney_firms(id) on delete restrict,
  mode text not null check (mode in ('disabled','observe','pilot','live')),
  allowed_adapters text[] not null default array['manual']::text[], allowed_capabilities text[] not null default '{}'::text[],
  pilot_transaction_ids uuid[] not null default '{}'::uuid[], kill_switch_enabled boolean not null default true,
  failure_threshold integer not null default 5 check (failure_threshold between 1 and 20),
  cooldown_seconds integer not null default 900 check (cooldown_seconds between 30 and 86400),
  timeout_ms integer not null default 15000 check (timeout_ms between 1000 and 60000),
  reason text not null check (length(trim(reason)) > 0), contract_version text not null default 'conveyancer_provider_runtime_p6_v1',
  fingerprint text not null check (length(trim(fingerprint)) >= 8), created_by uuid not null, created_at timestamptz not null default now(),
  unique(record_id,revision), unique(id,organisation_id,attorney_firm_id),
  check (allowed_adapters <@ array['manual','generic_http']::text[]), check (public.bridge_conveyancer_p6_capabilities_valid(allowed_capabilities))
);

create table if not exists public.conveyancer_provider_health_events (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null references public.organisations(id) on delete restrict,
  attorney_firm_id uuid not null references public.attorney_firms(id) on delete restrict,
  transaction_id uuid references public.transactions(id) on delete restrict,
  integration_profile_id uuid not null, operation_id text not null, provider_key text not null, adapter_key text not null,
  outcome text not null check (outcome in ('verified','succeeded','failed','timed_out','manual_fallback','circuit_opened','circuit_closed')),
  circuit_state text not null check (circuit_state in ('closed','open','half_open')),
  consecutive_failures integer not null default 0 check (consecutive_failures >= 0),
  error_code text, provider_reference text, response_hash text, duration_ms integer check (duration_ms is null or duration_ms >= 0),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata)='object' and octet_length(metadata::text) <= 8192),
  contract_version text not null default 'conveyancer_provider_runtime_p6_v1', occurred_at timestamptz not null default now(), created_by uuid,
  unique(attorney_firm_id,operation_id,outcome),
  foreign key(integration_profile_id,organisation_id,attorney_firm_id) references public.conveyancer_integration_profiles(id,organisation_id,attorney_firm_id) on delete restrict
);

create index if not exists conveyancer_provider_controls_scope_idx on public.conveyancer_provider_runtime_controls(organisation_id,attorney_firm_id,revision desc);
create index if not exists conveyancer_provider_health_scope_idx on public.conveyancer_provider_health_events(organisation_id,attorney_firm_id,provider_key,occurred_at desc);
alter table public.conveyancer_provider_runtime_controls enable row level security;
alter table public.conveyancer_provider_health_events enable row level security;
create policy conveyancer_provider_controls_select_scoped on public.conveyancer_provider_runtime_controls for select to authenticated using (public.bridge_conveyancer_can_access_record(organisation_id,attorney_firm_id,null::uuid));
create policy conveyancer_provider_health_select_scoped on public.conveyancer_provider_health_events for select to authenticated using (public.bridge_conveyancer_can_access_record(organisation_id,attorney_firm_id,transaction_id));
revoke all on public.conveyancer_provider_runtime_controls,public.conveyancer_provider_health_events from anon,authenticated,service_role;
grant select on public.conveyancer_provider_runtime_controls,public.conveyancer_provider_health_events to authenticated,service_role;
drop trigger if exists conveyancer_provider_controls_immutable on public.conveyancer_provider_runtime_controls;
create trigger conveyancer_provider_controls_immutable before update or delete on public.conveyancer_provider_runtime_controls for each row execute function public.bridge_conveyancer_reject_mutation();
drop trigger if exists conveyancer_provider_health_immutable on public.conveyancer_provider_health_events;
create trigger conveyancer_provider_health_immutable before update or delete on public.conveyancer_provider_health_events for each row execute function public.bridge_conveyancer_reject_mutation();
drop trigger if exists conveyancer_provider_controls_audit on public.conveyancer_provider_runtime_controls;
create trigger conveyancer_provider_controls_audit after insert on public.conveyancer_provider_runtime_controls for each row execute function public.bridge_conveyancer_capture_insert_audit();

create or replace function public.bridge_set_conveyancer_provider_runtime_control(payload jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_user uuid:=auth.uid(); v_org uuid; v_firm uuid; v_record uuid; v_revision integer; v_pilot uuid[]; v_adapters text[]; v_capabilities text[]; v_row public.conveyancer_provider_runtime_controls%rowtype;
begin
  if v_user is null then raise exception 'Authentication is required.' using errcode='42501'; end if;
  begin v_org:=(payload ->> 'organisationId')::uuid; v_firm:=(payload ->> 'attorneyFirmId')::uuid; select coalesce(array_agg(distinct value::uuid),'{}'::uuid[]) into v_pilot from jsonb_array_elements_text(coalesce(payload -> 'pilotTransactionIds','[]'::jsonb)) items(value); exception when invalid_text_representation then raise exception 'P6 control identity is invalid.' using errcode='22023'; end;
  if not public.attorney_user_is_firm_admin(v_firm) then raise exception 'Firm administrator authority is required.' using errcode='42501'; end if;
  if not exists(select 1 from public.attorney_firms where id=v_firm and organisation_id=v_org and is_active) then raise exception 'P6 firm binding is invalid.' using errcode='22023'; end if;
  select coalesce(array_agg(distinct lower(trim(value))),array['manual']::text[]) into v_adapters from jsonb_array_elements_text(coalesce(payload -> 'allowedAdapters','["manual"]'::jsonb)) items(value);
  select coalesce(array_agg(distinct lower(trim(value))),'{}'::text[]) into v_capabilities from jsonb_array_elements_text(coalesce(payload -> 'allowedCapabilities','[]'::jsonb)) items(value);
  if coalesce(payload ->> 'version','')<>'conveyancer_provider_runtime_p6_v1' or lower(payload ->> 'mode') not in ('disabled','observe','pilot','live') or trim(coalesce(payload ->> 'reason',''))='' or length(trim(coalesce(payload ->> 'fingerprint','')))<8 or not (v_adapters <@ array['manual','generic_http']::text[]) then raise exception 'P6 control is invalid.' using errcode='22023'; end if;
  if lower(payload ->> 'mode')='pilot' and cardinality(v_pilot)=0 then raise exception 'P6 pilot mode requires an exact transaction cohort.' using errcode='22023'; end if;
  if lower(payload ->> 'mode') in ('pilot','live') and coalesce((payload ->> 'killSwitchEnabled')::boolean,true) then raise exception 'P6 execution cannot be enabled while its kill switch is on.' using errcode='22023'; end if;
  select record_id,revision+1 into v_record,v_revision from public.conveyancer_provider_runtime_controls where organisation_id=v_org and attorney_firm_id=v_firm order by revision desc limit 1;
  insert into public.conveyancer_provider_runtime_controls(record_id,revision,organisation_id,attorney_firm_id,mode,allowed_adapters,allowed_capabilities,pilot_transaction_ids,kill_switch_enabled,failure_threshold,cooldown_seconds,timeout_ms,reason,fingerprint,created_by)
  values(coalesce(v_record,gen_random_uuid()),coalesce(v_revision,1),v_org,v_firm,lower(payload ->> 'mode'),v_adapters,v_capabilities,v_pilot,coalesce((payload ->> 'killSwitchEnabled')::boolean,true),coalesce((payload ->> 'failureThreshold')::integer,5),coalesce((payload ->> 'cooldownSeconds')::integer,900),coalesce((payload ->> 'timeoutMs')::integer,15000),trim(payload ->> 'reason'),payload ->> 'fingerprint',v_user) returning * into v_row;
  return jsonb_build_object('ok',true,'id',v_row.id,'recordId',v_row.record_id,'revision',v_row.revision,'mode',v_row.mode,'killSwitchEnabled',v_row.kill_switch_enabled);
end $$;

create or replace function public.bridge_set_conveyancer_provider_profile(payload jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_user uuid:=auth.uid(); v_org uuid; v_firm uuid; v_profile uuid; v_record uuid; v_revision integer; v_capabilities text[]; v_lanes text[]; v_adapter text:=lower(trim(coalesce(payload ->> 'adapterKey',''))); v_status text:=lower(trim(coalesce(payload ->> 'status','draft'))); v_secret text:=trim(coalesce(payload ->> 'secretReference','')); v_row public.conveyancer_integration_profiles%rowtype;
begin
  if v_user is null then raise exception 'Authentication is required.' using errcode='42501'; end if;
  begin v_org:=(payload ->> 'organisationId')::uuid; v_firm:=(payload ->> 'attorneyFirmId')::uuid; v_profile:=(payload ->> 'profileId')::uuid; exception when invalid_text_representation then raise exception 'P6 profile identity is invalid.' using errcode='22023'; end;
  if not public.attorney_user_is_firm_admin(v_firm) then raise exception 'Firm administrator authority is required.' using errcode='42501'; end if;
  if not exists(select 1 from public.attorney_firms where id=v_firm and organisation_id=v_org and is_active) then raise exception 'P6 profile firm binding is invalid.' using errcode='22023'; end if;
  select coalesce(array_agg(distinct lower(trim(value))),'{}'::text[]) into v_capabilities from jsonb_array_elements_text(coalesce(payload -> 'capabilities','[]'::jsonb)) items(value);
  select coalesce(array_agg(distinct lower(trim(value))),'{}'::text[]) into v_lanes from jsonb_array_elements_text(coalesce(payload -> 'allowedLanes','[]'::jsonb)) items(value);
  if coalesce(payload ->> 'version','')<>'conveyancer_provider_runtime_p6_v1' or v_adapter not in ('manual','generic_http') or v_status not in ('draft','manual','sandbox','active','paused','disabled') or coalesce(payload ->> 'providerKey','')='' or length(trim(coalesce(payload ->> 'fingerprint','')))<8 or payload::text ~* '"(api.?key|access.?token|refresh.?token|password|private.?key|client.?secret)"[[:space:]]*:' then raise exception 'P6 profile is invalid or contains raw credential material.' using errcode='22023'; end if;
  if cardinality(v_capabilities)=0 or not public.bridge_conveyancer_p6_capabilities_valid(v_capabilities) or not (v_lanes <@ array['transfer','bond','cancellation','external']::text[]) or lower(coalesce(payload ->> 'environment','')) not in ('sandbox','production') then raise exception 'P6 profile capability, lane or environment is invalid.' using errcode='22023'; end if;
  if v_adapter='generic_http' and (v_secret !~ '^(env://[A-Z][A-Z0-9_]{2,127}|vault://[a-zA-Z0-9._:/-]{8,256})$' or coalesce(payload ->> 'allowedOrigin','') !~ '^https://[^/]+$' or jsonb_typeof(payload -> 'operationPaths')<>'object' or payload -> 'operationPaths'='{}'::jsonb or lower(coalesce(payload -> 'authentication' ->> 'type','bearer')) not in ('bearer','api_key_header') or coalesce(payload -> 'authentication' ->> 'headerName','Authorization') !~ '^[A-Za-z0-9-]{1,64}$') then raise exception 'P6 live profiles require a credential reference and exact HTTPS origin.' using errcode='22023'; end if;
  select record_id,revision+1 into v_record,v_revision from public.conveyancer_integration_profiles where id=v_profile and organisation_id=v_org and attorney_firm_id=v_firm;
  insert into public.conveyancer_integration_profiles(id,record_id,revision,organisation_id,attorney_firm_id,provider_key,adapter_key,profile_status,secret_reference,source_phase,contract_version,fingerprint,payload,created_by)
  values(case when v_record is null then v_profile else gen_random_uuid() end,coalesce(v_record,v_profile),coalesce(v_revision,1),v_org,v_firm,lower(payload ->> 'providerKey'),v_adapter,v_status,nullif(v_secret,''),'P6','conveyancer_provider_runtime_p6_v1',payload ->> 'fingerprint',payload-'secretReference',v_user) returning * into v_row;
  return jsonb_build_object('ok',true,'id',v_row.id,'recordId',v_row.record_id,'revision',v_row.revision,'status',v_row.profile_status);
end $$;

create or replace function public.bridge_record_conveyancer_provider_health(payload jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_org uuid; v_firm uuid; v_transaction uuid; v_profile uuid; v_id uuid; v_existing uuid;
begin
  begin v_org:=(payload ->> 'organisationId')::uuid; v_firm:=(payload ->> 'attorneyFirmId')::uuid; v_profile:=(payload ->> 'profileId')::uuid; v_transaction:=nullif(payload ->> 'transactionId','')::uuid; exception when invalid_text_representation then raise exception 'P6 health binding is invalid.' using errcode='22023'; end;
  if coalesce(payload ->> 'version','')<>'conveyancer_provider_runtime_p6_v1' or coalesce(payload ->> 'operationId','')='' or lower(payload ->> 'outcome') not in ('verified','succeeded','failed','timed_out','manual_fallback','circuit_opened','circuit_closed') or lower(payload ->> 'circuitState') not in ('closed','open','half_open') or payload::text ~* '"(payload|body|credential|secret|access.?token|api.?key)"[[:space:]]*:' then raise exception 'P6 health evidence must be minimal and secret-free.' using errcode='22023'; end if;
  if not exists(select 1 from public.conveyancer_integration_profiles where id=v_profile and organisation_id=v_org and attorney_firm_id=v_firm and source_phase='P6') then raise exception 'P6 profile binding is invalid.' using errcode='22023'; end if;
  select id into v_existing from public.conveyancer_provider_health_events where attorney_firm_id=v_firm and operation_id=payload ->> 'operationId' and outcome=lower(payload ->> 'outcome');
  if v_existing is not null then return jsonb_build_object('ok',true,'duplicate',true,'eventId',v_existing); end if;
  insert into public.conveyancer_provider_health_events(organisation_id,attorney_firm_id,transaction_id,integration_profile_id,operation_id,provider_key,adapter_key,outcome,circuit_state,consecutive_failures,error_code,provider_reference,response_hash,duration_ms,metadata)
  values(v_org,v_firm,v_transaction,v_profile,payload ->> 'operationId',lower(payload ->> 'providerKey'),lower(payload ->> 'adapterKey'),lower(payload ->> 'outcome'),lower(payload ->> 'circuitState'),coalesce((payload ->> 'consecutiveFailures')::integer,0),nullif(payload ->> 'errorCode',''),nullif(payload ->> 'providerReference',''),nullif(payload ->> 'responseHash',''),nullif(payload ->> 'durationMs','')::integer,coalesce(payload -> 'metadata','{}'::jsonb)) returning id into v_id;
  return jsonb_build_object('ok',true,'duplicate',false,'eventId',v_id);
end $$;

revoke all on function public.bridge_set_conveyancer_provider_runtime_control(jsonb) from public,anon,authenticated,service_role;
revoke all on function public.bridge_set_conveyancer_provider_profile(jsonb) from public,anon,authenticated,service_role;
revoke all on function public.bridge_record_conveyancer_provider_health(jsonb) from public,anon,authenticated,service_role;
revoke all on function public.bridge_conveyancer_p6_capabilities_valid(text[]) from public,anon,authenticated,service_role;
grant execute on function public.bridge_set_conveyancer_provider_runtime_control(jsonb) to authenticated;
grant execute on function public.bridge_set_conveyancer_provider_profile(jsonb) to authenticated;
grant execute on function public.bridge_record_conveyancer_provider_health(jsonb) to service_role;
comment on table public.conveyancer_provider_runtime_controls is 'P6 fail-closed provider activation, exact pilot scope, timeout and circuit-breaker policy.';
comment on table public.conveyancer_provider_health_events is 'P6 append-only, secret-free live adapter outcomes. Payload processing and durable retries are reserved for P7.';
notify pgrst,'reload schema';
commit;
