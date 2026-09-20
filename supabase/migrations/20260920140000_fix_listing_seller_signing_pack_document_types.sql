-- Correct the atomic seller signing-pack bridge to keep selected_documents
-- JSONB end-to-end. The session column has always been JSONB; the earlier
-- bridge incorrectly coalesced it with a text[] while looking for an overlap.
create or replace function public.bridge_prepare_listing_seller_signing_pack_atomically(
  p_listing_id uuid,
  p_signing_group_id uuid,
  p_sessions jsonb,
  p_superseded_signing_group_id uuid default null,
  p_replacement_reason text default null,
  p_initiated_by uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_listing public.private_listings%rowtype;
  v_source public.private_listing_mandate_signing_sessions%rowtype;
  v_session jsonb;
  v_selected_documents jsonb;
  v_selected_document_keys text[];
  v_source_signed_count integer := 0;
  v_revoked_count integer := 0;
  v_recent_revoked integer := 0;
  v_prepared_count integer := 0;
  v_lineage_id uuid;
  v_is_amendment boolean := false;
begin
  if p_signing_group_id is null or jsonb_typeof(coalesce(p_sessions, '[]'::jsonb)) <> 'array' or jsonb_array_length(p_sessions) = 0 then
    raise exception 'At least one signing session is required.';
  end if;

  select * into v_listing from public.private_listings where id = p_listing_id for update;
  if not found then raise exception 'Listing not found.'; end if;

  if p_superseded_signing_group_id is not null then
    if char_length(trim(coalesce(p_replacement_reason, ''))) < 5 then
      raise exception 'Provide a short reason for replacing this seller signing pack.';
    end if;
    select * into v_source
    from public.private_listing_mandate_signing_sessions
    where private_listing_id = p_listing_id and signing_group_id = p_superseded_signing_group_id
    order by created_at limit 1 for update;
    if not found then raise exception 'The seller signing pack to correct was not found.'; end if;
    perform 1 from public.private_listing_mandate_signing_sessions where signing_group_id = p_superseded_signing_group_id for update;
    select count(*) filter (where status = 'signed') into v_source_signed_count
    from public.private_listing_mandate_signing_sessions where signing_group_id = p_superseded_signing_group_id;
    v_is_amendment := v_source_signed_count > 0;

    update public.private_listing_mandate_signing_sessions
       set status = 'revoked', updated_at = now()
     where signing_group_id = p_superseded_signing_group_id and status = 'active';
    get diagnostics v_revoked_count = row_count;

    insert into public.private_listing_signing_pack_replacements (
      organisation_id, private_listing_id, superseded_signing_group_id, replacement_signing_group_id, reason, initiated_by
    ) values (
      v_listing.organisation_id, p_listing_id, p_superseded_signing_group_id, p_signing_group_id, trim(p_replacement_reason), p_initiated_by
    ) returning id into v_lineage_id;
  end if;

  -- Reissuing a document safely replaces only matching active documents for
  -- the same recipient, keeping intentionally separate packs available.
  for v_session in select value from jsonb_array_elements(p_sessions) loop
    if nullif(trim(coalesce(v_session->>'signerName', '')), '') is null
      or nullif(trim(coalesce(v_session->>'signerEmail', '')), '') is null
      or nullif(trim(coalesce(v_session->>'tokenHash', '')), '') is null then
      raise exception 'Every required signer needs a name, email and secure token.';
    end if;

    v_selected_documents := coalesce(v_session->'selectedDocuments', '[]'::jsonb);
    if jsonb_typeof(v_selected_documents) <> 'array' or jsonb_array_length(v_selected_documents) = 0 then
      raise exception 'Choose at least one seller document.';
    end if;
    select coalesce(array_agg(document_key), array[]::text[])
      into v_selected_document_keys
      from jsonb_array_elements_text(v_selected_documents) as selected(document_key);

    update public.private_listing_mandate_signing_sessions as existing
       set status = 'revoked', updated_at = now()
     where existing.private_listing_id = p_listing_id
       and existing.status = 'active'
       and lower(existing.signer_email) = lower(v_session->>'signerEmail')
       and existing.signing_group_id is distinct from p_signing_group_id
       and coalesce(existing.selected_documents, '[]'::jsonb) ?| v_selected_document_keys;
    get diagnostics v_recent_revoked = row_count;
    v_revoked_count := v_revoked_count + v_recent_revoked;

    insert into public.private_listing_mandate_signing_sessions (
      organisation_id, private_listing_id, signer_email, signer_name, token_hash, expires_at,
      selected_documents, mandate_snapshot, signing_pack_snapshot, signing_pack_version,
      signing_pack_digest, signing_pack_frozen_at, signing_group_id, is_primary_document_contact,
      primary_document_contact_email, created_by
    ) values (
      v_listing.organisation_id, p_listing_id, lower(trim(v_session->>'signerEmail')), trim(v_session->>'signerName'),
      trim(v_session->>'tokenHash'), (v_session->>'expiresAt')::timestamptz, v_selected_documents,
      coalesce(v_session->'mandateSnapshot', '{}'::jsonb), coalesce(v_session->'signingPackSnapshot', '{}'::jsonb),
      nullif(trim(coalesce(v_session->>'signingPackVersion', '')), ''), nullif(trim(coalesce(v_session->>'signingPackDigest', '')), ''),
      nullif(trim(coalesce(v_session->>'signingPackFrozenAt', '')), '')::timestamptz, p_signing_group_id,
      coalesce((v_session->>'isPrimaryDocumentContact')::boolean, false),
      nullif(lower(trim(coalesce(v_session->>'primaryDocumentContactEmail', ''))), ''), p_initiated_by
    );
    v_prepared_count := v_prepared_count + 1;
  end loop;

  if v_lineage_id is not null then
    insert into public.private_listing_activity (
      private_listing_id, activity_type, activity_title, activity_description, visibility, metadata
    ) values (
      p_listing_id,
      case when v_is_amendment then 'seller_signing_pack_amendment_prepared' else 'seller_signing_pack_replaced' end,
      case when v_is_amendment then 'Seller signing pack amendment prepared' else 'Seller signing pack replaced' end,
      case when v_is_amendment then 'A corrected seller signing pack was prepared while earlier signatures remain audit evidence.' else 'Active seller signing links were revoked and a replacement pack was prepared.' end,
      'internal',
      jsonb_build_object('replacementId', v_lineage_id, 'supersededSigningGroupId', p_superseded_signing_group_id, 'replacementSigningGroupId', p_signing_group_id, 'reason', trim(p_replacement_reason), 'preparedSessions', v_prepared_count, 'activeSessionsRevoked', v_revoked_count, 'signedSessionsRetained', v_source_signed_count)
    );
  end if;

  return jsonb_build_object('preparedSessions', v_prepared_count, 'activeSessionsRevoked', v_revoked_count, 'replacementId', v_lineage_id, 'isAmendment', v_is_amendment);
end;
$$;

revoke all on function public.bridge_prepare_listing_seller_signing_pack_atomically(uuid, uuid, jsonb, uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.bridge_prepare_listing_seller_signing_pack_atomically(uuid, uuid, jsonb, uuid, text, uuid) to service_role;
