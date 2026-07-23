begin;

-- Staging retained the Phase 1 seller portal contract but was missing the
-- Phase 4 final-artifact helpers.  Restore the narrowly scoped pure helpers
-- before replacing the public wrapper, so adding transaction tracking never
-- turns the signed-document fence into a portal outage or a data exposure.
create or replace function public.bridge_is_seller_portal_final_artifact_document_phase4(
  p_document jsonb,
  p_final_path text,
  p_final_url text,
  p_document_id text
)
returns boolean
language sql
immutable
set search_path = public
as $$
  select coalesce(
    (p_final_path is not null and coalesce(
      p_document ->> 'storage_path', p_document ->> 'storagePath',
      p_document ->> 'file_path', p_document ->> 'filePath', ''
    ) = p_final_path)
    or (p_final_url is not null and coalesce(
      p_document ->> 'file_url', p_document ->> 'fileUrl',
      p_document ->> 'url', p_document ->> 'signedUrl', ''
    ) = p_final_url)
    or (p_document_id is not null and coalesce(p_document ->> 'id', '') = p_document_id)
    or lower(coalesce(p_document ->> 'stage_key', p_document ->> 'stageKey', '')) = 'final_signed'
    or lower(coalesce(p_document ->> 'document_type', p_document ->> 'documentType', ''))
      in ('signed_mandate', 'final_signed', 'final_signed_mandate', 'mandate_signature')
    or (
      lower(coalesce(p_document ->> 'category', '')) like '%mandate%'
      and lower(coalesce(p_document ->> 'document_name', p_document ->> 'file_name', '')) like '%signed%'
      and coalesce(
        p_document ->> 'storage_path', p_document ->> 'storagePath',
        p_document ->> 'file_path', p_document ->> 'filePath',
        p_document ->> 'file_url', p_document ->> 'fileUrl',
        p_document ->> 'url', p_document ->> 'signedUrl', ''
      ) <> ''
    )
    or coalesce(p_document ->> 'canonicalFinalArtifact', 'false') = 'true',
    false
  );
$$;

create or replace function public.bridge_strip_seller_portal_final_artifact_fields_phase4(
  p_value jsonb
)
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
begin
  case jsonb_typeof(p_value)
    when 'object' then
      return coalesce((
        select jsonb_object_agg(
          item.key,
          public.bridge_strip_seller_portal_final_artifact_fields_phase4(item.value)
        )
        from jsonb_each(p_value) as item(key, value)
        where lower(item.key) not in (
          'finalsignedfilepath', 'final_signed_file_path',
          'finalsignedfilebucket', 'final_signed_file_bucket',
          'finalsignedfileurl', 'final_signed_file_url',
          'finalsignedfileaccessurl', 'final_signed_file_access_url',
          'finalsigneddownloadurl', 'final_signed_download_url',
          'generatedpreviewfilepath', 'generated_preview_file_path',
          'generatedpreviewfilebucket', 'generated_preview_file_bucket',
          'generatedpreviewfileurl', 'generated_preview_file_url',
          'renderedfilepath', 'rendered_file_path',
          'renderedfilebucket', 'rendered_file_bucket',
          'renderedfileurl', 'rendered_file_url',
          'finalartifact', 'final_artifact',
          'finalartifactpath', 'final_artifact_path',
          'finalartifactbucket', 'final_artifact_bucket',
          'finalsignedartifactpath', 'final_signed_artifact_path',
          'finalsignedartifactbucket', 'final_signed_artifact_bucket',
          'mandatesigneddocumentpath', 'mandate_signed_document_path',
          'mandatesigneddocumenturl', 'mandate_signed_document_url',
          'mandatesigneddocumentbucket', 'mandate_signed_document_bucket',
          'mandatesignedfilepath', 'mandate_signed_file_path',
          'mandatesignedfilebucket', 'mandate_signed_file_bucket',
          'mandatesignedfileurl', 'mandate_signed_file_url',
          'signedmandateurl', 'signed_mandate_url',
          'mandatesignedurl', 'mandate_signed_url',
          'mandateurl', 'mandate_url'
        )
      ), '{}'::jsonb);
    when 'array' then
      return coalesce((
        select jsonb_agg(public.bridge_strip_seller_portal_final_artifact_fields_phase4(item.value))
        from jsonb_array_elements(p_value) as item(value)
      ), '[]'::jsonb);
    else
      return p_value;
  end case;
end;
$$;

create or replace function public.bridge_strip_seller_portal_final_artifact_values_phase4(
  p_value jsonb,
  p_final_path text,
  p_final_url text
)
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
begin
  case jsonb_typeof(p_value)
    when 'object' then
      return coalesce((
        select jsonb_object_agg(
          item.key,
          public.bridge_strip_seller_portal_final_artifact_values_phase4(
            item.value,
            p_final_path,
            p_final_url
          )
        )
        from jsonb_each(p_value) as item(key, value)
        where not (
          jsonb_typeof(item.value) = 'string'
          and (
            (p_final_path is not null and position(p_final_path in coalesce(item.value #>> '{}', '')) > 0)
            or (p_final_path is not null and position(
              lower(replace(p_final_path, '/', '%2F')) in lower(coalesce(item.value #>> '{}', ''))
            ) > 0)
            or (p_final_url is not null and position(p_final_url in coalesce(item.value #>> '{}', '')) > 0)
          )
        )
      ), '{}'::jsonb);
    when 'array' then
      return coalesce((
        select jsonb_agg(
          public.bridge_strip_seller_portal_final_artifact_values_phase4(
            item.value,
            p_final_path,
            p_final_url
          )
        )
        from jsonb_array_elements(p_value) as item(value)
        where not (
          jsonb_typeof(item.value) = 'string'
          and (
            (p_final_path is not null and position(p_final_path in coalesce(item.value #>> '{}', '')) > 0)
            or (p_final_path is not null and position(
              lower(replace(p_final_path, '/', '%2F')) in lower(coalesce(item.value #>> '{}', ''))
            ) > 0)
            or (p_final_url is not null and position(p_final_url in coalesce(item.value #>> '{}', '')) > 0)
          )
        )
      ), '[]'::jsonb);
    else
      return p_value;
  end case;
end;
$$;

create or replace function public.bridge_sanitize_seller_portal_final_artifact_payload_phase4(
  p_payload jsonb
)
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare
  v_payload jsonb := p_payload;
  v_source_mandate_packet jsonb := '{}'::jsonb;
  v_source_packet jsonb := '{}'::jsonb;
  v_source_version jsonb := '{}'::jsonb;
  v_safe_packet jsonb := '{}'::jsonb;
  v_safe_version jsonb := '{}'::jsonb;
  v_safe_mandate_packet jsonb := 'null'::jsonb;
  v_safe_listing jsonb := '{}'::jsonb;
  v_safe_documents jsonb := '[]'::jsonb;
  v_final_document_descriptor jsonb := 'null'::jsonb;
  v_packet_id text;
  v_version_id text;
  v_document_id text;
  v_final_path text;
  v_final_url text;
  v_final_file_name text;
  v_final_recorded boolean := false;
  v_has_final_document boolean := false;
  v_legacy_document_id text;
begin
  if v_payload is null or jsonb_typeof(v_payload) <> 'object' then
    return v_payload;
  end if;

  if coalesce(v_payload ->> 'authRequired', 'false') = 'true' then
    return public.bridge_strip_seller_portal_final_artifact_fields_phase4(v_payload);
  end if;

  v_source_mandate_packet := case
    when jsonb_typeof(v_payload -> 'mandatePacket') = 'object' then v_payload -> 'mandatePacket'
    when jsonb_typeof(v_payload -> 'mandate_packet') = 'object' then v_payload -> 'mandate_packet'
    else '{}'::jsonb
  end;
  v_source_packet := case
    when jsonb_typeof(v_source_mandate_packet -> 'packet') = 'object' then v_source_mandate_packet -> 'packet'
    else '{}'::jsonb
  end;
  v_source_version := case
    when jsonb_typeof(v_source_mandate_packet -> 'version') = 'object' then v_source_mandate_packet -> 'version'
    else '{}'::jsonb
  end;

  v_packet_id := nullif(trim(coalesce(
    v_source_mandate_packet ->> 'id',
    v_source_mandate_packet ->> 'packetId',
    v_source_mandate_packet ->> 'packet_id',
    v_source_packet ->> 'id',
    ''
  )), '');
  v_version_id := nullif(trim(coalesce(
    v_source_mandate_packet ->> 'packetVersionId',
    v_source_mandate_packet ->> 'packet_version_id',
    v_source_version ->> 'id',
    ''
  )), '');
  v_document_id := nullif(trim(coalesce(
    v_source_mandate_packet ->> 'finalDocumentId',
    v_source_mandate_packet ->> 'final_signed_document_id',
    v_source_version ->> 'final_signed_document_id',
    v_source_version ->> 'finalDocumentId',
    ''
  )), '');
  v_final_path := nullif(trim(coalesce(
    v_source_mandate_packet ->> 'finalSignedFilePath',
    v_source_mandate_packet ->> 'final_signed_file_path',
    v_source_version ->> 'final_signed_file_path',
    v_source_version ->> 'finalSignedFilePath',
    ''
  )), '');
  v_final_url := nullif(trim(coalesce(
    v_source_mandate_packet ->> 'finalSignedDownloadUrl',
    v_source_mandate_packet ->> 'finalSignedFileAccessUrl',
    v_source_mandate_packet ->> 'finalSignedFileUrl',
    v_source_mandate_packet ->> 'final_signed_file_url',
    v_source_version ->> 'final_signed_file_access_url',
    v_source_version ->> 'final_signed_file_url',
    ''
  )), '');
  v_final_file_name := nullif(trim(coalesce(
    v_source_mandate_packet ->> 'finalSignedFileName',
    v_source_mandate_packet ->> 'final_signed_file_name',
    v_source_version ->> 'final_signed_file_name',
    'Signed Mandate.pdf'
  )), '');
  v_final_recorded := v_final_path is not null
    or v_final_url is not null
    or v_document_id is not null
    or lower(coalesce(v_source_mandate_packet ->> 'state', v_source_packet ->> 'status', ''))
      in ('fully_signed', 'signed', 'completed', 'complete', 'finalised', 'finalized');

  v_payload := public.bridge_strip_seller_portal_final_artifact_fields_phase4(v_payload);
  v_payload := public.bridge_strip_seller_portal_final_artifact_values_phase4(
    v_payload,
    v_final_path,
    v_final_url
  );

  v_safe_packet := jsonb_strip_nulls(jsonb_build_object(
    'id', v_packet_id,
    'organisation_id', v_source_packet -> 'organisation_id',
    'packet_type', v_source_packet -> 'packet_type',
    'status', v_source_packet -> 'status',
    'title', v_source_packet -> 'title',
    'transaction_id', v_source_packet -> 'transaction_id',
    'lead_id', v_source_packet -> 'lead_id',
    'unit_id', v_source_packet -> 'unit_id',
    'created_at', v_source_packet -> 'created_at',
    'updated_at', v_source_packet -> 'updated_at',
    'completed_at', v_source_packet -> 'completed_at'
  ));
  v_safe_version := jsonb_strip_nulls(jsonb_build_object(
    'id', v_version_id,
    'packet_id', v_packet_id,
    'version_number', v_source_version -> 'version_number',
    'render_status', v_source_version -> 'render_status',
    'rendered_file_name', v_source_version -> 'rendered_file_name',
    'final_signed_document_id', v_document_id,
    'final_signed_file_name', v_final_file_name,
    'finalised_at', v_source_version -> 'finalised_at',
    'generated_at', v_source_version -> 'generated_at',
    'created_at', v_source_version -> 'created_at'
  ));
  if v_packet_id is not null then
    v_safe_mandate_packet := jsonb_strip_nulls(jsonb_build_object(
      'id', v_packet_id,
      'state', v_source_mandate_packet -> 'state',
      'status', v_source_mandate_packet -> 'status',
      'packetId', v_packet_id,
      'packet', v_safe_packet,
      'version', v_safe_version,
      'packetVersionId', v_version_id,
      'finalDocumentId', v_document_id,
      'finalSignedDocumentId', v_document_id,
      'final_signed_document_id', v_document_id,
      'finalSignedFileName', v_final_file_name,
      'finalSignedRecorded', v_final_recorded,
      'canonicalFinalArtifact', v_final_recorded,
      'generatedPreviewFileName', coalesce(
        v_source_mandate_packet -> 'generatedPreviewFileName',
        v_source_mandate_packet -> 'rendered_file_name',
        v_source_version -> 'rendered_file_name'
      ),
      'signedAt', coalesce(
        v_source_mandate_packet -> 'signedAt',
        v_source_mandate_packet -> 'signed_at',
        v_source_version -> 'finalised_at',
        v_source_packet -> 'completed_at'
      ),
      'updatedAt', coalesce(
        v_source_mandate_packet -> 'updatedAt',
        v_source_mandate_packet -> 'updated_at',
        v_source_packet -> 'updated_at'
      )
    ));
  end if;

  v_safe_listing := coalesce(v_payload -> 'listing', '{}'::jsonb) - array[
    'finalSignedFilePath', 'final_signed_file_path',
    'finalSignedFileBucket', 'final_signed_file_bucket',
    'finalSignedFileUrl', 'final_signed_file_url',
    'finalSignedFileAccessUrl', 'final_signed_file_access_url',
    'finalSignedDownloadUrl', 'final_signed_download_url',
    'finalArtifact', 'final_artifact', 'finalArtifactPath', 'final_artifact_path',
    'finalArtifactBucket', 'final_artifact_bucket', 'finalSignedArtifactPath', 'final_signed_artifact_path',
    'mandateSignedDocumentPath', 'mandate_signed_document_path',
    'mandateSignedDocumentUrl', 'mandate_signed_document_url',
    'mandateSignedDocumentBucket', 'mandate_signed_document_bucket',
    'signedMandateUrl', 'signed_mandate_url', 'mandateSignedUrl', 'mandate_signed_url',
    'mandateUrl', 'mandate_url'
  ];
  if jsonb_typeof(v_safe_listing -> 'mandate') = 'object' then
    v_safe_listing := jsonb_set(
      v_safe_listing,
      '{mandate}',
      (v_safe_listing -> 'mandate') - array[
        'finalSignedFilePath', 'final_signed_file_path',
        'finalSignedFileBucket', 'final_signed_file_bucket',
        'finalSignedFileUrl', 'final_signed_file_url',
        'finalSignedFileAccessUrl', 'final_signed_file_access_url',
        'finalSignedDownloadUrl', 'final_signed_download_url',
        'mandateSignedDocumentPath', 'mandate_signed_document_path',
        'mandateSignedDocumentUrl', 'mandate_signed_document_url',
        'mandateSignedDocumentBucket', 'mandate_signed_document_bucket',
        'signedUrl', 'documentUrl', 'url', 'file_url', 'file_path', 'storage_path'
      ],
      true
    );
  end if;

  select coalesce(jsonb_agg(item.document order by item.ordinality), '[]'::jsonb)
    into v_safe_documents
  from jsonb_array_elements(coalesce(v_payload -> 'documents', '[]'::jsonb)) with ordinality as item(document, ordinality)
  where not public.bridge_is_seller_portal_final_artifact_document_phase4(
    item.document, v_final_path, v_final_url, v_document_id
  );

  select exists (
    select 1
    from jsonb_array_elements(coalesce(v_payload -> 'documents', '[]'::jsonb)) as item(document)
    where public.bridge_is_seller_portal_final_artifact_document_phase4(
      item.document, v_final_path, v_final_url, v_document_id
    )
  ) into v_has_final_document;

  select nullif(trim(item.document ->> 'id'), '')
    into v_legacy_document_id
  from jsonb_array_elements(coalesce(v_payload -> 'documents', '[]'::jsonb)) with ordinality as item(document, ordinality)
  where public.bridge_is_seller_portal_final_artifact_document_phase4(
    item.document, v_final_path, v_final_url, v_document_id
  )
  order by item.ordinality
  limit 1;

  if (v_final_recorded or coalesce(v_has_final_document, false)) and v_packet_id is not null then
    v_final_document_descriptor := jsonb_strip_nulls(jsonb_build_object(
      'id', coalesce(v_legacy_document_id, v_document_id, 'signed-mandate-packet-' || coalesce(v_version_id, v_packet_id)),
      'private_listing_id', v_safe_listing -> 'id',
      'document_type', 'signed_mandate',
      'category', 'Mandate',
      'document_name', coalesce(v_final_file_name, 'Signed Mandate.pdf'),
      'file_name', coalesce(v_final_file_name, 'Signed Mandate.pdf'),
      'canonicalFinalArtifact', true,
      'packet_id', v_packet_id,
      'packet_version_id', v_version_id,
      'finalDocumentId', v_document_id,
      'final_signed_document_id', v_document_id,
      'status', 'finalisation_pending',
      'visibility', 'seller_visible',
      'requirement_key', 'signed_mandate',
      'uploaded_at', coalesce(
        v_source_mandate_packet -> 'signedAt',
        v_source_version -> 'finalised_at',
        v_source_packet -> 'completed_at'
      ),
      'created_at', coalesce(
        v_source_mandate_packet -> 'signedAt',
        v_source_version -> 'finalised_at',
        v_source_packet -> 'completed_at'
      ),
      'updated_at', coalesce(
        v_source_mandate_packet -> 'updatedAt',
        v_source_packet -> 'updated_at'
      ),
      'metadata', jsonb_build_object(
        'source', 'phase4_final_signed_mandate_descriptor',
        'packetId', v_packet_id,
        'packetVersionId', v_version_id,
        'finalDocumentId', v_document_id,
        'synthetic', true
      )
    ));
    v_safe_documents := v_safe_documents || jsonb_build_array(v_final_document_descriptor);
  end if;

  v_payload := v_payload - array[
    'mandatePacket', 'mandate_packet', 'documents', 'listing',
    'finalSignedFilePath', 'final_signed_file_path',
    'finalSignedFileBucket', 'final_signed_file_bucket',
    'finalSignedFileUrl', 'final_signed_file_url',
    'finalSignedFileAccessUrl', 'final_signed_file_access_url',
    'finalSignedDownloadUrl', 'final_signed_download_url',
    'finalArtifact', 'final_artifact', 'finalArtifactPath', 'final_artifact_path',
    'finalArtifactBucket', 'final_artifact_bucket', 'finalSignedArtifactPath', 'final_signed_artifact_path',
    'mandateSignedDocumentPath', 'mandate_signed_document_path',
    'mandateSignedDocumentUrl', 'mandate_signed_document_url',
    'mandateSignedDocumentBucket', 'mandate_signed_document_bucket'
  ];

  return v_payload || jsonb_build_object(
    'listing', v_safe_listing,
    'documents', v_safe_documents,
    'mandatePacket', v_safe_mandate_packet
  );
end;
$$;

create or replace function public.bridge_private_listing_seller_portal_payload(
  p_token text,
  p_access_token text default null,
  p_require_access boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_resolution record;
  v_result jsonb;
  v_listing_id uuid;
  v_transaction_id uuid;
  v_transaction jsonb := null;
begin
  select * into v_resolution
  from public.bridge_resolve_private_listing_seller_portal_token(p_token);
  if not found or not v_resolution.token_valid then
    return null;
  end if;

  v_result := public.bridge_private_listing_seller_portal_payload_phase1(
    v_resolution.legacy_token,
    p_access_token,
    p_require_access
  );
  if v_result is null then
    return null;
  end if;
  if jsonb_typeof(v_result -> 'onboarding') = 'object' then
    v_result := jsonb_set(
      v_result,
      '{onboarding}',
      (v_result -> 'onboarding') - 'seller_portal_invite_token_hash',
      true
    );
  end if;

  if coalesce(v_result ->> 'authRequired', 'false') <> 'true' then
    begin
      v_listing_id := nullif(trim(coalesce(v_result -> 'listing' ->> 'id', '')), '')::uuid;
    exception
      when invalid_text_representation then
        v_listing_id := null;
    end;

    if v_listing_id is not null
      and to_regprocedure('public.bridge_resolve_private_listing_transaction_id(uuid)') is not null then
      v_transaction_id := public.bridge_resolve_private_listing_transaction_id(v_listing_id);
    end if;

    if v_transaction_id is not null then
      select jsonb_strip_nulls(jsonb_build_object(
        'id', tx.id,
        'listing_id', tx.listing_id,
        'stage', tx.stage,
        'current_main_stage', tx.current_main_stage,
        'lifecycle_state', tx.lifecycle_state,
        'attorney', tx.attorney,
        'assigned_attorney_email', tx.assigned_attorney_email,
        'bond_originator', tx.bond_originator,
        'assigned_bond_originator_email', tx.assigned_bond_originator_email,
        'assigned_agent', tx.assigned_agent,
        'assigned_agent_email', tx.assigned_agent_email,
        'created_at', tx.created_at,
        'updated_at', tx.updated_at,
        'completed_at', tx.completed_at,
        'registered_at', tx.registered_at,
        'registration_date', tx.registration_date
      ))
      into v_transaction
      from public.transactions tx
      where tx.id = v_transaction_id;
    end if;
  end if;

  v_result := v_result || jsonb_build_object(
    'transaction', v_transaction,
    'tokenKind', v_resolution.token_kind,
    'stablePortalToken', v_resolution.stable_portal_token,
    'stablePortalPath', '/client/' || v_resolution.stable_portal_token || '/selling',
    'portalAccess', coalesce(v_result -> 'portalAccess', '{}'::jsonb) || jsonb_build_object(
      'tokenKind', v_resolution.token_kind,
      'stablePortalToken', v_resolution.stable_portal_token,
      'stablePortalPath', '/client/' || v_resolution.stable_portal_token || '/selling'
    )
  );

  return public.bridge_sanitize_seller_portal_final_artifact_payload_phase4(v_result);
end;
$$;

revoke all on function public.bridge_private_listing_seller_portal_payload(text, text, boolean)
  from public, anon, authenticated, service_role;
grant execute on function public.bridge_private_listing_seller_portal_payload(text, text, boolean)
  to anon, authenticated;

notify pgrst, 'reload schema';

commit;
