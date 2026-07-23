begin;

-- D4: authorize every preview/download against the D3-certified artifact and
-- return its stable storage identity so the client can mint a short-lived URL.

create or replace function public.bridge_authorize_persisted_pdf_access_d4(
  p_packet_id uuid,
  p_version_id uuid,
  p_purpose text default 'preview'
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
  v_purpose text := lower(coalesce(nullif(trim(p_purpose), ''), 'preview'));
  v_actor uuid := auth.uid();
begin
  if v_purpose not in ('preview', 'download') then
    raise exception 'PDF access purpose must be preview or download.' using errcode = '22023';
  end if;
  if auth.role() <> 'service_role' and not public.bridge_can_access_legal_packet_h2(p_packet_id) then
    raise exception 'Packet PDF access is not available.' using errcode = '42501';
  end if;

  select * into v_packet from public.document_packets where id = p_packet_id;
  if not found then raise exception 'Document packet not found.' using errcode = 'P0002'; end if;
  select * into v_version
  from public.document_packet_versions
  where id = p_version_id and packet_id = p_packet_id;
  if not found then raise exception 'Packet version not found.' using errcode = 'P0002'; end if;
  if not coalesce(v_version.transaction_pdf_persisted, false)
     or not coalesce(v_version.native_pdf_verified, false)
     or coalesce(v_version.rendered_file_bucket, '') = ''
     or coalesce(v_version.rendered_file_path, '') = ''
     or coalesce(v_version.rendered_media_type, '') <> 'application/pdf'
     or coalesce(v_version.rendered_sha256, '') !~ '^sha256:[0-9a-f]{64}$' then
    raise exception 'The selected version has no certified PDF available.'
      using errcode = '22000', detail = 'D4_CERTIFIED_PDF_UNAVAILABLE';
  end if;

  select * into v_document
  from public.documents
  where id = v_version.rendered_document_id
    and legal_packet_id = v_packet.id
    and legal_packet_version_id = v_version.id;
  if not found
     or coalesce(v_document.generated_artifact_bucket, '') <> v_version.rendered_file_bucket
     or coalesce(v_document.file_path, '') <> v_version.rendered_file_path
     or coalesce(v_document.generated_artifact_sha256, '') <> v_version.rendered_sha256 then
    raise exception 'The certified PDF document link is missing or has changed.'
      using errcode = '22000', detail = 'D4_CERTIFIED_PDF_LINK_MISMATCH';
  end if;

  insert into public.document_packet_events (
    packet_id, organisation_id, version_id, event_type, event_payload_json, created_by
  ) values (
    v_packet.id, v_packet.organisation_id, v_version.id, 'certified_pdf_access_authorized',
    jsonb_build_object(
      'contract', 'd4-v1',
      'purpose', v_purpose,
      'documentId', v_document.id,
      'transactionId', v_document.transaction_id,
      'bucket', v_version.rendered_file_bucket,
      'path', v_version.rendered_file_path,
      'sha256', v_version.rendered_sha256
    ), v_actor
  );

  return jsonb_build_object(
    'contract', 'd4-v1',
    'authorized', true,
    'purpose', v_purpose,
    'packetId', v_packet.id,
    'versionId', v_version.id,
    'documentId', v_document.id,
    'transactionId', v_document.transaction_id,
    'bucket', v_version.rendered_file_bucket,
    'path', v_version.rendered_file_path,
    'fileName', v_version.rendered_file_name,
    'mediaType', v_version.rendered_media_type,
    'byteLength', v_version.rendered_byte_length,
    'sha256', v_version.rendered_sha256
  );
end;
$$;

revoke all on function public.bridge_authorize_persisted_pdf_access_d4(uuid, uuid, text) from public, anon;
grant execute on function public.bridge_authorize_persisted_pdf_access_d4(uuid, uuid, text) to authenticated, service_role;

commit;
