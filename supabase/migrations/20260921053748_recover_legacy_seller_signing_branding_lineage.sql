-- Permit a narrowly-defined legacy recovery only when the signed pack itself
-- contains the branding that was shown to the signer. The repair remains
-- checksum-bound and never reads today's organisation branding.

create or replace function public.bridge_plan_listing_seller_document_repair(
  p_session_id uuid
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
  v_expected_path text;
  v_document_count integer;
  v_documents jsonb := '{}'::jsonb;
  v_actions jsonb := '[]'::jsonb;
  v_manual_reasons jsonb := '[]'::jsonb;
  v_plan jsonb;
  v_plan_digest text;
  v_branding jsonb;
  v_pack_branding jsonb;
  v_has_authoritative_branding boolean;
  v_has_recoverable_pack_branding boolean;
begin
  select * into v_session
  from public.private_listing_mandate_signing_sessions
  where id = p_session_id;

  if not found then
    raise exception 'The seller signing session was not found.';
  end if;

  v_branding := coalesce(v_session.branding_snapshot, '{}'::jsonb);
  v_pack_branding := coalesce(v_session.signing_pack_snapshot->'branding', '{}'::jsonb);
  v_has_authoritative_branding :=
    v_branding->>'contract' = 'arch9-seller-signing-branding-snapshot-v1'
    and coalesce(v_session.branding_digest, '') ~ '^[0-9a-f]{64}$'
    and lower(coalesce(v_branding->>'digest', '')) = lower(coalesce(v_session.branding_digest, ''));
  v_has_recoverable_pack_branding :=
    coalesce(v_session.branding_digest, '') = ''
    and jsonb_typeof(v_pack_branding) = 'object'
    and nullif(trim(coalesce(v_pack_branding->>'organisationName', '')), '') is not null
    and (
      nullif(trim(coalesce(v_pack_branding->>'primaryColour', '')), '') is not null
      or nullif(trim(coalesce(v_pack_branding->>'secondaryColour', '')), '') is not null
      or nullif(trim(coalesce(v_pack_branding->>'accentColour', '')), '') is not null
    )
    and coalesce(v_session.signing_pack_digest, '') ~ '^[0-9a-f]{64}$';

  if v_session.status <> 'signed' then
    v_manual_reasons := v_manual_reasons || jsonb_build_array('session_not_signed');
  end if;
  if nullif(trim(coalesce(v_session.signed_name, '')), '') is null
    or nullif(trim(coalesce(v_session.signature, '')), '') is null
    or v_session.signed_at is null then
    v_manual_reasons := v_manual_reasons || jsonb_build_array('signature_evidence_incomplete');
  end if;
  if jsonb_typeof(coalesce(v_session.signing_pack_snapshot, '{}'::jsonb)) <> 'object'
    or v_session.signing_pack_snapshot = '{}'::jsonb
    or coalesce(v_session.signing_pack_digest, '') !~ '^[0-9a-f]{64}$' then
    v_manual_reasons := v_manual_reasons || jsonb_build_array('frozen_signing_pack_missing');
  end if;

  if v_has_authoritative_branding then
    if v_pack_branding->>'contract' = 'arch9-seller-signing-branding-snapshot-v1'
      and v_pack_branding is distinct from v_branding then
      v_manual_reasons := v_manual_reasons || jsonb_build_array('signing_pack_branding_mismatch');
    end if;
  elsif v_has_recoverable_pack_branding and v_session.status = 'signed' then
    v_actions := v_actions || jsonb_build_array(jsonb_build_object(
      'action', 'adopt_legacy_pack_branding',
      'source', 'frozen_signing_pack',
      'signingPackDigest', v_session.signing_pack_digest
    ));
  else
    v_manual_reasons := v_manual_reasons || jsonb_build_array('frozen_branding_lineage_missing_or_invalid');
  end if;

  if jsonb_typeof(coalesce(v_session.selected_documents, '[]'::jsonb)) <> 'array'
    or jsonb_array_length(coalesce(v_session.selected_documents, '[]'::jsonb)) = 0 then
    v_manual_reasons := v_manual_reasons || jsonb_build_array('selected_documents_missing');
  else
    for v_document_key in
      select value from jsonb_array_elements_text(v_session.selected_documents)
    loop
      v_document := null;
      if v_document_key not in ('disclosure', 'fica', 'mandate') then
        v_manual_reasons := v_manual_reasons || jsonb_build_array('unsupported_document:' || v_document_key);
        continue;
      end if;
      v_document_type := case v_document_key
        when 'disclosure' then 'signed_disclosure_form'
        when 'fica' then 'signed_fica_declaration'
        else 'signed_mandate'
      end;
      v_expected_path := 'seller-signing/' || v_session.private_listing_id::text || '/' || v_session.id::text || '/signed-' || v_document_key || '.pdf';

      select count(*) into v_document_count
      from public.private_listing_documents
      where signing_session_id = v_session.id
        and document_type = v_document_type;

      select * into v_document
      from public.private_listing_documents
      where signing_session_id = v_session.id
        and document_type = v_document_type
      order by (nullif(trim(storage_path), '') is not null) desc, uploaded_at desc, id
      limit 1;

      if not (coalesce(v_session.document_progress, '{}'::jsonb) ? v_document_key) then
        v_manual_reasons := v_manual_reasons || jsonb_build_array('signed_progress_missing:' || v_document_key);
      end if;
      if v_document_count > 1 then
        v_manual_reasons := v_manual_reasons || jsonb_build_array('ambiguous_duplicate_rows:' || v_document_key);
      elsif v_document_count = 0 then
        v_actions := v_actions || jsonb_build_array(jsonb_build_object(
          'documentKey', v_document_key,
          'action', 'recreate_missing_row_and_render_pdf',
          'expectedStoragePath', v_expected_path
        ));
      elsif nullif(trim(v_document.storage_path), '') is null then
        v_actions := v_actions || jsonb_build_array(jsonb_build_object(
          'documentKey', v_document_key,
          'action', 'render_and_attach_missing_pdf',
          'documentId', v_document.id,
          'expectedStoragePath', v_expected_path
        ));
      elsif v_document.storage_path <> v_expected_path then
        v_manual_reasons := v_manual_reasons || jsonb_build_array('conflicting_storage_path:' || v_document_key);
      else
        v_actions := v_actions || jsonb_build_array(jsonb_build_object(
          'documentKey', v_document_key,
          'action', 'verify_immutable_pdf',
          'documentId', v_document.id,
          'expectedStoragePath', v_expected_path
        ));
      end if;

      v_documents := v_documents || jsonb_build_object(v_document_key, jsonb_build_object(
        'documentType', v_document_type,
        'rowCount', v_document_count,
        'documentId', case when v_document_count > 0 then v_document.id else null end,
        'storagePath', case when v_document_count > 0 then nullif(trim(v_document.storage_path), '') else null end,
        'expectedStoragePath', v_expected_path,
        'progressRecorded', coalesce(v_session.document_progress, '{}'::jsonb) ? v_document_key
      ));
    end loop;
  end if;

  v_plan := jsonb_build_object(
    'contract', 'arch9-seller-document-repair-plan-v1',
    'sessionId', v_session.id,
    'listingId', v_session.private_listing_id,
    'organisationId', v_session.organisation_id,
    'sessionStatus', v_session.status,
    'signingPackDigest', v_session.signing_pack_digest,
    'brandingDigest', v_session.branding_digest,
    'brandingRecoverySource', case when v_has_recoverable_pack_branding then 'frozen_signing_pack' else null end,
    'selectedDocuments', coalesce(v_session.selected_documents, '[]'::jsonb),
    'documents', v_documents,
    'actions', v_actions,
    'manualReviewReasons', v_manual_reasons,
    'automaticRepairAllowed', jsonb_array_length(v_manual_reasons) = 0,
    'preservesSignedRows', true,
    'deletesDocuments', false
  );
  v_plan_digest := encode(extensions.digest(v_plan::text, 'sha256'), 'hex');
  return v_plan || jsonb_build_object('planDigest', v_plan_digest);
end;
$$;

revoke all on function public.bridge_plan_listing_seller_document_repair(uuid)
  from public, anon, authenticated;
grant execute on function public.bridge_plan_listing_seller_document_repair(uuid)
  to service_role;
