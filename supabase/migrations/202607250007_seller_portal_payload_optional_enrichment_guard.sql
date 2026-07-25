begin;

create or replace function public.bridge_private_listing_seller_portal_payload_phase1(
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
  v_listing_json jsonb := '{}'::jsonb;
  v_requirements jsonb := '[]'::jsonb;
  v_documents jsonb := '[]'::jsonb;
  v_appointments jsonb := '[]'::jsonb;
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
    perform public.bridge_log_client_portal_access_event(p_token, 'payload', 'failure', null, 'token_invalid');
    return null;
  end if;

  select * into v_listing from public.private_listings where id = v_onboarding.private_listing_id limit 1;
  if not found or not public.bridge_private_listing_seller_portal_link_is_active(to_jsonb(v_onboarding), to_jsonb(v_listing)) then
    perform public.bridge_log_client_portal_access_event(p_token, 'payload', 'failure', v_onboarding.private_listing_id, 'portal_inactive');
    return null;
  end if;
  v_listing_json := to_jsonb(v_listing);

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
      'payload',
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
        v_onboarding.form_data ->> 'sellerEmail',
        v_onboarding.form_data ->> 'email',
        v_onboarding.form_data ->> 'contactEmail',
        ''
      )), '')),
      'propertyTitle', nullif(trim(coalesce(v_listing.title, v_listing.formatted_address, v_listing.address_line_1, 'your property')), ''),
      'token', v_onboarding.token
    );
  end if;

  perform public.bridge_log_client_portal_access_event(p_token, 'payload', 'success', v_listing.id, 'access_granted');

  begin
    if to_regprocedure('public.bridge_promote_pending_private_listing_documents(uuid)') is not null then
      perform public.bridge_promote_pending_private_listing_documents(v_listing.id);
    end if;
  exception
    when others then
      null;
  end;

  begin
    if to_regclass('public.private_listing_document_requirements') is not null then
      select coalesce(jsonb_agg(to_jsonb(req) order by req.created_at asc), '[]'::jsonb)
      into v_requirements
      from public.private_listing_document_requirements req
      where req.private_listing_id = v_listing.id;
    end if;
  exception
    when undefined_column or undefined_table then
      v_requirements := '[]'::jsonb;
  end;

  begin
    if to_regclass('public.private_listing_documents') is not null then
      select coalesce(jsonb_agg(to_jsonb(doc) order by doc.uploaded_at desc), '[]'::jsonb)
      into v_documents
      from public.private_listing_documents doc
      where doc.private_listing_id = v_listing.id;
    end if;
  exception
    when undefined_column or undefined_table then
      v_documents := '[]'::jsonb;
  end;

  begin
    if to_regclass('public.appointments') is not null then
      select coalesce(jsonb_agg(to_jsonb(appt) order by appt.date_time asc nulls last, appt.created_at desc), '[]'::jsonb)
      into v_appointments
      from public.appointments appt
      where appt.organisation_id::text = v_listing.organisation_id::text
        and coalesce(appt.status, '') not in ('cancelled', 'deleted')
        and coalesce(appt.visibility_scope, 'shared_role_players') not in ('internal', 'internal_only', 'admin_only')
        and (
          appt.listing_id::text = v_listing.id::text
          or appt.lead_id::text = v_listing_json ->> 'seller_lead_id'
          or appt.lead_id::text = v_listing_json ->> 'originating_crm_lead_id'
          or appt.related_entity_id::text = v_listing.id::text
          or appt.related_entity_id::text = v_listing_json ->> 'seller_lead_id'
          or appt.related_entity_id::text = v_listing_json ->> 'originating_crm_lead_id'
        );
    end if;
  exception
    when undefined_column or undefined_table then
      v_appointments := '[]'::jsonb;
  end;

  begin
    if to_regclass('public.document_packets') is not null and to_regclass('public.document_packet_versions') is not null then
      select jsonb_build_object(
        'id', pkt.id,
        'state', case
          when pkt.status = 'completed' then 'fully_signed'
          when pkt.status = 'partially_signed' then 'awaiting_other_signatures'
          when pkt.status = 'sent' then 'ready_for_client_signature'
          when pkt.status = 'generated' then 'generated_not_ready'
          when pkt.status in ('ready_for_generation', 'draft') then 'not_generated'
          else coalesce(pkt.status, 'not_generated')
        end,
        'packet', to_jsonb(pkt),
        'version', to_jsonb(ver),
        'packetVersionId', ver.id,
        'finalSignedFilePath', ver.final_signed_file_path,
        'finalSignedFileName', ver.final_signed_file_name,
        'finalSignedFileBucket', ver.final_signed_file_bucket,
        'finalSignedDownloadUrl', ver.final_signed_file_url,
        'generatedPreviewFilePath', ver.rendered_file_path,
        'generatedPreviewFileName', ver.rendered_file_name,
        'signedAt', coalesce(ver.finalised_at, pkt.completed_at),
        'updatedAt', pkt.updated_at
      ) into v_mandate_packet
      from public.document_packets pkt
      left join lateral (
        select *
        from public.document_packet_versions packet_version
        where packet_version.packet_id = pkt.id
        order by
          case when packet_version.final_signed_file_path is not null or packet_version.final_signed_file_url is not null then 0 else 1 end,
          packet_version.finalised_at desc nulls last,
          packet_version.version_number desc nulls last,
          packet_version.created_at desc nulls last
        limit 1
      ) ver on true
      where pkt.organisation_id::text = v_listing.organisation_id::text
        and pkt.packet_type = 'mandate'
        and (
          pkt.id::text = nullif(v_listing_json ->> 'mandate_packet_id', '')
          or pkt.id::text = nullif(v_onboarding.form_data->>'mandatePacketId', '')
          or pkt.lead_id::text = v_listing_json ->> 'seller_lead_id'
          or pkt.lead_id::text = v_listing_json ->> 'originating_crm_lead_id'
          or pkt.source_context_json->>'uiLeadId' = v_listing_json ->> 'seller_lead_id'
          or pkt.source_context_json->>'uiLeadId' = v_listing_json ->> 'originating_crm_lead_id'
          or pkt.source_context_json->>'leadId' = v_listing_json ->> 'seller_lead_id'
          or pkt.source_context_json->>'leadId' = v_listing_json ->> 'originating_crm_lead_id'
        )
      order by
        case
          when pkt.status = 'completed' then 0
          when pkt.id::text = nullif(v_listing_json ->> 'mandate_packet_id', '') then 1
          when pkt.id::text = nullif(v_onboarding.form_data->>'mandatePacketId', '') then 2
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
    'onboarding', to_jsonb(v_onboarding) - 'seller_portal_password_hash' - 'seller_portal_access_token_hash',
    'requirements', v_requirements,
    'documents', v_documents,
    'appointments', v_appointments,
    'mandatePacket', v_mandate_packet,
    'portalAccess', jsonb_build_object(
      'passwordSet', v_onboarding.seller_portal_password_hash is not null,
      'accessGranted', true,
      'expiresAt', v_onboarding.seller_portal_access_token_expires_at,
      'portalLinkExpiresAt', v_onboarding.seller_portal_link_expires_at
    )
  );
end;
$$;

revoke all on function public.bridge_private_listing_seller_portal_payload_phase1(text, text, boolean)
  from public, anon, authenticated, service_role;

comment on function public.bridge_private_listing_seller_portal_payload_phase1(text, text, boolean) is
  'Seller portal payload core remains token-scoped; optional document, appointment, and mandate enrichments fail closed on schema drift so portal access does not return HTTP 500.';

notify pgrst, 'reload schema';

commit;
