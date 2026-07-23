begin;

-- Phase 2 makes the Offer to Purchase follow the same immutable PDF chain as a
-- mandate.  Draft editing remains a normal packet-authorised action, while a
-- generated/certified OTP and all signing delivery evidence are service-owned.

-- An OTP cannot enter any signing lifecycle before it is tied to the
-- transaction that will receive the certified and final artifacts (D3/F3/F4).
create or replace function public.bridge_enforce_otp_transaction_before_signing_phase2()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if lower(coalesce(new.packet_type, '')) = 'otp'
     and lower(coalesce(new.status, '')) in (
       'signing_prep', 'signing_prepared', 'ready_to_send',
       'sent', 'partially_signed', 'signed', 'completed'
     )
     and new.transaction_id is null then
    raise exception 'An Offer to Purchase must be linked to a transaction before it can enter signing.'
      using errcode = '22000', detail = 'PHASE2_OTP_TRANSACTION_REQUIRED';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_otp_transaction_before_signing_phase2 on public.document_packets;
create trigger trg_otp_transaction_before_signing_phase2
before insert or update of status, packet_type, transaction_id
on public.document_packets
for each row execute function public.bridge_enforce_otp_transaction_before_signing_phase2();

-- Client users may still create and revise C1/C2 drafts, and may freeze a
-- draft for rendering.  They may not create a generated OTP version, attach
-- an artifact to it, or mutate any D1/D2/D3/C4-completion evidence.  This
-- intentionally applies even when an authenticated user calls an existing
-- SECURITY DEFINER RPC: auth.role() continues to describe the request caller.
create or replace function public.bridge_enforce_otp_canonical_version_authority_phase2()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_packet_type text;
  v_old_render_status text := case when tg_op = 'INSERT' then '' else lower(coalesce(old.render_status, '')) end;
  v_new_render_status text := lower(coalesce(new.render_status, ''));
  v_canonical_write boolean := false;
begin
  select lower(coalesce(packet_type, '')) into v_packet_type
  from public.document_packets
  where id = new.packet_id;

  if coalesce(v_packet_type, '') <> 'otp' or auth.role() = 'service_role' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if v_new_render_status = 'generated' then
      raise exception 'Only the canonical OTP rendering service may create a generated OTP version.'
        using errcode = '42501', detail = 'PHASE2_OTP_GENERATED_VERSION_SERVICE_ONLY';
    end if;

    v_canonical_write :=
      new.rendered_document_id is not null
      or nullif(trim(coalesce(new.rendered_file_path, '')), '') is not null
      or nullif(trim(coalesce(new.rendered_file_name, '')), '') is not null
      or nullif(trim(coalesce(new.rendered_file_url, '')), '') is not null
      or nullif(trim(coalesce(new.rendered_file_bucket, '')), '') is not null
      or nullif(trim(coalesce(new.rendered_media_type, '')), '') is not null
      or new.rendered_byte_length is not null
      or nullif(trim(coalesce(new.rendered_sha256, '')), '') is not null
      or coalesce(new.render_input_verified, false)
      or new.render_input_verified_at is not null
      or coalesce(new.native_pdf_verified, false)
      or new.native_pdf_verified_at is not null
      or nullif(trim(coalesce(new.native_pdf_renderer_contract, '')), '') is not null
      or coalesce(new.transaction_pdf_persisted, false)
      or new.transaction_pdf_persisted_at is not null
      or new.render_source_version_id is not null
      or nullif(trim(coalesce(new.render_source_fingerprint, '')), '') is not null
      or lower(coalesce(new.render_freeze_status, '')) in ('rendered', 'failed');
  else
    if v_old_render_status = 'generated' or v_new_render_status = 'generated' then
      raise exception 'Only the canonical OTP rendering service may create or modify a generated OTP version.'
        using errcode = '42501', detail = 'PHASE2_OTP_GENERATED_VERSION_SERVICE_ONLY';
    end if;

    v_canonical_write :=
      new.rendered_document_id is distinct from old.rendered_document_id
      or new.rendered_file_path is distinct from old.rendered_file_path
      or new.rendered_file_name is distinct from old.rendered_file_name
      or new.rendered_file_url is distinct from old.rendered_file_url
      or new.rendered_file_bucket is distinct from old.rendered_file_bucket
      or new.rendered_media_type is distinct from old.rendered_media_type
      or new.rendered_byte_length is distinct from old.rendered_byte_length
      or new.rendered_sha256 is distinct from old.rendered_sha256
      or new.render_input_verified is distinct from old.render_input_verified
      or new.render_input_verified_at is distinct from old.render_input_verified_at
      or new.native_pdf_verified is distinct from old.native_pdf_verified
      or new.native_pdf_verified_at is distinct from old.native_pdf_verified_at
      or new.native_pdf_renderer_contract is distinct from old.native_pdf_renderer_contract
      or new.transaction_pdf_persisted is distinct from old.transaction_pdf_persisted
      or new.transaction_pdf_persisted_at is distinct from old.transaction_pdf_persisted_at
      or new.render_source_version_id is distinct from old.render_source_version_id
      or new.render_source_fingerprint is distinct from old.render_source_fingerprint
      or (
        new.render_freeze_status is distinct from old.render_freeze_status
        and (
          lower(coalesce(old.render_freeze_status, '')) = 'frozen'
          or lower(coalesce(new.render_freeze_status, '')) in ('rendered', 'failed')
        )
      )
      or (
        lower(coalesce(old.render_freeze_status, '')) = 'frozen'
        and (
          new.render_freeze_id is distinct from old.render_freeze_id
          or new.render_frozen_at is distinct from old.render_frozen_at
          or new.render_content_fingerprint is distinct from old.render_content_fingerprint
        )
      );
  end if;

  if v_canonical_write then
    raise exception 'Only the canonical OTP rendering service may write OTP render artifacts or certification evidence.'
      using errcode = '42501', detail = 'PHASE2_OTP_CANONICAL_RENDER_SERVICE_ONLY';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_otp_canonical_version_authority_phase2 on public.document_packet_versions;
create trigger trg_otp_canonical_version_authority_phase2
before insert or update on public.document_packet_versions
for each row execute function public.bridge_enforce_otp_canonical_version_authority_phase2();

-- D3's document row is part of the same canonical evidence.  Do not permit a
-- browser to manufacture or alter that link before the normal D3 immutability
-- trigger gets a chance to protect it.
create or replace function public.bridge_enforce_otp_canonical_document_link_authority_phase2()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_packet_id uuid;
  v_packet_type text;
  v_canonical_write boolean := false;
begin
  v_packet_id := coalesce(new.legal_packet_id, new.final_legal_packet_id);
  if tg_op = 'UPDATE' then
    v_packet_id := coalesce(v_packet_id, old.legal_packet_id, old.final_legal_packet_id);
  end if;

  if v_packet_id is null or auth.role() = 'service_role' then
    return new;
  end if;

  select lower(coalesce(packet_type, '')) into v_packet_type
  from public.document_packets
  where id = v_packet_id;
  if coalesce(v_packet_type, '') <> 'otp' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    v_canonical_write :=
      new.legal_packet_id is not null
      or new.legal_packet_version_id is not null
      or nullif(trim(coalesce(new.generated_artifact_bucket, '')), '') is not null
      or nullif(trim(coalesce(new.generated_artifact_media_type, '')), '') is not null
      or new.generated_artifact_byte_length is not null
      or nullif(trim(coalesce(new.generated_artifact_sha256, '')), '') is not null
      or new.final_legal_packet_id is not null
      or new.final_legal_packet_version_id is not null
      or nullif(trim(coalesce(new.final_artifact_bucket, '')), '') is not null
      or nullif(trim(coalesce(new.final_artifact_media_type, '')), '') is not null
      or new.final_artifact_byte_length is not null
      or nullif(trim(coalesce(new.final_artifact_sha256, '')), '') is not null;
  else
    v_canonical_write :=
      new.legal_packet_id is distinct from old.legal_packet_id
      or new.legal_packet_version_id is distinct from old.legal_packet_version_id
      or new.generated_artifact_bucket is distinct from old.generated_artifact_bucket
      or new.generated_artifact_media_type is distinct from old.generated_artifact_media_type
      or new.generated_artifact_byte_length is distinct from old.generated_artifact_byte_length
      or new.generated_artifact_sha256 is distinct from old.generated_artifact_sha256
      or new.final_legal_packet_id is distinct from old.final_legal_packet_id
      or new.final_legal_packet_version_id is distinct from old.final_legal_packet_version_id
      or new.final_artifact_bucket is distinct from old.final_artifact_bucket
      or new.final_artifact_media_type is distinct from old.final_artifact_media_type
      or new.final_artifact_byte_length is distinct from old.final_artifact_byte_length
      or new.final_artifact_sha256 is distinct from old.final_artifact_sha256;
  end if;

  if v_canonical_write then
    raise exception 'Only the canonical OTP signing service may bind an OTP document artifact to a packet.'
      using errcode = '42501', detail = 'PHASE2_OTP_DOCUMENT_LINK_SERVICE_ONLY';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_otp_canonical_document_link_authority_phase2 on public.documents;
create trigger trg_otp_canonical_document_link_authority_phase2
before insert or update on public.documents
for each row execute function public.bridge_enforce_otp_canonical_document_link_authority_phase2();

-- C4 completion is the only C4 action that promotes a frozen draft into a
-- rendered source link.  Keep freezing/editing available to the document
-- author, but require the renderer service to complete an OTP freeze.
create or replace function public.bridge_complete_editable_render_freeze_c4(
  p_packet_id uuid,
  p_freeze_id uuid,
  p_generated_version_id uuid default null,
  p_success boolean default true,
  p_failure_message text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source public.document_packet_versions%rowtype;
  v_actor uuid := auth.uid();
  v_packet_type text;
begin
  if auth.role() <> 'service_role' and not public.bridge_can_access_legal_packet_h2(p_packet_id) then
    raise exception 'Packet generation authority is required.' using errcode = '42501';
  end if;

  select lower(coalesce(packet_type, '')) into v_packet_type
  from public.document_packets
  where id = p_packet_id;
  if not found then raise exception 'Document packet not found.' using errcode = 'P0002'; end if;
  if v_packet_type = 'otp' and auth.role() <> 'service_role' then
    raise exception 'Only the canonical OTP rendering service may complete an OTP render freeze.'
      using errcode = '42501', detail = 'PHASE2_OTP_RENDER_FREEZE_COMPLETION_SERVICE_ONLY';
  end if;

  select * into v_source
  from public.document_packet_versions
  where packet_id = p_packet_id and render_freeze_id = p_freeze_id
  for update;
  if not found then raise exception 'Render freeze not found.' using errcode = 'P0002'; end if;

  update public.document_packet_versions
  set render_freeze_status = case when p_success then 'rendered' else 'failed' end
  where id = v_source.id;

  if p_success then
    if p_generated_version_id is null then raise exception 'Generated version is required to complete a render freeze.'; end if;
    update public.document_packet_versions
    set
      render_source_version_id = v_source.id,
      render_source_fingerprint = v_source.render_content_fingerprint,
      validation_summary_json = coalesce(validation_summary_json, '{}'::jsonb) || jsonb_build_object(
        'editable_render_freeze', jsonb_build_object(
          'contract', 'c4-v1',
          'freezeId', p_freeze_id,
          'sourceVersionId', v_source.id,
          'sourceVersionNumber', v_source.version_number,
          'contentFingerprint', v_source.render_content_fingerprint,
          'frozenAt', v_source.render_frozen_at
        )
      )
    where id = p_generated_version_id and packet_id = p_packet_id;
    if not found then raise exception 'Generated packet version not found.' using errcode = 'P0002'; end if;
  end if;

  insert into public.document_packet_events (
    packet_id, organisation_id, version_id, event_type, event_payload_json, created_by
  )
  select p.id, p.organisation_id, coalesce(p_generated_version_id, v_source.id),
    case when p_success then 'editable_revision_rendered' else 'editable_revision_render_failed' end,
    jsonb_build_object(
      'contract', 'c4-v1',
      'freezeId', p_freeze_id,
      'sourceVersionId', v_source.id,
      'generatedVersionId', p_generated_version_id,
      'contentFingerprint', v_source.render_content_fingerprint,
      'failureMessage', nullif(trim(p_failure_message), '')
    ), v_actor
  from public.document_packets p where p.id = p_packet_id;

  return jsonb_build_object(
    'contract', 'c4-v1',
    'freezeId', p_freeze_id,
    'status', case when p_success then 'rendered' else 'failed' end,
    'sourceVersionId', v_source.id,
    'generatedVersionId', p_generated_version_id,
    'contentFingerprint', v_source.render_content_fingerprint
  );
end;
$$;

revoke all on function public.bridge_complete_editable_render_freeze_c4(uuid, uuid, uuid, boolean, text) from public, anon;
grant execute on function public.bridge_complete_editable_render_freeze_c4(uuid, uuid, uuid, boolean, text) to authenticated, service_role;

-- This is the only OTP D1→D3/C4 promotion API.  The renderer creates its
-- generated version and document row as service_role, then calls this wrapper
-- in the same server-owned authority boundary.  A failure rolls back the full
-- chain, so no partial certified OTP exists.
create or replace function public.bridge_seal_canonical_otp_pdf_phase2(
  p_packet_id uuid,
  p_freeze_id uuid,
  p_generated_version_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_packet public.document_packets%rowtype;
  v_version public.document_packet_versions%rowtype;
  v_d1 jsonb;
  v_d2 jsonb;
  v_d3 jsonb;
  v_c4 jsonb;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Canonical OTP PDF sealing requires the rendering service.'
      using errcode = '42501', detail = 'PHASE2_OTP_CANONICAL_SEAL_SERVICE_ONLY';
  end if;

  select * into v_packet
  from public.document_packets
  where id = p_packet_id
  for update;
  if not found or lower(coalesce(v_packet.packet_type, '')) <> 'otp' then
    raise exception 'Offer to Purchase packet not found.' using errcode = 'P0002';
  end if;
  if v_packet.transaction_id is null then
    raise exception 'An Offer to Purchase must have a transaction before its PDF can be certified.'
      using errcode = '22000', detail = 'PHASE2_OTP_TRANSACTION_REQUIRED';
  end if;

  select * into v_version
  from public.document_packet_versions
  where id = p_generated_version_id and packet_id = p_packet_id
  for update;
  if not found
     or v_version.organisation_id is distinct from v_packet.organisation_id
     or v_version.version_number is distinct from v_packet.current_version_number
     or lower(coalesce(v_version.render_status, '')) <> 'generated'
     or v_version.rendered_document_id is null then
    raise exception 'The current generated OTP version is not available for canonical sealing.'
      using errcode = '22000', detail = 'PHASE2_OTP_GENERATED_VERSION_INVALID';
  end if;

  select public.bridge_verify_frozen_render_output_d1(
    p_packet_id, p_freeze_id, p_generated_version_id
  ) into v_d1;
  if coalesce((v_d1->>'verified')::boolean, false) is not true then
    raise exception 'OTP D1 verification did not complete.' using errcode = '22000', detail = 'PHASE2_OTP_D1_FAILED';
  end if;

  select public.bridge_verify_native_pdf_render_d2(
    p_packet_id, p_freeze_id, p_generated_version_id
  ) into v_d2;
  if coalesce((v_d2->>'verified')::boolean, false) is not true then
    raise exception 'OTP D2 verification did not complete.' using errcode = '22000', detail = 'PHASE2_OTP_D2_FAILED';
  end if;

  select public.bridge_persist_transaction_pdf_d3(
    p_packet_id, p_generated_version_id
  ) into v_d3;
  if coalesce((v_d3->>'persisted')::boolean, false) is not true then
    raise exception 'OTP D3 transaction persistence did not complete.' using errcode = '22000', detail = 'PHASE2_OTP_D3_FAILED';
  end if;

  select public.bridge_complete_editable_render_freeze_c4(
    p_packet_id, p_freeze_id, p_generated_version_id, true, null
  ) into v_c4;
  if coalesce(v_c4->>'status', '') <> 'rendered' then
    raise exception 'OTP C4 render-freeze completion did not complete.' using errcode = '22000', detail = 'PHASE2_OTP_C4_FAILED';
  end if;

  return jsonb_build_object(
    'contract', 'phase2-canonical-otp-pdf-v1',
    'sealed', true,
    'packetId', p_packet_id,
    'versionId', p_generated_version_id,
    'freezeId', p_freeze_id,
    'd1', v_d1,
    'd2', v_d2,
    'd3', v_d3,
    'c4', v_c4
  );
end;
$$;

revoke all on function public.bridge_seal_canonical_otp_pdf_phase2(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.bridge_seal_canonical_otp_pdf_phase2(uuid, uuid, uuid) to service_role;

comment on function public.bridge_seal_canonical_otp_pdf_phase2(uuid, uuid, uuid) is
  'Phase 2 service-only OTP PDF seal: D1 frozen-input verification, D2 native-PDF verification, D3 transaction link, and C4 completion are one atomic authority boundary.';

-- The original E4 key intentionally treated an initial dispatch as an
-- envelope-wide action.  That is not safe for OTP delivery: each required
-- signer has a distinct invitation, provider message and delivery receipt.
-- Keep the mandate key behaviour untouched, but make an OTP dispatch
-- role-targeted.  Initial OTP authorisation is idempotent per signer; every
-- resend is a separately auditable, role-scoped provider delivery attempt.
create or replace function public.bridge_authorize_applied_envelope_dispatch_e4(
  p_packet_id uuid,
  p_version_id uuid,
  p_regenerate boolean default false,
  p_target_signer_role text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_packet public.document_packets%rowtype;
  v_version public.document_packet_versions%rowtype;
  v_layout public.document_signing_field_layouts%rowtype;
  v_dispatch public.document_signing_dispatches%rowtype;
  v_actor uuid := auth.uid();
  v_kind text := case when p_regenerate then 'resend' else 'initial' end;
  v_target text := nullif(lower(trim(p_target_signer_role)), '');
  v_packet_type text;
  v_key text;
  v_field_count integer;
  v_mismatch_count integer;
begin
  if auth.role() <> 'service_role' and not public.bridge_can_access_legal_packet_h2(p_packet_id) then
    raise exception 'Packet signing dispatch is not available.' using errcode = '42501';
  end if;

  select * into v_packet from public.document_packets where id = p_packet_id for update;
  if not found then raise exception 'Document packet not found.' using errcode = 'P0002'; end if;
  v_packet_type := lower(coalesce(v_packet.packet_type, ''));

  select * into v_version from public.document_packet_versions where id = p_version_id and packet_id = p_packet_id;
  if not found then raise exception 'Packet version not found.' using errcode = 'P0002'; end if;
  select * into v_layout from public.document_signing_field_layouts where packet_version_id = p_version_id and packet_id = p_packet_id;
  if not found or v_layout.status <> 'applied' or not coalesce(v_layout.placement_verified, false) then
    raise exception 'The E3-applied visual signing layout is required before dispatch.'
      using errcode = '22000', detail = 'E4_APPLIED_LAYOUT_REQUIRED';
  end if;
  if not coalesce(v_version.transaction_pdf_persisted, false) or not coalesce(v_version.native_pdf_verified, false) then
    raise exception 'The certified PDF is not dispatchable.' using errcode = '22000', detail = 'E4_CERTIFIED_PDF_REQUIRED';
  end if;

  select count(*) into v_field_count from public.document_signing_fields
  where packet_id = p_packet_id and packet_version_id = p_version_id;
  select count(*) into v_mismatch_count
  from jsonb_array_elements(v_layout.fields_json) layout_field
  where not exists (
    select 1 from public.document_signing_fields signing_field
    where signing_field.packet_id = p_packet_id and signing_field.packet_version_id = p_version_id
      and signing_field.signer_role = layout_field->>'signerRole'
      and signing_field.field_type = layout_field->>'fieldType'
      and signing_field.page_number = (layout_field->>'pageNumber')::integer
      and signing_field.x_position = (layout_field->>'xPosition')::numeric
      and signing_field.y_position = (layout_field->>'yPosition')::numeric
      and signing_field.width = (layout_field->>'width')::numeric
      and signing_field.height = (layout_field->>'height')::numeric
      and signing_field.required = coalesce((layout_field->>'required')::boolean, true)
  );
  if v_field_count <> jsonb_array_length(v_layout.fields_json) or v_mismatch_count > 0 then
    raise exception 'The signing fields no longer match the applied visual layout.'
      using errcode = '22000', detail = 'E4_APPLIED_LAYOUT_FIELD_MISMATCH';
  end if;

  if v_packet_type = 'otp' and v_target is null then
    raise exception 'An OTP signing dispatch must name the signer role receiving this invitation.'
      using errcode = '22000', detail = 'PHASE2_OTP_E4_TARGET_SIGNER_REQUIRED';
  end if;

  if v_target is not null and not exists (
    select 1
    from public.document_packet_signers signer
    where signer.packet_id = p_packet_id
      and signer.packet_version_id = p_version_id
      and lower(trim(signer.signer_role)) = v_target
  ) then
    raise exception 'The requested signing recipient is not in this envelope.' using errcode = '22000', detail = 'E4_TARGET_SIGNER_MISSING';
  end if;

  if v_packet_type = 'otp' and not exists (
    select 1
    from public.document_signing_fields signing_field
    where signing_field.packet_id = p_packet_id
      and signing_field.packet_version_id = p_version_id
      and lower(trim(signing_field.signer_role)) = v_target
      and signing_field.field_type = 'signature'
      and signing_field.required is true
  ) then
    raise exception 'The OTP signing recipient has no required signature field in the applied envelope.'
      using errcode = '22000', detail = 'PHASE2_OTP_E4_TARGET_SIGNATURE_REQUIRED';
  end if;

  -- Mandates retain their legacy single initial-envelope key.  OTP initial
  -- dispatches are separate by signer role, while each OTP resend is also
  -- explicitly role scoped and receives its own provider-delivery attempt.
  v_key := case
    when v_packet_type = 'otp' and p_regenerate then p_version_id::text || ':resend:' || v_target || ':' || gen_random_uuid()::text
    when v_packet_type = 'otp' then p_version_id::text || ':initial:' || v_target
    when p_regenerate then p_version_id::text || ':resend:' || coalesce(v_target, 'all') || ':' || gen_random_uuid()::text
    else p_version_id::text || ':initial'
  end;

  insert into public.document_signing_dispatches (
    organisation_id, packet_id, packet_version_id, layout_id, layout_revision, dispatch_kind,
    target_signer_role, idempotency_key, status, authorized_by
  ) values (
    v_packet.organisation_id, v_packet.id, v_version.id, v_layout.id, v_layout.revision, v_kind,
    v_target, v_key, 'authorized', v_actor
  )
  on conflict (idempotency_key) do update set updated_at = now()
  returning * into v_dispatch;

  insert into public.document_packet_events (
    packet_id, organisation_id, version_id, event_type, event_payload_json, created_by
  ) values (
    v_packet.id, v_packet.organisation_id, v_version.id, 'signing_dispatch_authorized',
    jsonb_build_object(
      'contract', 'e4-v1',
      'dispatchId', v_dispatch.id,
      'layoutId', v_layout.id,
      'layoutRevision', v_layout.revision,
      'kind', v_kind,
      'targetSignerRole', v_target,
      'alreadyDelivered', v_dispatch.status = 'delivered'
    ), v_actor
  );

  return jsonb_build_object(
    'contract', 'e4-v1', 'authorized', true, 'dispatchId', v_dispatch.id, 'status', v_dispatch.status,
    'alreadyDelivered', v_dispatch.status = 'delivered', 'layoutId', v_layout.id, 'layoutRevision', v_layout.revision,
    'packetId', v_packet.id, 'versionId', v_version.id, 'kind', v_kind, 'targetSignerRole', v_target
  );
end;
$$;

revoke all on function public.bridge_authorize_applied_envelope_dispatch_e4(uuid, uuid, boolean, text) from public, anon;
grant execute on function public.bridge_authorize_applied_envelope_dispatch_e4(uuid, uuid, boolean, text) to authenticated, service_role;

-- Provider-confirmed OTP delivery mirrors the Phase 0 mandate transaction but
-- requires an E4 dispatch and the OTP-specific transaction/canonical-PDF
-- binding.  No browser may mark an invitation or dispatch as delivered.
create or replace function public.bridge_record_otp_signing_delivery_phase2(
  p_packet_id uuid,
  p_version_id uuid,
  p_signer_id uuid,
  p_signing_token text,
  p_provider_message_id text,
  p_delivery_evidence jsonb default '{}'::jsonb,
  p_dispatch_id uuid default null,
  p_is_resend boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_packet public.document_packets%rowtype;
  v_version public.document_packet_versions%rowtype;
  v_document public.documents%rowtype;
  v_signer public.document_packet_signers%rowtype;
  v_dispatch public.document_signing_dispatches%rowtype;
  v_layout public.document_signing_field_layouts%rowtype;
  v_event_id uuid;
  v_now timestamptz := now();
  v_next_packet_status text;
  v_event_type text;
  v_signing_status text;
  v_evidence jsonb;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service-role invitation delivery authority is required.' using errcode = '42501';
  end if;
  if nullif(trim(p_provider_message_id), '') is null then
    raise exception 'A provider message identifier is required before recording delivery.'
      using errcode = '22000', detail = 'PHASE2_PROVIDER_EVIDENCE_REQUIRED';
  end if;
  if jsonb_typeof(coalesce(p_delivery_evidence, '{}'::jsonb)) <> 'object' then
    raise exception 'Delivery evidence must be a JSON object.'
      using errcode = '22023', detail = 'PHASE2_DELIVERY_EVIDENCE_INVALID';
  end if;
  if p_dispatch_id is null then
    raise exception 'An E4 signing dispatch is required before recording OTP delivery.'
      using errcode = '22000', detail = 'PHASE2_E4_DISPATCH_REQUIRED';
  end if;

  select * into v_packet
  from public.document_packets
  where id = p_packet_id
  for update;
  if not found or lower(coalesce(v_packet.packet_type, '')) <> 'otp' then
    raise exception 'Offer to Purchase packet not found.' using errcode = 'P0002';
  end if;
  if v_packet.transaction_id is null then
    raise exception 'An Offer to Purchase must have a transaction before signing delivery.'
      using errcode = '22000', detail = 'PHASE2_OTP_TRANSACTION_REQUIRED';
  end if;

  select * into v_version
  from public.document_packet_versions
  where id = p_version_id and packet_id = p_packet_id
  for update;
  if not found
     or v_version.organisation_id is distinct from v_packet.organisation_id
     or v_version.version_number is distinct from v_packet.current_version_number
     or lower(coalesce(v_version.render_status, '')) <> 'generated'
     or not coalesce(v_version.render_input_verified, false)
     or not coalesce(v_version.transaction_pdf_persisted, false)
     or not coalesce(v_version.native_pdf_verified, false)
     or coalesce(v_version.rendered_file_bucket, '') = ''
     or coalesce(v_version.rendered_file_path, '') = ''
     or coalesce(v_version.rendered_media_type, '') <> 'application/pdf'
     or coalesce(v_version.rendered_sha256, '') !~ '^sha256:[0-9a-f]{64}$' then
    raise exception 'The exact current OTP version has no certified PDF for signing delivery.'
      using errcode = '22000', detail = 'PHASE2_CERTIFIED_PDF_REQUIRED';
  end if;

  select * into v_document
  from public.documents
  where id = v_version.rendered_document_id
    and legal_packet_id = v_packet.id
    and legal_packet_version_id = v_version.id;
  if not found
     or v_document.transaction_id is distinct from v_packet.transaction_id
     or coalesce(v_document.generated_artifact_bucket, '') <> v_version.rendered_file_bucket
     or coalesce(v_document.file_path, '') <> v_version.rendered_file_path
     or coalesce(v_document.generated_artifact_sha256, '') <> v_version.rendered_sha256 then
    raise exception 'The certified OTP PDF document link is unavailable for signing delivery.'
      using errcode = '22000', detail = 'PHASE2_CERTIFIED_PDF_LINK_INVALID';
  end if;

  select * into v_signer
  from public.document_packet_signers
  where id = p_signer_id
    and packet_id = p_packet_id
    and packet_version_id = p_version_id
    and signing_token = nullif(trim(p_signing_token), '')
  for update;
  if not found
     or v_signer.organisation_id is distinct from v_packet.organisation_id
     or v_signer.token_expires_at is null
     or v_signer.token_expires_at <= v_now then
    raise exception 'The exact OTP signer invitation is no longer active.'
      using errcode = '22000', detail = 'PHASE2_SIGNER_BINDING_INVALID';
  end if;

  select * into v_dispatch
  from public.document_signing_dispatches
  where id = p_dispatch_id
  for update;
  if not found
     or v_dispatch.packet_id is distinct from p_packet_id
     or v_dispatch.packet_version_id is distinct from p_version_id
     or nullif(lower(trim(coalesce(v_dispatch.target_signer_role, ''))), '') is null
     or lower(trim(v_dispatch.target_signer_role)) <> lower(trim(v_signer.signer_role))
     or v_dispatch.status not in ('authorized', 'delivered')
     or v_dispatch.dispatch_kind is distinct from case when coalesce(p_is_resend, false) then 'resend' else 'initial' end then
    raise exception 'The E4 signing dispatch is not bound to this OTP signer invitation.'
      using errcode = '22000', detail = 'PHASE2_E4_DISPATCH_BINDING_INVALID';
  end if;

  select * into v_layout
  from public.document_signing_field_layouts
  where id = v_dispatch.layout_id
    and packet_id = p_packet_id
    and packet_version_id = p_version_id
    and revision = v_dispatch.layout_revision
    and status = 'applied'
    and placement_verified is true;
  if not found then
    raise exception 'The E4 dispatch has no verified applied signing layout.'
      using errcode = '22000', detail = 'PHASE2_E4_LAYOUT_INVALID';
  end if;

  if not exists (
    select 1
    from public.document_signing_fields field
    where field.packet_id = p_packet_id
      and field.packet_version_id = p_version_id
      and field.signer_role = v_signer.signer_role
      and field.field_type = 'signature'
      and field.required is true
      and (coalesce(trim(field.signer_email), '') = '' or lower(trim(field.signer_email)) = lower(trim(v_signer.signer_email)))
  ) then
    raise exception 'The OTP signer has no required signature field in the applied envelope.'
      using errcode = '22000', detail = 'PHASE2_SIGNER_FIELD_BINDING_INVALID';
  end if;

  if v_dispatch.status = 'delivered' then
    if coalesce(v_signer.status, '') not in ('sent', 'viewed') then
      raise exception 'A delivered OTP dispatch has no active delivered signer.'
        using errcode = '22000', detail = 'PHASE2_DISPATCH_SIGNER_STATE_INVALID';
    end if;
    if nullif(trim(coalesce(v_dispatch.delivery_evidence_json->>'providerMessageId', '')), '')
       is distinct from trim(p_provider_message_id) then
      raise exception 'The delivered OTP dispatch belongs to a different provider message.'
        using errcode = '22000', detail = 'PHASE2_DELIVERY_IDEMPOTENCY_MISMATCH';
    end if;
    return jsonb_build_object(
      'contract', 'phase2-otp-signing-delivery-v1',
      'recorded', true,
      'idempotent', true,
      'packetId', v_packet.id,
      'packetVersionId', v_version.id,
      'packetStatus', v_packet.status,
      'signerId', v_signer.id,
      'signerStatus', v_signer.status,
      'dispatchId', v_dispatch.id,
      'providerMessageId', v_dispatch.delivery_evidence_json->>'providerMessageId',
      'deliveryEvidence', coalesce(v_dispatch.delivery_evidence_json, '{}'::jsonb)
    );
  end if;

  if p_is_resend then
    if coalesce(v_signer.status, '') not in ('sent', 'viewed') then
      raise exception 'An OTP resend requires an already active signer invitation.'
        using errcode = '22000', detail = 'PHASE2_RESEND_SIGNER_NOT_ACTIVE';
    end if;
  elsif coalesce(v_signer.status, '') <> 'ready_to_send' then
    raise exception 'The OTP signer was not waiting for provider-confirmed delivery.'
      using errcode = '22000', detail = 'PHASE2_SIGNER_NOT_READY_TO_SEND';
  end if;

  if coalesce(v_packet.status, '') not in ('signing_prep', 'signing_prepared', 'ready_to_send', 'sent', 'partially_signed') then
    raise exception 'The OTP packet is not in an active signing delivery lifecycle.'
      using errcode = '22000', detail = 'PHASE2_PACKET_NOT_DELIVERABLE';
  end if;

  v_next_packet_status := case
    when v_packet.status in ('signing_prep', 'signing_prepared', 'ready_to_send') then 'sent'
    else v_packet.status
  end;
  v_signing_status := case
    when lower(coalesce(v_signer.signer_role, '')) in ('purchaser_1', 'purchaser_2', 'buyer_spouse') then 'sent_to_purchaser'
    when lower(coalesce(v_signer.signer_role, '')) in ('seller', 'seller_spouse') then 'sent_to_seller'
    else 'sent_for_signature'
  end;
  v_evidence := jsonb_strip_nulls(coalesce(p_delivery_evidence, '{}'::jsonb) || jsonb_build_object(
    'contract', 'phase2-otp-signing-delivery-v1',
    'provider', coalesce(nullif(trim(p_delivery_evidence->>'provider'), ''), 'resend'),
    'providerMessageId', trim(p_provider_message_id),
    'signerId', v_signer.id,
    'signerRole', v_signer.signer_role,
    'packetId', v_packet.id,
    'packetVersionId', v_version.id,
    'dispatchId', v_dispatch.id,
    'recordedAt', v_now,
    'resend', coalesce(p_is_resend, false),
    'emailConfirmed', true
  ));

  update public.document_packet_signers
  set status = case when v_signer.status = 'viewed' then 'viewed' else 'sent' end
  where id = v_signer.id
  returning * into v_signer;

  update public.document_packets
  set
    status = v_next_packet_status,
    sent_at = case when v_next_packet_status = 'sent' then coalesce(sent_at, v_now) else sent_at end,
    source_context_json = (coalesce(source_context_json, '{}'::jsonb) - 'mandateStatus') || jsonb_strip_nulls(jsonb_build_object(
      'signingDeliveryLastAt', v_now,
      'signingDeliveryLastSignerId', v_signer.id,
      'signingDeliveryLastProviderMessageId', trim(p_provider_message_id),
      'signingDeliveryLastResend', coalesce(p_is_resend, false),
      'signing_status', v_signing_status,
      'signingStatus', v_signing_status,
      'otpStatus', v_signing_status,
      'lifecycle_state', case when v_next_packet_status = 'sent' then 'sent' else null end
    ))
  where id = v_packet.id
  returning * into v_packet;

  update public.document_signing_dispatches
  set
    status = 'delivered',
    delivery_evidence_json = v_evidence,
    completed_at = coalesce(completed_at, v_now),
    updated_at = v_now
  where id = v_dispatch.id
  returning * into v_dispatch;

  v_event_type := case when coalesce(p_is_resend, false) then 'otp_signing_email_resent' else 'otp_signing_email_sent' end;
  insert into public.document_packet_events (
    packet_id, organisation_id, version_id, event_type, event_payload_json, created_by, created_at
  ) values (
    v_packet.id, v_packet.organisation_id, v_version.id, v_event_type,
    v_evidence || jsonb_build_object('dispatchId', v_dispatch.id, 'packetStatus', v_packet.status, 'signerStatus', v_signer.status),
    null, v_now
  ) returning id into v_event_id;

  return jsonb_build_object(
    'contract', 'phase2-otp-signing-delivery-v1',
    'recorded', true,
    'idempotent', false,
    'packetId', v_packet.id,
    'packetVersionId', v_version.id,
    'packetStatus', v_packet.status,
    'signerId', v_signer.id,
    'signerStatus', v_signer.status,
    'dispatchId', v_dispatch.id,
    'eventId', v_event_id,
    'providerMessageId', trim(p_provider_message_id),
    'deliveredAt', v_now,
    'deliveryEvidence', v_evidence
  );
end;
$$;

revoke all on function public.bridge_record_otp_signing_delivery_phase2(uuid, uuid, uuid, text, text, jsonb, uuid, boolean) from public, anon, authenticated;
grant execute on function public.bridge_record_otp_signing_delivery_phase2(uuid, uuid, uuid, text, text, jsonb, uuid, boolean) to service_role;

comment on function public.bridge_record_otp_signing_delivery_phase2(uuid, uuid, uuid, text, text, jsonb, uuid, boolean) is
  'Phase 2 authoritative OTP invitation delivery: provider evidence atomically promotes the exact signer, packet lifecycle, and E4 dispatch over the current D1/D2/D3-certified PDF.';

-- F2 is shared by mandate and OTP.  Keep the common signing fields, but never
-- stamp an OTP as a mandate in source_context_json.  The service-only check is
-- defense in depth in addition to the existing function grant.
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
begin
  if auth.role() <> 'service_role' then
    raise exception 'F2 final artifact recording requires the signing service.' using errcode = '42501';
  end if;

  select * into v_packet
  from public.document_packets
  where id = p_packet_id and organisation_id = p_organisation_id
  for update;
  if not found then raise exception 'F2 final packet was not found.' using errcode = 'P0001'; end if;

  insert into public.legal_final_artifact_evidence (
    organisation_id, packet_id, packet_version_id, bucket, path, file_name, media_type,
    sha256, byte_length, signer_evidence_sha256, field_evidence_sha256, generated_at
  ) values (
    p_organisation_id, p_packet_id, p_packet_version_id, p_bucket, p_path, p_file_name, 'application/pdf',
    p_sha256, p_byte_length, p_signer_evidence_sha256, p_field_evidence_sha256, p_generated_at
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
  values (p_packet_id, p_organisation_id, p_packet_version_id, p_event_type, coalesce(p_event_payload, '{}'::jsonb), p_finalised_by, p_generated_at);
  return v_version;
end;
$$;

revoke all on function public.bridge_record_final_artifact_f2(uuid, uuid, uuid, text, text, text, text, bigint, text, text, timestamptz, text, jsonb, uuid, uuid) from public, anon, authenticated;
grant execute on function public.bridge_record_final_artifact_f2(uuid, uuid, uuid, text, text, text, text, bigint, text, text, timestamptz, text, jsonb, uuid, uuid) to service_role;

commit;
