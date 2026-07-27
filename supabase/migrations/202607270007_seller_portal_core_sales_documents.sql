begin;

create or replace function public.bridge_private_listing_seller_portal_core_payload_phase1(
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
  v_onboarding public.private_listing_seller_onboarding%rowtype;
  v_listing public.private_listings%rowtype;
  v_form_data jsonb := '{}'::jsonb;
  v_onboarding_core jsonb := '{}'::jsonb;
  v_transaction_id uuid;
  v_transaction jsonb := 'null'::jsonb;
  v_mandate_packet jsonb := 'null'::jsonb;
  v_access_token text := nullif(trim(coalesce(p_access_token, '')), '');
  v_access_hash text := case when v_access_token is null then null else encode(digest(v_access_token, 'sha256'), 'hex') end;
  v_access_granted boolean := false;
  v_session_expired boolean := false;
begin
  select * into v_onboarding
  from public.private_listing_seller_onboarding
  where token = nullif(trim(p_token), '')
  limit 1;

  if not found then
    perform public.bridge_log_client_portal_access_event(p_token, 'core_payload', 'failure', null, 'token_invalid');
    return null;
  end if;

  select * into v_listing
  from public.private_listings
  where id = v_onboarding.private_listing_id
  limit 1;

  if not found or not public.bridge_private_listing_seller_portal_link_is_active(to_jsonb(v_onboarding), to_jsonb(v_listing)) then
    perform public.bridge_log_client_portal_access_event(p_token, 'core_payload', 'failure', v_onboarding.private_listing_id, 'portal_inactive');
    return null;
  end if;

  v_form_data := case
    when jsonb_typeof(coalesce(v_onboarding.form_data, '{}'::jsonb)) = 'object'
      then v_onboarding.form_data
    else '{}'::jsonb
  end;

  v_onboarding_core := jsonb_build_object(
    'id', v_onboarding.id,
    'private_listing_id', v_onboarding.private_listing_id,
    'token', v_onboarding.token,
    'seller_portal_token', v_onboarding.seller_portal_token,
    'token_expires_at', v_onboarding.token_expires_at,
    'seller_portal_link_expires_at', v_onboarding.seller_portal_link_expires_at,
    'seller_portal_access_token_expires_at', v_onboarding.seller_portal_access_token_expires_at,
    'status', v_onboarding.status,
    'submitted_at', v_onboarding.submitted_at,
    'created_at', v_onboarding.created_at,
    'updated_at', v_onboarding.updated_at,
    'seller_type', v_onboarding.seller_type,
    'ownership_structure', v_onboarding.ownership_structure,
    'marital_regime', v_onboarding.marital_regime,
    'form_data', jsonb_strip_nulls(jsonb_build_object(
      'sellerName', v_form_data ->> 'sellerName',
      'sellerFirstName', v_form_data ->> 'sellerFirstName',
      'sellerSurname', v_form_data ->> 'sellerSurname',
      'firstName', v_form_data ->> 'firstName',
      'lastName', v_form_data ->> 'lastName',
      'surname', v_form_data ->> 'surname',
      'sellerEmail', v_form_data ->> 'sellerEmail',
      'email', v_form_data ->> 'email',
      'contactEmail', v_form_data ->> 'contactEmail',
      'sellerPhone', v_form_data ->> 'sellerPhone',
      'phone', v_form_data ->> 'phone',
      'propertyAddress', v_form_data ->> 'propertyAddress',
      'address', v_form_data ->> 'address',
      'suburb', v_form_data ->> 'suburb',
      'city', v_form_data ->> 'city',
      'mandatePacketId', coalesce(v_form_data ->> 'mandatePacketId', v_listing.mandate_packet_id::text),
      'mandateSignedDate', v_form_data ->> 'mandateSignedDate',
      'mandateSigningLink', v_form_data ->> 'mandateSigningLink',
      'propertyDisclosureStatus', v_form_data ->> 'propertyDisclosureStatus',
      'propertyDisclosure', v_form_data -> 'propertyDisclosure',
      'property_disclosure', v_form_data -> 'property_disclosure'
    ))
  );

  v_session_expired := v_access_token is not null and (
    v_onboarding.seller_portal_access_token_hash is distinct from v_access_hash
    or v_onboarding.seller_portal_access_token_expires_at is null
    or v_onboarding.seller_portal_access_token_expires_at <= now()
  );
  v_access_granted :=
    (not p_require_access and v_onboarding.seller_portal_password_hash is null)
    or (
      v_access_hash is not null
      and v_onboarding.seller_portal_access_token_hash = v_access_hash
      and v_onboarding.seller_portal_access_token_expires_at > now()
    );

  if p_require_access and not v_access_granted then
    perform public.bridge_log_client_portal_access_event(
      p_token,
      'core_payload',
      'challenge',
      v_listing.id,
      case when v_session_expired then 'session_expired' else 'authentication_required' end
    );
    return jsonb_build_object(
      'authRequired', true,
      'sessionExpired', v_session_expired,
      'reason', case when v_session_expired then 'session_expired' else 'authentication_required' end,
      'passwordSet', v_onboarding.seller_portal_password_hash is not null,
      'passwordRequired', v_onboarding.seller_portal_password_hash is null,
      'sellerEmail', lower(nullif(trim(coalesce(
        v_form_data ->> 'sellerEmail',
        v_form_data ->> 'email',
        v_form_data ->> 'contactEmail',
        ''
      )), '')),
      'propertyTitle', nullif(trim(coalesce(v_listing.title, v_listing.formatted_address, v_listing.address_line_1, 'your property')), ''),
      'token', v_onboarding.token
    );
  end if;

  perform public.bridge_log_client_portal_access_event(p_token, 'core_payload', 'success', v_listing.id, 'access_granted');

  begin
    if to_regprocedure('public.bridge_resolve_private_listing_transaction_id(uuid)') is not null
      and to_regclass('public.transactions') is not null then
      v_transaction_id := public.bridge_resolve_private_listing_transaction_id(v_listing.id);
      if v_transaction_id is not null then
        select to_jsonb(tx)
          into v_transaction
        from public.transactions tx
        where tx.id = v_transaction_id
        limit 1;
      end if;
    end if;
  exception
    when undefined_column or undefined_table then
      v_transaction := 'null'::jsonb;
  end;

  begin
    if to_regclass('public.document_packets') is not null and to_regclass('public.document_packet_versions') is not null then
      select jsonb_strip_nulls(jsonb_build_object(
        'id', pkt.id,
        'state', case
          when pkt.status = 'completed' then 'fully_signed'
          when pkt.status = 'partially_signed' then 'awaiting_other_signatures'
          when pkt.status = 'sent' then 'ready_for_client_signature'
          when pkt.status = 'generated' then 'generated_not_ready'
          when pkt.status in ('ready_for_generation', 'draft') then 'not_generated'
          else coalesce(pkt.status, 'not_generated')
        end,
        'packet', jsonb_strip_nulls(jsonb_build_object(
          'id', pkt.id,
          'status', pkt.status,
          'title', pkt.title,
          'updated_at', pkt.updated_at,
          'completed_at', pkt.completed_at,
          'finalSignedRecorded', ver.final_signed_file_path is not null
            or ver.final_signed_document_id is not null
            or nullif(trim(coalesce(ver.final_signed_file_name, '')), '') is not null
        )),
        'version', jsonb_strip_nulls(jsonb_build_object(
          'id', ver.id,
          'packet_id', ver.packet_id,
          'version_number', ver.version_number,
          'render_status', ver.render_status,
          'rendered_file_name', ver.rendered_file_name,
          'final_signed_file_name', ver.final_signed_file_name,
          'final_signed_document_id', ver.final_signed_document_id,
          'finalised_at', ver.finalised_at,
          'generated_at', ver.generated_at,
          'created_at', ver.created_at
        )),
        'packetVersionId', ver.id,
        'finalSignedFileName', ver.final_signed_file_name,
        'finalSignedDocumentId', ver.final_signed_document_id,
        'final_signed_document_id', ver.final_signed_document_id,
        'finalSignedRecorded', ver.final_signed_file_path is not null
          or ver.final_signed_document_id is not null
          or nullif(trim(coalesce(ver.final_signed_file_name, '')), '') is not null,
        'canonicalFinalArtifact', ver.final_signed_file_path is not null
          or ver.final_signed_document_id is not null,
        'generatedPreviewFileName', ver.rendered_file_name,
        'signedAt', coalesce(ver.finalised_at, pkt.completed_at),
        'updatedAt', pkt.updated_at
      ))
      into v_mandate_packet
      from public.document_packets pkt
      left join lateral (
        select *
        from public.document_packet_versions packet_version
        where packet_version.packet_id = pkt.id
        order by
          case when packet_version.final_signed_file_path is not null or packet_version.final_signed_document_id is not null then 0 else 1 end,
          packet_version.finalised_at desc nulls last,
          packet_version.version_number desc nulls last,
          packet_version.created_at desc nulls last
        limit 1
      ) ver on true
      where pkt.organisation_id::text = v_listing.organisation_id::text
        and pkt.packet_type = 'mandate'
        and (
          pkt.id::text = nullif(v_listing.mandate_packet_id::text, '')
          or pkt.id::text = nullif(v_form_data->>'mandatePacketId', '')
          or pkt.lead_id::text = v_listing.seller_lead_id::text
          or pkt.lead_id::text = v_listing.originating_crm_lead_id::text
          or pkt.source_context_json->>'uiLeadId' = v_listing.seller_lead_id::text
          or pkt.source_context_json->>'uiLeadId' = v_listing.originating_crm_lead_id::text
          or pkt.source_context_json->>'leadId' = v_listing.seller_lead_id::text
          or pkt.source_context_json->>'leadId' = v_listing.originating_crm_lead_id::text
        )
      order by
        case
          when pkt.status = 'completed' then 0
          when pkt.id::text = nullif(v_listing.mandate_packet_id::text, '') then 1
          when pkt.id::text = nullif(v_form_data->>'mandatePacketId', '') then 2
          else 3
        end,
        pkt.updated_at desc nulls last,
        pkt.created_at desc nulls last
      limit 1;
    end if;
  exception
    when undefined_column or undefined_table then
      v_mandate_packet := 'null'::jsonb;
  end;

  return jsonb_build_object(
    'listing', to_jsonb(v_listing),
    'onboarding', v_onboarding_core,
    'transaction', v_transaction,
    'requirements', '[]'::jsonb,
    'documents', '[]'::jsonb,
    'appointments', '[]'::jsonb,
    'mandatePacket', coalesce(v_mandate_packet, 'null'::jsonb),
    'corePayload', true,
    'portalAccess', jsonb_build_object(
      'passwordSet', v_onboarding.seller_portal_password_hash is not null,
      'accessGranted', true,
      'expiresAt', v_onboarding.seller_portal_access_token_expires_at,
      'portalLinkExpiresAt', v_onboarding.seller_portal_link_expires_at
    )
  );
end;
$$;

revoke all on function public.bridge_private_listing_seller_portal_core_payload_phase1(text, text, boolean)
  from public, anon, authenticated, service_role;

comment on function public.bridge_private_listing_seller_portal_core_payload_phase1(text, text, boolean) is
  'Fast seller portal core payload. Keeps requirements/documents/appointments deferred but includes compact Sales document prerequisites: signed mandate metadata and generated seller disclosure data.';

notify pgrst, 'reload schema';

commit;
