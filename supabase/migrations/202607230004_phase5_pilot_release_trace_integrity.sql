begin;

-- Phase 4 authorises a narrowly-scoped release through runtime secrets. Those
-- secrets are deliberately not copied into browser-owned packet events, so
-- Phase 5 needs a server-owned, append-only ledger that binds each exercised
-- legal artifact to the exact activation-plan digest that authorised it.
create table if not exists public.legal_document_pilot_release_bindings_phase5 (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete restrict,
  packet_id uuid not null references public.document_packets(id) on delete restrict,
  generated_document_id uuid not null references public.documents(id) on delete restrict,
  packet_type text not null check (packet_type in ('mandate', 'otp')),
  activation_plan_digest text not null check (activation_plan_digest ~ '^sha256:[0-9a-f]{64}$'),
  release_contract text not null check (release_contract = 'legal-document-pilot-release-v1'),
  generated_artifact_sha256 text not null check (generated_artifact_sha256 ~ '^sha256:[0-9a-f]{64}$'),
  generated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (packet_id, generated_document_id)
);

create index if not exists legal_document_pilot_release_bindings_phase5_packet_idx
  on public.legal_document_pilot_release_bindings_phase5 (packet_id, generated_at desc);

create table if not exists public.legal_document_pilot_lifecycle_traces_phase5 (
  id uuid primary key default gen_random_uuid(),
  binding_id uuid not null references public.legal_document_pilot_release_bindings_phase5(id) on delete restrict,
  organisation_id uuid not null references public.organisations(id) on delete restrict,
  packet_id uuid not null references public.document_packets(id) on delete restrict,
  packet_version_id uuid not null references public.document_packet_versions(id) on delete restrict,
  packet_type text not null check (packet_type in ('mandate', 'otp')),
  activation_plan_digest text not null check (activation_plan_digest ~ '^sha256:[0-9a-f]{64}$'),
  release_contract text not null check (release_contract = 'legal-document-pilot-release-v1'),
  trace_contract text not null check (trace_contract = 'legal-document-pilot-lifecycle-trace-v1'),
  stage text not null check (stage in ('signing_invite_delivered', 'final_delivery_completed', 'final_access_authorized')),
  access_context text check (access_context is null or access_context in ('client_portal', 'seller_portal', 'workspace', 'signer')),
  artifact_sha256 text check (artifact_sha256 is null or artifact_sha256 ~ '^sha256:[0-9a-f]{64}$'),
  observed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (binding_id, packet_version_id, stage)
);

create index if not exists legal_document_pilot_lifecycle_traces_phase5_packet_idx
  on public.legal_document_pilot_lifecycle_traces_phase5 (packet_id, packet_version_id, observed_at desc);

alter table public.legal_document_pilot_release_bindings_phase5 enable row level security;
alter table public.legal_document_pilot_lifecycle_traces_phase5 enable row level security;
revoke all on table public.legal_document_pilot_release_bindings_phase5 from public, anon, authenticated, service_role;
revoke all on table public.legal_document_pilot_lifecycle_traces_phase5 from public, anon, authenticated, service_role;
grant select on table public.legal_document_pilot_release_bindings_phase5 to service_role;
grant select on table public.legal_document_pilot_lifecycle_traces_phase5 to service_role;

create or replace function public.bridge_enforce_legal_document_pilot_release_trace_append_only_phase5()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op <> 'INSERT' then
    raise exception 'Phase 5 pilot release traces are append-only.' using errcode = '55000';
  end if;
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Phase 5 pilot release traces require service authority.' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_legal_document_pilot_release_bindings_phase5_append_only on public.legal_document_pilot_release_bindings_phase5;
create trigger trg_legal_document_pilot_release_bindings_phase5_append_only
before insert or update or delete on public.legal_document_pilot_release_bindings_phase5
for each row execute function public.bridge_enforce_legal_document_pilot_release_trace_append_only_phase5();

drop trigger if exists trg_legal_document_pilot_lifecycle_traces_phase5_append_only on public.legal_document_pilot_lifecycle_traces_phase5;
create trigger trg_legal_document_pilot_lifecycle_traces_phase5_append_only
before insert or update or delete on public.legal_document_pilot_lifecycle_traces_phase5
for each row execute function public.bridge_enforce_legal_document_pilot_release_trace_append_only_phase5();

create or replace function public.bridge_bind_legal_document_pilot_release_phase5(
  p_packet_id uuid,
  p_document_id uuid,
  p_activation_plan_digest text,
  p_generated_artifact_sha256 text,
  p_observed_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_packet public.document_packets%rowtype;
  v_document public.documents%rowtype;
  v_binding public.legal_document_pilot_release_bindings_phase5%rowtype;
  v_packet_type text;
  v_plan_digest text := lower(trim(coalesce(p_activation_plan_digest, '')));
  v_artifact_sha256 text := lower(trim(coalesce(p_generated_artifact_sha256, '')));
  v_observed_at timestamptz := coalesce(p_observed_at, now());
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Pilot release binding requires service authority.' using errcode = '42501', detail = 'PHASE5_RELEASE_TRACE_SERVICE_REQUIRED';
  end if;
  if p_packet_id is null or p_document_id is null
    or v_plan_digest !~ '^sha256:[0-9a-f]{64}$'
    or v_artifact_sha256 !~ '^sha256:[0-9a-f]{64}$'
    or v_observed_at > now() + interval '5 minutes' then
    raise exception 'Pilot release binding input is invalid.' using errcode = '22000', detail = 'PHASE5_RELEASE_TRACE_INPUT_INVALID';
  end if;

  select * into v_packet
  from public.document_packets
  where id = p_packet_id
  for key share;
  if not found then
    raise exception 'Pilot release packet is missing.' using errcode = 'P0002', detail = 'PHASE5_RELEASE_TRACE_PACKET_MISSING';
  end if;
  v_packet_type := lower(trim(coalesce(v_packet.packet_type, '')));
  if v_packet_type not in ('mandate', 'otp') or v_packet.organisation_id is null then
    raise exception 'Pilot release packet is not a canonical legal packet.' using errcode = '22000', detail = 'PHASE5_RELEASE_TRACE_PACKET_INVALID';
  end if;

  select * into v_document
  from public.documents
  where id = p_document_id
  for key share;
  if not found or v_document.legal_packet_id is distinct from v_packet.id then
    raise exception 'Pilot release binding must name the packet-owned generated document.' using errcode = '22000', detail = 'PHASE5_RELEASE_TRACE_DOCUMENT_MISMATCH';
  end if;

  perform set_config('bridge.legal_document_pilot_release_trace_phase5', 'bind', true);
  insert into public.legal_document_pilot_release_bindings_phase5 (
    organisation_id, packet_id, generated_document_id, packet_type,
    activation_plan_digest, release_contract, generated_artifact_sha256,
    generated_at, created_at
  ) values (
    v_packet.organisation_id, v_packet.id, v_document.id, v_packet_type,
    v_plan_digest, 'legal-document-pilot-release-v1', v_artifact_sha256,
    v_observed_at, v_observed_at
  )
  on conflict (packet_id, generated_document_id) do nothing;

  select * into v_binding
  from public.legal_document_pilot_release_bindings_phase5
  where packet_id = v_packet.id and generated_document_id = v_document.id
  for key share;
  if not found
    or v_binding.organisation_id is distinct from v_packet.organisation_id
    or v_binding.packet_type <> v_packet_type
    or v_binding.activation_plan_digest <> v_plan_digest
    or v_binding.release_contract <> 'legal-document-pilot-release-v1'
    or v_binding.generated_artifact_sha256 <> v_artifact_sha256 then
    raise exception 'Pilot release binding conflicts with immutable prior evidence.' using errcode = '55000', detail = 'PHASE5_RELEASE_TRACE_BINDING_CONFLICT';
  end if;

  return jsonb_build_object(
    'contract', 'legal-document-pilot-lifecycle-trace-v1',
    'bindingId', v_binding.id,
    'packetId', v_packet.id,
    'documentId', v_document.id,
    'packetType', v_packet_type,
    'activationPlanDigest', v_binding.activation_plan_digest,
    'observedAt', v_binding.generated_at
  );
end;
$$;

create or replace function public.bridge_record_legal_document_pilot_lifecycle_trace_phase5(
  p_packet_id uuid,
  p_packet_version_id uuid,
  p_stage text,
  p_access_context text default null,
  p_observed_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_packet public.document_packets%rowtype;
  v_version public.document_packet_versions%rowtype;
  v_binding public.legal_document_pilot_release_bindings_phase5%rowtype;
  v_trace public.legal_document_pilot_lifecycle_traces_phase5%rowtype;
  v_evidence public.legal_final_artifact_evidence%rowtype;
  v_packet_type text;
  v_stage text := lower(trim(coalesce(p_stage, '')));
  v_access_context text := lower(trim(coalesce(p_access_context, '')));
  v_observed_at timestamptz := coalesce(p_observed_at, now());
  v_signer_count integer := 0;
  v_signed_count integer := 0;
  v_delivery_count integer := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Pilot lifecycle trace requires service authority.' using errcode = '42501', detail = 'PHASE5_RELEASE_TRACE_SERVICE_REQUIRED';
  end if;
  if p_packet_id is null or p_packet_version_id is null
    or v_stage not in ('signing_invite_delivered', 'final_delivery_completed', 'final_access_authorized')
    or (v_stage = 'final_access_authorized' and v_access_context not in ('client_portal', 'seller_portal', 'workspace', 'signer'))
    or (v_stage <> 'final_access_authorized' and v_access_context <> '')
    or v_observed_at > now() + interval '5 minutes' then
    raise exception 'Pilot lifecycle trace input is invalid.' using errcode = '22000', detail = 'PHASE5_RELEASE_TRACE_INPUT_INVALID';
  end if;

  select * into v_packet from public.document_packets where id = p_packet_id for key share;
  select * into v_version from public.document_packet_versions where id = p_packet_version_id and packet_id = p_packet_id for key share;
  if not found or v_packet.organisation_id is null then
    raise exception 'Pilot lifecycle packet version is missing.' using errcode = 'P0002', detail = 'PHASE5_RELEASE_TRACE_VERSION_MISSING';
  end if;
  v_packet_type := lower(trim(coalesce(v_packet.packet_type, '')));
  if v_packet_type not in ('mandate', 'otp')
    or v_version.organisation_id is distinct from v_packet.organisation_id then
    raise exception 'Pilot lifecycle packet version is invalid.' using errcode = '22000', detail = 'PHASE5_RELEASE_TRACE_VERSION_INVALID';
  end if;

  select * into v_binding
  from public.legal_document_pilot_release_bindings_phase5
  where packet_id = p_packet_id
    and generated_document_id = v_version.rendered_document_id
  for key share;
  if not found
    or v_binding.organisation_id is distinct from v_packet.organisation_id
    or v_binding.packet_type <> v_packet_type
    or v_binding.release_contract <> 'legal-document-pilot-release-v1' then
    raise exception 'The exact generated packet version has no immutable pilot release binding.' using errcode = '55000', detail = 'PHASE5_RELEASE_TRACE_BINDING_REQUIRED';
  end if;

  -- The release binding is created by the renderer before the packet version
  -- is necessarily promoted.  At every later lifecycle checkpoint, require
  -- that the certified packet version still names the exact renderer hash
  -- sealed in that immutable binding.
  if lower(coalesce(v_version.rendered_sha256, '')) <> v_binding.generated_artifact_sha256 then
    raise exception 'The generated packet version no longer matches its immutable pilot release artifact hash.' using errcode = '55000', detail = 'PHASE5_RELEASE_TRACE_ARTIFACT_MISMATCH';
  end if;

  if v_stage = 'signing_invite_delivered' then
    if not exists (
      select 1 from public.document_packet_signers signer
      where signer.packet_id = p_packet_id
        and signer.packet_version_id = p_packet_version_id
        and lower(coalesce(signer.status, '')) in ('sent', 'viewed', 'signed')
    ) then
      raise exception 'Signing invite delivery has not been durably recorded.' using errcode = '55000', detail = 'PHASE5_RELEASE_TRACE_SIGNING_DELIVERY_REQUIRED';
    end if;
  else
    select * into v_evidence
    from public.legal_final_artifact_evidence
    where packet_id = p_packet_id and packet_version_id = p_packet_version_id
    for key share;
    select count(*), count(*) filter (where lower(coalesce(status, '')) = 'signed')
      into v_signer_count, v_signed_count
    from public.document_packet_signers
    where packet_id = p_packet_id and packet_version_id = p_packet_version_id;
    if not found
      or v_evidence.organisation_id is distinct from v_packet.organisation_id
      or v_evidence.path is distinct from v_version.final_signed_file_path
      or v_evidence.bucket is distinct from v_version.final_signed_file_bucket
      or coalesce(v_signer_count, 0) = 0
      or v_signed_count <> v_signer_count then
      raise exception 'Final artifact evidence and signer completion are required for this lifecycle trace.' using errcode = '55000', detail = 'PHASE5_RELEASE_TRACE_FINAL_EVIDENCE_REQUIRED';
    end if;
    if v_stage = 'final_delivery_completed' then
      select count(*) into v_delivery_count
      from public.legal_final_artifact_deliveries delivery
      where delivery.packet_version_id = p_packet_version_id
        and lower(coalesce(delivery.status, '')) = 'sent'
        and nullif(trim(coalesce(delivery.provider_message_id, '')), '') is not null;
      if v_delivery_count <> v_signer_count then
        raise exception 'A provider-accepted final delivery is required for every signer.' using errcode = '55000', detail = 'PHASE5_RELEASE_TRACE_FINAL_DELIVERY_REQUIRED';
      end if;
    end if;
  end if;

  perform set_config('bridge.legal_document_pilot_release_trace_phase5', 'record', true);
  insert into public.legal_document_pilot_lifecycle_traces_phase5 (
    binding_id, organisation_id, packet_id, packet_version_id, packet_type,
    activation_plan_digest, release_contract, trace_contract, stage,
    access_context, artifact_sha256, observed_at, created_at
  ) values (
    v_binding.id, v_packet.organisation_id, p_packet_id, p_packet_version_id, v_packet_type,
    v_binding.activation_plan_digest, 'legal-document-pilot-release-v1', 'legal-document-pilot-lifecycle-trace-v1', v_stage,
    nullif(v_access_context, ''), case when v_stage = 'signing_invite_delivered' then null else v_evidence.sha256 end,
    v_observed_at, v_observed_at
  ) on conflict (binding_id, packet_version_id, stage) do nothing;

  select * into v_trace
  from public.legal_document_pilot_lifecycle_traces_phase5
  where binding_id = v_binding.id and packet_version_id = p_packet_version_id and stage = v_stage
  for key share;
  if not found
    or v_trace.activation_plan_digest <> v_binding.activation_plan_digest
    or v_trace.organisation_id is distinct from v_packet.organisation_id
    or v_trace.packet_type <> v_packet_type
    or v_trace.release_contract <> 'legal-document-pilot-release-v1'
    or v_trace.trace_contract <> 'legal-document-pilot-lifecycle-trace-v1'
    or v_trace.access_context is distinct from nullif(v_access_context, '') then
    raise exception 'Pilot lifecycle trace conflicts with immutable prior evidence.' using errcode = '55000', detail = 'PHASE5_RELEASE_TRACE_CONFLICT';
  end if;

  return jsonb_build_object(
    'contract', 'legal-document-pilot-lifecycle-trace-v1',
    'traceId', v_trace.id,
    'bindingId', v_binding.id,
    'packetId', p_packet_id,
    'packetVersionId', p_packet_version_id,
    'packetType', v_packet_type,
    'stage', v_stage,
    'activationPlanDigest', v_binding.activation_plan_digest,
    'observedAt', v_trace.observed_at
  );
end;
$$;

create or replace function public.bridge_assert_legal_document_pilot_release_binding_phase5(
  p_packet_id uuid,
  p_packet_version_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_packet public.document_packets%rowtype;
  v_version public.document_packet_versions%rowtype;
  v_binding public.legal_document_pilot_release_bindings_phase5%rowtype;
  v_packet_type text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Pilot release binding verification requires service authority.' using errcode = '42501', detail = 'PHASE5_RELEASE_TRACE_SERVICE_REQUIRED';
  end if;
  if p_packet_id is null or p_packet_version_id is null then
    raise exception 'Pilot release binding target is invalid.' using errcode = '22000', detail = 'PHASE5_RELEASE_TRACE_INPUT_INVALID';
  end if;
  select * into v_packet from public.document_packets where id = p_packet_id for key share;
  if not found or v_packet.organisation_id is null then
    raise exception 'Pilot release packet is missing.' using errcode = 'P0002', detail = 'PHASE5_RELEASE_TRACE_PACKET_MISSING';
  end if;
  select * into v_version from public.document_packet_versions where id = p_packet_version_id and packet_id = p_packet_id for key share;
  if not found then
    raise exception 'Pilot release packet version is missing.' using errcode = 'P0002', detail = 'PHASE5_RELEASE_TRACE_VERSION_MISSING';
  end if;
  v_packet_type := lower(trim(coalesce(v_packet.packet_type, '')));
  select * into v_binding
  from public.legal_document_pilot_release_bindings_phase5
  where packet_id = p_packet_id and generated_document_id = v_version.rendered_document_id
  for key share;
  if v_packet_type not in ('mandate', 'otp')
    or v_version.organisation_id is distinct from v_packet.organisation_id
    or not found
    or v_binding.organisation_id is distinct from v_packet.organisation_id
    or v_binding.packet_type <> v_packet_type
    or v_binding.release_contract <> 'legal-document-pilot-release-v1' then
    raise exception 'The exact generated packet version has no immutable pilot release binding.' using errcode = '55000', detail = 'PHASE5_RELEASE_TRACE_BINDING_REQUIRED';
  end if;
  if lower(coalesce(v_version.rendered_sha256, '')) <> v_binding.generated_artifact_sha256 then
    raise exception 'The generated packet version does not match its immutable pilot release artifact hash.' using errcode = '55000', detail = 'PHASE5_RELEASE_TRACE_ARTIFACT_MISMATCH';
  end if;
  return jsonb_build_object(
    'contract', 'legal-document-pilot-lifecycle-trace-v1',
    'bindingId', v_binding.id,
    'packetId', v_packet.id,
    'packetVersionId', v_version.id,
    'packetType', v_packet_type,
    'activationPlanDigest', v_binding.activation_plan_digest
  );
end;
$$;

revoke all on function public.bridge_enforce_legal_document_pilot_release_trace_append_only_phase5() from public, anon, authenticated, service_role;
revoke all on function public.bridge_bind_legal_document_pilot_release_phase5(uuid, uuid, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.bridge_record_legal_document_pilot_lifecycle_trace_phase5(uuid, uuid, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.bridge_assert_legal_document_pilot_release_binding_phase5(uuid, uuid) from public, anon, authenticated;
grant execute on function public.bridge_bind_legal_document_pilot_release_phase5(uuid, uuid, text, text, timestamptz) to service_role;
grant execute on function public.bridge_record_legal_document_pilot_lifecycle_trace_phase5(uuid, uuid, text, text, timestamptz) to service_role;
grant execute on function public.bridge_assert_legal_document_pilot_release_binding_phase5(uuid, uuid) to service_role;

comment on table public.legal_document_pilot_release_bindings_phase5 is
  'Phase 5 immutable server-owned binding from one legal generated artifact to the exact Phase 4 activation-plan digest.';
comment on table public.legal_document_pilot_lifecycle_traces_phase5 is
  'Phase 5 immutable server-owned lifecycle checkpoints for a release-bound legal packet version. It is acceptance evidence, never a scale authority.';

notify pgrst, 'reload schema';

commit;
