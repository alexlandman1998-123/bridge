begin;

create or replace function public.bridge_certify_native_structured_legal_pdf(
  p_packet_id uuid,
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
  v_template public.document_packet_templates%rowtype;
  v_document public.documents%rowtype;
  v_validation jsonb;
  v_render jsonb;
  v_artifact jsonb;
  v_byte_length bigint;
  v_actor uuid := auth.uid();
begin
  if auth.role() <> 'service_role' and not public.bridge_can_access_legal_packet_h2(p_packet_id) then
    raise exception 'Packet generation authority is required.' using errcode = '42501';
  end if;

  select * into v_packet from public.document_packets where id = p_packet_id for update;
  if not found then raise exception 'Document packet not found.' using errcode = 'P0002'; end if;

  select * into v_version
  from public.document_packet_versions
  where packet_id = p_packet_id and id = p_generated_version_id
  for update;
  if not found then raise exception 'Generated packet version not found.' using errcode = 'P0002'; end if;

  if coalesce(v_version.transaction_pdf_persisted, false) and coalesce(v_version.native_pdf_verified, false) then
    return jsonb_build_object(
      'contract', 'native-structured-d3-v1',
      'certified', true,
      'alreadyCertified', true,
      'packetId', v_packet.id,
      'versionId', v_version.id,
      'documentId', v_version.rendered_document_id,
      'path', v_version.rendered_file_path,
      'sha256', v_version.rendered_sha256
    );
  end if;

  if v_version.render_status <> 'generated' or v_version.rendered_document_id is null then
    raise exception 'A generated document version is required.'
      using errcode = '22000', detail = 'NATIVE_STRUCTURED_CERTIFICATION_VERSION_INVALID';
  end if;

  select * into v_template
  from public.document_packet_templates
  where id = v_packet.template_id;
  if not found then raise exception 'Packet template was not found.' using errcode = 'P0002'; end if;

  v_validation := coalesce(v_version.validation_summary_json, '{}'::jsonb);
  v_render := coalesce(v_validation->'render_provenance', v_validation->'renderProvenance', '{}'::jsonb);
  v_artifact := coalesce(v_validation->'artifact_provenance', v_validation->'artifactProvenance', '{}'::jsonb);
  v_byte_length := coalesce(nullif(v_artifact->>'byteLength', '')::bigint, 0);

  if lower(coalesce(v_packet.packet_type, '')) not in ('otp', 'mandate')
     or lower(coalesce(v_template.status, '')) <> 'published'
     or coalesce(v_template.is_active, false) is not true
     or coalesce(v_render->>'renderMode', '') <> 'native_structured'
     or coalesce(v_render->>'templateId', '') <> v_template.id::text
     or coalesce(v_render->>'legalDocumentScenarioComplete', '') <> 'true'
     or coalesce(v_render->>'conditionalMasterCoverageReady', '') <> 'true'
     or coalesce(v_render->>'conditionalSigningCanPrepare', '') <> 'true'
     or coalesce(v_template.metadata_json->>'legal_review_status', '') <> 'approved'
     or coalesce(v_template.metadata_json->>'legal_approval_content_digest', '') = ''
     or coalesce(v_template.metadata_json->>'legal_approval_content_digest', '') <> coalesce(v_render->>'legalApprovalContentDigest', '')
     or coalesce(v_template.metadata_json->>'legal_b1_manifest_digest', '') = ''
     or coalesce(v_template.metadata_json->>'legal_b1_manifest_digest', '') <> coalesce(v_render->>'legalB1ManifestDigest', '')
     or coalesce(v_template.metadata_json->>'legal_counsel_review_evidence_digest', '') = ''
     or coalesce(v_template.metadata_json->>'legal_counsel_review_evidence_digest', '') <> coalesce(v_render->>'legalCounselReviewEvidenceDigest', '') then
    raise exception 'Native structured legal PDF is not backed by the approved runtime template evidence.'
      using errcode = '22000', detail = 'NATIVE_STRUCTURED_CERTIFICATION_APPROVAL_MISMATCH';
  end if;

  if coalesce(v_artifact->>'bucket', '') = ''
     or coalesce(v_artifact->>'path', '') = ''
     or coalesce(v_artifact->>'mediaType', '') <> 'application/pdf'
     or coalesce(v_artifact->>'sha256', '') !~ '^sha256:[0-9a-f]{64}$'
     or v_byte_length < 100
     or coalesce(v_version.rendered_file_path, '') <> coalesce(v_artifact->>'path', '') then
    raise exception 'Native structured legal PDF artifact evidence is incomplete or inconsistent.'
      using errcode = '22000', detail = 'NATIVE_STRUCTURED_CERTIFICATION_ARTIFACT_INVALID';
  end if;

  select * into v_document
  from public.documents
  where id = v_version.rendered_document_id
  for update;
  if not found then
    raise exception 'The generated PDF document row no longer exists.'
      using errcode = 'P0002', detail = 'NATIVE_STRUCTURED_CERTIFICATION_DOCUMENT_MISSING';
  end if;

  if coalesce(v_document.file_path, '') <> coalesce(v_artifact->>'path', '')
     or (v_packet.transaction_id is not null and v_document.transaction_id is distinct from v_packet.transaction_id) then
    raise exception 'The document row does not belong to this packet transaction or artifact.'
      using errcode = '22000', detail = 'NATIVE_STRUCTURED_CERTIFICATION_DOCUMENT_MISMATCH';
  end if;

  update public.documents
  set
    legal_packet_id = v_packet.id,
    legal_packet_version_id = v_version.id,
    generated_artifact_bucket = v_artifact->>'bucket',
    generated_artifact_media_type = v_artifact->>'mediaType',
    generated_artifact_byte_length = v_byte_length,
    generated_artifact_sha256 = v_artifact->>'sha256',
    visibility_scope = 'shared',
    is_client_visible = true,
    updated_at = now()
  where id = v_document.id
  returning * into v_document;

  update public.document_packet_versions
  set
    rendered_file_bucket = v_artifact->>'bucket',
    rendered_media_type = v_artifact->>'mediaType',
    rendered_byte_length = v_byte_length,
    rendered_sha256 = v_artifact->>'sha256',
    render_input_verified = true,
    render_input_verified_at = coalesce(render_input_verified_at, now()),
    native_pdf_verified = true,
    native_pdf_verified_at = coalesce(native_pdf_verified_at, now()),
    native_pdf_renderer_contract = 'native-structured-template-v1',
    transaction_pdf_persisted = true,
    transaction_pdf_persisted_at = coalesce(transaction_pdf_persisted_at, now())
  where id = v_version.id
  returning * into v_version;

  insert into public.document_packet_events (
    packet_id, organisation_id, version_id, event_type, event_payload_json, created_by
  ) values (
    v_packet.id, v_packet.organisation_id, v_version.id, 'native_structured_legal_pdf_certified',
    jsonb_build_object(
      'contract', 'native-structured-d3-v1',
      'templateId', v_template.id,
      'packetType', v_packet.packet_type,
      'legalApprovalContentDigest', v_template.metadata_json->>'legal_approval_content_digest',
      'legalCounselReviewEvidenceDigest', v_template.metadata_json->>'legal_counsel_review_evidence_digest',
      'b1ManifestDigest', v_template.metadata_json->>'legal_b1_manifest_digest',
      'documentId', v_document.id,
      'bucket', v_version.rendered_file_bucket,
      'path', v_version.rendered_file_path,
      'mediaType', v_version.rendered_media_type,
      'byteLength', v_version.rendered_byte_length,
      'sha256', v_version.rendered_sha256,
      'certifiedAt', v_version.transaction_pdf_persisted_at
    ), v_actor
  );

  return jsonb_build_object(
    'contract', 'native-structured-d3-v1',
    'certified', true,
    'alreadyCertified', false,
    'packetId', v_packet.id,
    'versionId', v_version.id,
    'documentId', v_document.id,
    'bucket', v_version.rendered_file_bucket,
    'path', v_version.rendered_file_path,
    'mediaType', v_version.rendered_media_type,
    'byteLength', v_version.rendered_byte_length,
    'sha256', v_version.rendered_sha256,
    'certifiedAt', v_version.transaction_pdf_persisted_at
  );
end;
$$;

revoke all on function public.bridge_certify_native_structured_legal_pdf(uuid, uuid) from public, anon;
grant execute on function public.bridge_certify_native_structured_legal_pdf(uuid, uuid) to authenticated, service_role;

comment on function public.bridge_certify_native_structured_legal_pdf(uuid, uuid) is
  'Certifies native structured OTP/mandate PDFs for signing only when artifact provenance and B3 legal approval metadata match the active published template.';

commit;
