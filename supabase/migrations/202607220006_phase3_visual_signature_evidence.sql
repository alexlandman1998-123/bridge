begin;

-- Phase 3: F2 is the only service-owned commit that can mark a packet
-- completed.  Require the visual-signature evidence emitted by the canonical
-- exact-PDF finaliser here as well, so an audit-only artifact cannot be
-- accepted by bypassing application-level checks.
--
-- The original F2 row is already immutable. Persist the Phase 3 evidence on
-- that row rather than relying only on an editable packet-event JSON payload.
alter table public.legal_final_artifact_evidence
  add column if not exists signature_evidence_contract text,
  add column if not exists signature_evidence_mode text,
  add column if not exists embedded_signature_count integer,
  add column if not exists signature_asset_evidence_sha256 text,
  add column if not exists signature_asset_fingerprints_json jsonb;

alter table public.legal_final_artifact_evidence
  drop constraint if exists legal_final_artifact_evidence_phase3_signature_evidence_check;
alter table public.legal_final_artifact_evidence
  add constraint legal_final_artifact_evidence_phase3_signature_evidence_check
  check (
    (
      signature_evidence_contract is null
      and signature_evidence_mode is null
      and embedded_signature_count is null
      and signature_asset_evidence_sha256 is null
      and signature_asset_fingerprints_json is null
    )
    or (
      signature_evidence_contract is not null
      and signature_evidence_mode is not null
      and embedded_signature_count is not null
      and signature_asset_evidence_sha256 is not null
      and signature_asset_fingerprints_json is not null
      and signature_evidence_contract = 'phase3-visual-signature-evidence-v1'
      and signature_evidence_mode = 'visual_and_audit'
      and embedded_signature_count > 0
      and signature_asset_evidence_sha256 ~ '^[0-9a-f]{64}$'
      and jsonb_typeof(signature_asset_fingerprints_json) = 'array'
      and jsonb_array_length(signature_asset_fingerprints_json) = embedded_signature_count
    )
  );

create or replace function public.bridge_record_final_artifact_f2(
  p_organisation_id uuid,
  p_packet_id uuid,
  p_packet_version_id uuid,
  p_bucket text,
  p_path text,
  p_file_name text,
  p_sha256 text,
  p_byte_length bigint,
  p_signer_evidence_sha256 text,
  p_field_evidence_sha256 text,
  p_generated_at timestamptz,
  p_event_type text,
  p_event_payload jsonb,
  p_finalised_by uuid default null,
  p_final_signed_document_id uuid default null
)
returns public.document_packet_versions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_version public.document_packet_versions%rowtype;
  v_packet public.document_packets%rowtype;
  v_context jsonb;
  v_status_context jsonb;
  v_payload jsonb := coalesce(p_event_payload, '{}'::jsonb);
  v_required_signature_asset_count integer := 0;
  v_embedded_signature_count integer := 0;
  v_fingerprint_count integer := 0;
begin
  if auth.role() <> 'service_role' then
    raise exception 'F2 final artifact recording requires the signing service.' using errcode = '42501';
  end if;

  select * into v_packet
  from public.document_packets
  where id = p_packet_id and organisation_id = p_organisation_id
  for update;
  if not found then
    raise exception 'F2 final packet was not found.' using errcode = 'P0001';
  end if;

  if coalesce(p_event_type, '') <> 'final_signed_document_generated' then
    raise exception 'Phase 3 finalisation requires the canonical final-signed event.'
      using errcode = '22000', detail = 'PHASE3_FINAL_EVENT_TYPE_REQUIRED';
  end if;
  if coalesce(v_payload->>'signatureEvidenceContract', '') <> 'phase3-visual-signature-evidence-v1'
    or coalesce(v_payload->>'signatureEvidenceMode', '') <> 'visual_and_audit'
    or coalesce(v_payload->>'signatureAssetEvidenceSha256', '') !~ '^[0-9a-f]{64}$'
    or coalesce(v_payload->>'finalArtifactSha256', '') <> lower(coalesce(p_sha256, ''))
    or case
      when coalesce(v_payload->>'finalArtifactByteLength', '') ~ '^[0-9]+$'
        then (v_payload->>'finalArtifactByteLength')::bigint <> p_byte_length
      else true
    end
    or jsonb_typeof(v_payload->'signatureAssetFingerprints') <> 'array' then
    raise exception 'Phase 3 finalisation requires verified visual signature evidence.'
      using errcode = '22000', detail = 'PHASE3_VISUAL_SIGNATURE_EVIDENCE_REQUIRED';
  end if;

  begin
    v_embedded_signature_count := (v_payload->>'embeddedSignatureCount')::integer;
  exception when invalid_text_representation then
    raise exception 'Phase 3 embedded signature count is invalid.'
      using errcode = '22000', detail = 'PHASE3_EMBEDDED_SIGNATURE_COUNT_INVALID';
  end;
  v_fingerprint_count := jsonb_array_length(v_payload->'signatureAssetFingerprints');

  select count(*) into v_required_signature_asset_count
  from public.document_signing_fields field
  where field.packet_id = p_packet_id
    and field.packet_version_id = p_packet_version_id
    and field.required is true
    and lower(trim(coalesce(field.field_type, ''))) in ('signature', 'initial');

  if v_required_signature_asset_count < 1
    or coalesce(v_embedded_signature_count, -1) <> v_required_signature_asset_count
    or v_fingerprint_count <> v_required_signature_asset_count
    or (
      select count(distinct fingerprint->>'fieldId')
      from jsonb_array_elements(v_payload->'signatureAssetFingerprints') fingerprint
    ) <> v_required_signature_asset_count
    or exists (
      select 1
      from jsonb_array_elements(v_payload->'signatureAssetFingerprints') fingerprint
      where coalesce(fingerprint->>'fieldId', '') = ''
        or coalesce(fingerprint->>'signerRole', '') = ''
        or coalesce(fingerprint->>'fieldType', '') not in ('signature', 'initial')
        or coalesce(fingerprint->>'sha256', '') !~ '^[0-9a-f]{64}$'
        or lower(coalesce(fingerprint->>'imageFormat', '')) not in ('png', 'jpeg')
        or case
          when coalesce(fingerprint->>'byteLength', '') ~ '^[0-9]+$'
            then (fingerprint->>'byteLength')::bigint < 1
              or (fingerprint->>'byteLength')::bigint > 20971520
          else true
        end
    )
    or exists (
      select 1
      from jsonb_array_elements(v_payload->'signatureAssetFingerprints') fingerprint
      left join public.document_signing_fields field
        on field.id::text = fingerprint->>'fieldId'
       and field.packet_id = p_packet_id
       and field.packet_version_id = p_packet_version_id
       and field.required is true
       and lower(trim(coalesce(field.field_type, ''))) in ('signature', 'initial')
      where field.id is null
        or lower(trim(coalesce(field.signer_role, ''))) <> lower(trim(coalesce(fingerprint->>'signerRole', '')))
        or lower(trim(coalesce(field.field_type, ''))) <> lower(trim(coalesce(fingerprint->>'fieldType', '')))
    ) then
    raise exception 'Phase 3 visual signature evidence is incomplete.'
      using errcode = '22000', detail = 'PHASE3_VISUAL_SIGNATURE_EVIDENCE_INCOMPLETE';
  end if;

  insert into public.legal_final_artifact_evidence (
    organisation_id, packet_id, packet_version_id, bucket, path, file_name, media_type,
    sha256, byte_length, signer_evidence_sha256, field_evidence_sha256, generated_at,
    signature_evidence_contract, signature_evidence_mode, embedded_signature_count,
    signature_asset_evidence_sha256, signature_asset_fingerprints_json
  ) values (
    p_organisation_id, p_packet_id, p_packet_version_id, p_bucket, p_path, p_file_name, 'application/pdf',
    p_sha256, p_byte_length, p_signer_evidence_sha256, p_field_evidence_sha256, p_generated_at,
    v_payload->>'signatureEvidenceContract', v_payload->>'signatureEvidenceMode', v_embedded_signature_count,
    v_payload->>'signatureAssetEvidenceSha256', v_payload->'signatureAssetFingerprints'
  );

  update public.document_packet_versions set
    final_signed_file_path = p_path,
    final_signed_file_url = null,
    final_signed_file_bucket = p_bucket,
    final_signed_file_name = p_file_name,
    final_signed_document_id = p_final_signed_document_id,
    finalised_at = p_generated_at,
    finalised_by = p_finalised_by
  where id = p_packet_version_id and packet_id = p_packet_id and organisation_id = p_organisation_id
  returning * into v_version;
  if v_version.id is null then raise exception 'F2 final packet version was not found.' using errcode = 'P0001'; end if;

  v_context := coalesce(v_packet.source_context_json, '{}'::jsonb);
  v_status_context := jsonb_build_object(
    'signing_status', 'completed',
    'signingStatus', 'completed',
    'signedAt', coalesce(v_context->'signedAt', to_jsonb(p_generated_at)),
    'finalSignedAt', p_generated_at,
    'finalSignedArtifactPath', p_path
  );
  if lower(coalesce(v_packet.packet_type, '')) = 'otp' then
    v_context := v_context - 'mandateStatus';
    v_status_context := v_status_context || jsonb_build_object('otpStatus', 'completed');
  elsif lower(coalesce(v_packet.packet_type, '')) = 'mandate' then
    v_context := v_context - 'otpStatus';
    v_status_context := v_status_context || jsonb_build_object('mandateStatus', 'completed');
  end if;

  update public.document_packets set
    status = 'completed',
    completed_at = p_generated_at,
    source_context_json = v_context || v_status_context
  where id = p_packet_id and organisation_id = p_organisation_id;
  if not found then raise exception 'F2 final packet was not found.' using errcode = 'P0001'; end if;

  insert into public.document_packet_events (packet_id, organisation_id, version_id, event_type, event_payload_json, created_by, created_at)
  values (p_packet_id, p_organisation_id, p_packet_version_id, p_event_type, v_payload, p_finalised_by, p_generated_at);
  return v_version;
end;
$$;

revoke all on function public.bridge_record_final_artifact_f2(uuid, uuid, uuid, text, text, text, text, bigint, text, text, timestamptz, text, jsonb, uuid, uuid) from public, anon, authenticated;
grant execute on function public.bridge_record_final_artifact_f2(uuid, uuid, uuid, text, text, text, text, bigint, text, text, timestamptz, text, jsonb, uuid, uuid) to service_role;

-- The version trigger is the second database backstop.  It sees the immutable
-- F2 row written above before the version can gain a final-artifact pointer.
create or replace function public.bridge_enforce_final_artifact_evidence_f2()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_packet public.document_packets%rowtype;
  v_lock jsonb;
  v_evidence public.legal_final_artifact_evidence%rowtype;
  v_incomplete integer;
  v_required_signature_asset_count integer := 0;
  v_legacy_valid boolean;
  v_controlled_valid boolean;
begin
  if new.final_signed_file_path is not distinct from old.final_signed_file_path
    and new.final_signed_file_bucket is not distinct from old.final_signed_file_bucket
    and new.finalised_at is not distinct from old.finalised_at then
    return new;
  end if;
  if coalesce(old.final_signed_file_path, '') <> '' then
    raise exception 'F2 final signed artifact evidence is immutable.' using errcode = 'P0001';
  end if;

  select * into v_packet from public.document_packets where id = new.packet_id;
  select * into v_evidence from public.legal_final_artifact_evidence where packet_version_id = new.id;
  v_lock := coalesce(new.validation_summary_json->'lock_snapshot', '{}'::jsonb);
  v_legacy_valid := coalesce(new.validation_summary_json->>'review_state', '') = 'locked'
    and coalesce((new.validation_summary_json->>'content_locked')::boolean, false)
    and coalesce(v_lock->>'versionId', '') = new.id::text
    and coalesce(v_lock->>'packetId', '') = new.packet_id::text;
  v_controlled_valid := coalesce(new.render_input_verified, false)
    and coalesce(new.transaction_pdf_persisted, false)
    and coalesce(new.native_pdf_verified, false)
    and exists (
      select 1
      from public.document_signing_field_layouts layout
      join public.document_signing_dispatches dispatch
        on dispatch.layout_id = layout.id
       and dispatch.packet_id = new.packet_id
       and dispatch.packet_version_id = new.id
       and dispatch.status = 'delivered'
      where layout.packet_id = new.packet_id
        and layout.packet_version_id = new.id
        and layout.status = 'applied'
        and layout.placement_verified is true
    )
    and not exists (
      select 1
      from public.document_packet_signers signer
      where signer.packet_version_id = new.id
        and not exists (
          select 1
          from public.document_signer_sessions session
          where session.signer_id = signer.id
            and session.packet_version_id = new.id
            and session.status = 'completed'
        )
    );
  if v_packet.id is null
    or v_packet.organisation_id is distinct from new.organisation_id
    or v_packet.current_version_number is distinct from new.version_number
    or new.render_status <> 'generated'
    or not (v_legacy_valid or v_controlled_valid) then
    raise exception 'F2 finalisation requires the exact legacy lock or completed controlled signing chain.' using errcode = 'P0001';
  end if;

  select count(*) into v_incomplete
  from public.document_packet_signers signer
  where signer.packet_id = new.packet_id
    and signer.packet_version_id = new.id
    and (signer.status <> 'signed' or signer.signed_at is null);
  if v_incomplete > 0
    or not exists (
      select 1 from public.document_packet_signers signer
      where signer.packet_id = new.packet_id and signer.packet_version_id = new.id
    ) then
    raise exception 'F2 every configured signer must be complete.' using errcode = 'P0001';
  end if;

  select count(*) into v_incomplete
  from public.document_signing_fields field
  where field.packet_id = new.packet_id
    and field.packet_version_id = new.id
    and field.required is true
    and (
      coalesce(field.status, '') <> 'completed'
      or (lower(trim(coalesce(field.field_type, ''))) in ('signature', 'initial') and coalesce(field.signature_asset_path, '') = '')
      or (lower(trim(coalesce(field.field_type, ''))) in ('signature', 'initial') and not exists (
        select 1
        from public.document_packet_signers signer
        where signer.packet_id = field.packet_id
          and signer.packet_version_id = field.packet_version_id
          and signer.signer_role = field.signer_role
          and (coalesce(trim(field.signer_email), '') = '' or lower(trim(signer.signer_email)) = lower(trim(field.signer_email)))
          and field.signature_asset_path like ('document-signatures/' || field.packet_id::text || '/' || signer.id::text || '/%')
      ))
    );
  select count(*) into v_required_signature_asset_count
  from public.document_signing_fields field
  where field.packet_id = new.packet_id
    and field.packet_version_id = new.id
    and field.required is true
    and lower(trim(coalesce(field.field_type, ''))) in ('signature', 'initial');

  if v_incomplete > 0
    or not exists (
      select 1
      from public.document_signing_fields field
      where field.packet_id = new.packet_id
        and field.packet_version_id = new.id
        and field.required is true
        and lower(trim(coalesce(field.field_type, ''))) = 'signature'
    )
    or v_evidence.id is null
    or v_evidence.organisation_id is distinct from new.organisation_id
    or v_evidence.packet_id is distinct from new.packet_id
    or v_evidence.path is distinct from new.final_signed_file_path
    or v_evidence.bucket is distinct from new.final_signed_file_bucket
    or v_evidence.file_name is distinct from new.final_signed_file_name
    or v_evidence.generated_at is distinct from new.finalised_at
    or coalesce(v_evidence.signature_evidence_contract, '') <> 'phase3-visual-signature-evidence-v1'
    or coalesce(v_evidence.signature_evidence_mode, '') <> 'visual_and_audit'
    or coalesce(v_evidence.embedded_signature_count, -1) <> v_required_signature_asset_count
    or coalesce(v_evidence.signature_asset_evidence_sha256, '') !~ '^[0-9a-f]{64}$'
    or jsonb_typeof(v_evidence.signature_asset_fingerprints_json) <> 'array'
    or coalesce(jsonb_array_length(v_evidence.signature_asset_fingerprints_json), -1) <> v_required_signature_asset_count
    or (
      select count(distinct fingerprint->>'fieldId')
      from jsonb_array_elements(v_evidence.signature_asset_fingerprints_json) fingerprint
    ) <> v_required_signature_asset_count
    or exists (
      select 1
      from jsonb_array_elements(v_evidence.signature_asset_fingerprints_json) fingerprint
      where coalesce(fingerprint->>'fieldId', '') = ''
        or coalesce(fingerprint->>'signerRole', '') = ''
        or lower(coalesce(fingerprint->>'fieldType', '')) not in ('signature', 'initial')
        or coalesce(fingerprint->>'sha256', '') !~ '^[0-9a-f]{64}$'
        or lower(coalesce(fingerprint->>'imageFormat', '')) not in ('png', 'jpeg')
        or case
          when coalesce(fingerprint->>'byteLength', '') ~ '^[0-9]+$'
            then (fingerprint->>'byteLength')::bigint < 1
              or (fingerprint->>'byteLength')::bigint > 20971520
          else true
        end
    )
    or exists (
      select 1
      from jsonb_array_elements(v_evidence.signature_asset_fingerprints_json) fingerprint
      left join public.document_signing_fields field
        on field.id::text = fingerprint->>'fieldId'
       and field.packet_id = new.packet_id
       and field.packet_version_id = new.id
       and field.required is true
       and lower(trim(coalesce(field.field_type, ''))) in ('signature', 'initial')
      where field.id is null
        or lower(trim(coalesce(field.signer_role, ''))) <> lower(trim(coalesce(fingerprint->>'signerRole', '')))
        or lower(trim(coalesce(field.field_type, ''))) <> lower(trim(coalesce(fingerprint->>'fieldType', '')))
    ) then
    raise exception 'F2 final artifact evidence is missing, incomplete or mismatched.'
      using errcode = 'P0001', detail = 'PHASE3_VISUAL_SIGNATURE_EVIDENCE_REQUIRED';
  end if;
  return new;
end;
$$;

-- Packet events are otherwise collaborative/auditable records.  Canonical F2
-- finalisation events are evidence, so bind them to the immutable F2 row and
-- prevent later edits or deletion by a packet member.
create or replace function public.bridge_enforce_phase3_final_event_evidence()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_evidence public.legal_final_artifact_evidence%rowtype;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    if old.event_type in ('final_signed_document_generated', 'final_signed_otp_generated') then
      raise exception 'Canonical finalisation audit events are immutable.'
        using errcode = 'P0001', detail = 'PHASE3_FINAL_EVENT_IMMUTABLE';
    end if;
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if new.event_type = 'final_signed_otp_generated' then
    raise exception 'Legacy OTP finalisation events are retired.'
      using errcode = '22000', detail = 'PHASE3_LEGACY_OTP_FINAL_EVENT_RETIRED';
  end if;
  if new.event_type <> 'final_signed_document_generated' then
    return new;
  end if;
  if auth.role() <> 'service_role' then
    raise exception 'Canonical finalisation events require the signing service.'
      using errcode = '42501', detail = 'PHASE3_FINAL_EVENT_SERVICE_ONLY';
  end if;

  select * into v_evidence
  from public.legal_final_artifact_evidence
  where packet_id = new.packet_id and packet_version_id = new.version_id;
  if v_evidence.id is null
    or v_evidence.organisation_id is distinct from new.organisation_id
    or coalesce(new.event_payload_json->>'signatureEvidenceContract', '') <> v_evidence.signature_evidence_contract
    or coalesce(new.event_payload_json->>'signatureEvidenceMode', '') <> v_evidence.signature_evidence_mode
    or coalesce((new.event_payload_json->>'embeddedSignatureCount')::integer, -1) <> v_evidence.embedded_signature_count
    or coalesce(new.event_payload_json->>'signatureAssetEvidenceSha256', '') <> v_evidence.signature_asset_evidence_sha256
    or new.event_payload_json->'signatureAssetFingerprints' is distinct from v_evidence.signature_asset_fingerprints_json
    or coalesce(new.event_payload_json->>'generatedFileBucket', '') <> v_evidence.bucket
    or coalesce(new.event_payload_json->>'generatedFilePath', '') <> v_evidence.path
    or coalesce(new.event_payload_json->>'finalArtifactSha256', '') <> v_evidence.sha256
    or coalesce((new.event_payload_json->>'finalArtifactByteLength')::bigint, -1) <> v_evidence.byte_length then
    raise exception 'Canonical finalisation event does not match immutable F2 evidence.'
      using errcode = '22000', detail = 'PHASE3_FINAL_EVENT_EVIDENCE_MISMATCH';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_phase3_final_event_evidence on public.document_packet_events;
create trigger trg_phase3_final_event_evidence
before insert or update or delete on public.document_packet_events
for each row execute function public.bridge_enforce_phase3_final_event_evidence();

comment on function public.bridge_record_final_artifact_f2(uuid, uuid, uuid, text, text, text, text, bigint, text, text, timestamptz, text, jsonb, uuid, uuid) is
  'Phase 3 F2: service-only finalisation that requires a one-to-one visual signature asset fingerprint for each required signature or initial field.';

commit;
