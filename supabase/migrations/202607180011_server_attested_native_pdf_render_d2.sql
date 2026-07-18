begin;

-- D2: accept a native PDF only when the renderer loaded the C4 freeze from the
-- database itself and its byte-level attestation matches the persisted artifact.

alter table public.document_packet_versions
  add column if not exists native_pdf_verified boolean not null default false,
  add column if not exists native_pdf_verified_at timestamptz,
  add column if not exists native_pdf_renderer_contract text;

create or replace function public.bridge_verify_native_pdf_render_d2(
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
  v_source public.document_packet_versions%rowtype;
  v_generated public.document_packet_versions%rowtype;
  v_validation jsonb;
  v_attestation jsonb;
  v_artifact jsonb;
  v_actor uuid := auth.uid();
begin
  if auth.role() <> 'service_role' and not public.bridge_can_access_legal_packet_h2(p_packet_id) then
    raise exception 'Packet generation authority is required.' using errcode = '42501';
  end if;

  select * into v_source
  from public.document_packet_versions
  where packet_id = p_packet_id and render_freeze_id = p_freeze_id;
  if not found then raise exception 'Frozen render source not found.' using errcode = 'P0002'; end if;

  select * into v_generated
  from public.document_packet_versions
  where packet_id = p_packet_id and id = p_generated_version_id
  for update;
  if not found then raise exception 'Generated packet version not found.' using errcode = 'P0002'; end if;
  if v_generated.render_status <> 'generated' or not coalesce(v_generated.render_input_verified, false) then
    raise exception 'D1 render-input verification must complete before D2.'
      using errcode = '22000', detail = 'D2_RENDER_INPUT_NOT_VERIFIED';
  end if;

  v_validation := coalesce(v_generated.validation_summary_json, '{}'::jsonb);
  v_attestation := coalesce(v_validation->'native_render_attestation', v_validation->'nativeRenderAttestation', '{}'::jsonb);
  v_artifact := coalesce(v_validation->'artifact_provenance', v_validation->'artifactProvenance', '{}'::jsonb);

  if coalesce(v_attestation->>'contract', '') <> 'd2-v1'
     or coalesce(v_attestation->>'inputAuthority', '') <> 'database_frozen_revision'
     or coalesce(v_attestation->>'freezeId', '') <> p_freeze_id::text
     or coalesce(v_attestation->>'sourceVersionId', '') <> v_source.id::text
     or coalesce(v_attestation->>'contentFingerprint', '') <> v_source.render_content_fingerprint
     or coalesce(v_attestation->>'mediaType', '') <> 'application/pdf'
     or coalesce(v_artifact->>'mediaType', '') <> 'application/pdf'
     or coalesce(v_attestation->>'sha256', '') !~ '^sha256:[0-9a-f]{64}$'
     or coalesce(v_attestation->>'sha256', '') <> coalesce(v_artifact->>'sha256', '')
     or coalesce((v_attestation->>'byteLength')::bigint, 0) < 100
     or coalesce((v_attestation->>'byteLength')::bigint, 0) <> coalesce((v_artifact->>'byteLength')::bigint, 0) then
    raise exception 'The generated artifact is not a server-attested PDF from the frozen revision.'
      using errcode = '22000', detail = 'D2_NATIVE_PDF_ATTESTATION_MISMATCH';
  end if;

  update public.document_packet_versions
  set
    native_pdf_verified = true,
    native_pdf_verified_at = now(),
    native_pdf_renderer_contract = v_attestation->>'rendererContract'
  where id = v_generated.id
  returning * into v_generated;

  insert into public.document_packet_events (
    packet_id, organisation_id, version_id, event_type, event_payload_json, created_by
  )
  select p.id, p.organisation_id, v_generated.id, 'native_pdf_render_verified',
    jsonb_build_object(
      'contract', 'd2-v1',
      'freezeId', p_freeze_id,
      'sourceVersionId', v_source.id,
      'generatedVersionId', v_generated.id,
      'rendererContract', v_generated.native_pdf_renderer_contract,
      'sha256', v_attestation->>'sha256',
      'byteLength', (v_attestation->>'byteLength')::bigint,
      'verifiedAt', v_generated.native_pdf_verified_at
    ), v_actor
  from public.document_packets p where p.id = p_packet_id;

  return jsonb_build_object(
    'contract', 'd2-v1',
    'verified', true,
    'freezeId', p_freeze_id,
    'sourceVersionId', v_source.id,
    'generatedVersionId', v_generated.id,
    'rendererContract', v_generated.native_pdf_renderer_contract,
    'sha256', v_attestation->>'sha256',
    'byteLength', (v_attestation->>'byteLength')::bigint,
    'verifiedAt', v_generated.native_pdf_verified_at
  );
end;
$$;

revoke all on function public.bridge_verify_native_pdf_render_d2(uuid, uuid, uuid) from public, anon;
grant execute on function public.bridge_verify_native_pdf_render_d2(uuid, uuid, uuid) to authenticated, service_role;

commit;
