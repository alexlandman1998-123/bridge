-- Final seller PDFs are rendered by the signing service and stored privately.
-- This bridge binds those immutable storage objects to the already-created
-- signed document rows. The browser is never an authority for final output.
create or replace function public.bridge_attach_listing_seller_signed_pdf_artifacts(
  p_session_id uuid,
  p_artifacts jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_session public.private_listing_mandate_signing_sessions%rowtype;
  v_document public.private_listing_documents%rowtype;
  v_document_key text;
  v_document_type text;
  v_artifact jsonb;
  v_storage_path text;
  v_file_name text;
  v_media_type text;
  v_sha256 text;
  v_byte_length bigint;
  v_attached jsonb := '{}'::jsonb;
begin
  if jsonb_typeof(coalesce(p_artifacts, '{}'::jsonb)) <> 'object'
    or p_artifacts = '{}'::jsonb then
    raise exception 'At least one server-rendered PDF artifact is required.';
  end if;

  select * into v_session
  from public.private_listing_mandate_signing_sessions
  where id = p_session_id
  for update;

  if not found then
    raise exception 'This signing session is invalid.';
  end if;

  for v_document_key in select jsonb_object_keys(p_artifacts)
  loop
    if v_document_key not in ('disclosure', 'fica', 'mandate')
      or not (v_session.selected_documents ? v_document_key) then
      raise exception 'That PDF is not included in this signing session.';
    end if;
    if not (coalesce(v_session.document_progress, '{}'::jsonb) ? v_document_key) then
      raise exception 'The % document has not been signed yet.', v_document_key;
    end if;

    v_artifact := p_artifacts -> v_document_key;
    v_storage_path := nullif(trim(v_artifact ->> 'storagePath'), '');
    v_file_name := nullif(trim(v_artifact ->> 'fileName'), '');
    v_media_type := lower(nullif(trim(v_artifact ->> 'mediaType'), ''));
    v_sha256 := lower(nullif(trim(v_artifact ->> 'sha256'), ''));
    v_byte_length := coalesce((v_artifact ->> 'byteLength')::bigint, 0);

    if v_storage_path is null
      or v_storage_path <> ('seller-signing/' || v_session.private_listing_id::text || '/' || v_session.id::text || '/signed-' || v_document_key || '.pdf') then
      raise exception 'The signed PDF storage path is invalid.';
    end if;
    if v_file_name is null or v_file_name !~ '^[^/\\]+\.pdf$' then
      raise exception 'The signed PDF file name is invalid.';
    end if;
    if v_media_type <> 'application/pdf' or v_byte_length < 100 then
      raise exception 'The signed PDF artifact is invalid.';
    end if;
    if v_sha256 !~ '^[0-9a-f]{64}$' then
      raise exception 'The signed PDF checksum is invalid.';
    end if;

    v_document_type := case v_document_key
      when 'disclosure' then 'signed_disclosure_form'
      when 'fica' then 'signed_fica_declaration'
      else 'signed_mandate'
    end;

    select * into v_document
    from public.private_listing_documents
    where signing_session_id = v_session.id
      and document_type = v_document_type
    for update;

    if not found then
      raise exception 'The signed % document row is missing.', v_document_key;
    end if;
    if nullif(trim(v_document.storage_path), '') is not null
      and v_document.storage_path <> v_storage_path then
      raise exception 'The signed % PDF artifact is immutable.', v_document_key;
    end if;

    update public.private_listing_documents
    set storage_path = v_storage_path,
        file_url = null,
        generated_file_name = v_file_name,
        document_name = v_file_name,
        updated_at = now()
    where id = v_document.id
      and (storage_path is null or storage_path = v_storage_path);

    v_attached := v_attached || jsonb_build_object(v_document_key, jsonb_build_object(
      'documentId', v_document.id,
      'storagePath', v_storage_path,
      'fileName', v_file_name,
      'mediaType', v_media_type,
      'byteLength', v_byte_length,
      'sha256', v_sha256
    ));
  end loop;

  return jsonb_build_object(
    'signingSessionId', v_session.id,
    'artifacts', v_attached,
    'serverRendered', true
  );
end;
$$;

revoke all on function public.bridge_attach_listing_seller_signed_pdf_artifacts(uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.bridge_attach_listing_seller_signed_pdf_artifacts(uuid, jsonb)
  to service_role;

comment on function public.bridge_attach_listing_seller_signed_pdf_artifacts(uuid, jsonb) is
  'Binds deterministic server-rendered signed PDFs to seller document rows without allowing browser-generated final artifacts or path replacement.';
