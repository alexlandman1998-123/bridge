begin;

-- Automatic next-signer mandate delivery can be provider-confirmed without an
-- explicit E4 dispatch id.  F1 still requires a delivered dispatch proof, so
-- create that proof inside the authoritative delivery recorder whenever the
-- caller does not provide one.
create or replace function public.bridge_record_mandate_signing_delivery_phase0(
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
  v_layout public.document_signing_field_layouts%rowtype;
  v_dispatch public.document_signing_dispatches%rowtype;
  v_event_id uuid;
  v_now timestamptz := now();
  v_next_packet_status text;
  v_event_type text;
  v_evidence jsonb;
  v_dispatch_id uuid := p_dispatch_id;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service-role invitation delivery authority is required.' using errcode = '42501';
  end if;
  if nullif(trim(p_provider_message_id), '') is null then
    raise exception 'A provider message identifier is required before recording delivery.'
      using errcode = '22000', detail = 'PHASE0_PROVIDER_EVIDENCE_REQUIRED';
  end if;

  select * into v_packet
  from public.document_packets
  where id = p_packet_id
  for update;
  if not found or lower(coalesce(v_packet.packet_type, '')) <> 'mandate' then
    raise exception 'Mandate packet not found.' using errcode = 'P0002';
  end if;

  select * into v_version
  from public.document_packet_versions
  where id = p_version_id and packet_id = p_packet_id
  for update;
  if not found
     or v_version.organisation_id is distinct from v_packet.organisation_id
     or v_version.version_number is distinct from v_packet.current_version_number
     or v_version.render_status <> 'generated'
     or not coalesce(v_version.transaction_pdf_persisted, false)
     or not coalesce(v_version.native_pdf_verified, false)
     or coalesce(v_version.rendered_file_bucket, '') = ''
     or coalesce(v_version.rendered_file_path, '') = ''
     or coalesce(v_version.rendered_media_type, '') <> 'application/pdf'
     or coalesce(v_version.rendered_sha256, '') !~ '^sha256:[0-9a-f]{64}$' then
    raise exception 'The exact current version has no certified PDF for signing delivery.'
      using errcode = '22000', detail = 'PHASE0_CERTIFIED_PDF_REQUIRED';
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
    raise exception 'The certified PDF document link is unavailable for signing delivery.'
      using errcode = '22000', detail = 'PHASE0_CERTIFIED_PDF_LINK_INVALID';
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
    raise exception 'The exact signer invitation is no longer active.'
      using errcode = '22000', detail = 'PHASE0_SIGNER_BINDING_INVALID';
  end if;

  if p_dispatch_id is not null then
    select * into v_dispatch
    from public.document_signing_dispatches
    where id = p_dispatch_id
    for update;
    if not found
       or v_dispatch.packet_id is distinct from p_packet_id
       or v_dispatch.packet_version_id is distinct from p_version_id
       or (v_dispatch.target_signer_role is not null and lower(v_dispatch.target_signer_role) <> lower(v_signer.signer_role)) then
      raise exception 'The signing delivery dispatch is not bound to this signer.'
        using errcode = '22000', detail = 'PHASE0_DISPATCH_BINDING_INVALID';
    end if;
    if v_dispatch.status = 'delivered' then
      if coalesce(v_signer.status, '') not in ('sent', 'viewed') then
        raise exception 'A delivered dispatch has no active delivered signer.'
          using errcode = '22000', detail = 'PHASE0_DISPATCH_SIGNER_STATE_INVALID';
      end if;
      return jsonb_build_object(
        'contract', 'phase0-mandate-signing-delivery-v1',
        'recorded', true,
        'idempotent', true,
        'packetId', v_packet.id,
        'packetVersionId', v_version.id,
        'packetStatus', v_packet.status,
        'signerId', v_signer.id,
        'signerStatus', v_signer.status,
        'dispatchId', v_dispatch.id,
        'providerMessageId', coalesce(v_dispatch.delivery_evidence_json->>'providerMessageId', null),
        'deliveryEvidence', coalesce(v_dispatch.delivery_evidence_json, '{}'::jsonb)
      );
    end if;
  end if;

  if p_is_resend then
    if coalesce(v_signer.status, '') not in ('sent', 'viewed') then
      raise exception 'A resend requires an already active signer invitation.'
        using errcode = '22000', detail = 'PHASE0_RESEND_SIGNER_NOT_ACTIVE';
    end if;
  elsif coalesce(v_signer.status, '') <> 'ready_to_send' then
    raise exception 'The signer was not waiting for provider-confirmed delivery.'
      using errcode = '22000', detail = 'PHASE0_SIGNER_NOT_READY_TO_SEND';
  end if;

  if coalesce(v_packet.status, '') not in ('signing_prep', 'signing_prepared', 'ready_to_send', 'sent', 'partially_signed') then
    raise exception 'The packet is not in an active signing delivery lifecycle.'
      using errcode = '22000', detail = 'PHASE0_PACKET_NOT_DELIVERABLE';
  end if;

  v_next_packet_status := case
    when v_packet.status in ('signing_prep', 'signing_prepared', 'ready_to_send') then 'sent'
    else v_packet.status
  end;
  v_evidence := jsonb_strip_nulls(coalesce(p_delivery_evidence, '{}'::jsonb) || jsonb_build_object(
    'contract', 'phase0-mandate-signing-delivery-v1',
    'provider', coalesce(p_delivery_evidence->>'provider', 'resend'),
    'providerMessageId', trim(p_provider_message_id),
    'signerId', v_signer.id,
    'signerRole', v_signer.signer_role,
    'packetId', v_packet.id,
    'packetVersionId', v_version.id,
    'recordedAt', v_now,
    'resend', coalesce(p_is_resend, false),
    'emailConfirmed', true
  ));

  if v_dispatch_id is null then
    select * into v_layout
    from public.document_signing_field_layouts
    where packet_id = v_packet.id
      and packet_version_id = v_version.id
      and status = 'applied'
      and placement_verified is true
    limit 1;
    if not found then
      raise exception 'The applied signature layout is unavailable for signing delivery.'
        using errcode = '22000', detail = 'PHASE0_APPLIED_LAYOUT_REQUIRED';
    end if;

    insert into public.document_signing_dispatches (
      organisation_id, packet_id, packet_version_id, layout_id, layout_revision,
      dispatch_kind, target_signer_role, idempotency_key, status,
      delivery_evidence_json, authorized_by, authorized_at, completed_at, created_at, updated_at
    ) values (
      v_packet.organisation_id, v_packet.id, v_version.id, v_layout.id, v_layout.revision,
      case when p_is_resend then 'resend' else 'initial' end,
      lower(v_signer.signer_role),
      'mandate-signing:' || v_packet.id::text || ':' || v_version.id::text || ':' || v_signer.id::text || ':' || trim(p_provider_message_id),
      'delivered',
      v_evidence,
      null,
      v_now,
      v_now,
      v_now,
      v_now
    )
    on conflict (idempotency_key) do update set
      status = 'delivered',
      delivery_evidence_json = excluded.delivery_evidence_json,
      completed_at = coalesce(public.document_signing_dispatches.completed_at, excluded.completed_at),
      updated_at = excluded.updated_at
    returning * into v_dispatch;
    v_dispatch_id := v_dispatch.id;
  end if;

  update public.document_packet_signers
  set status = case when v_signer.status = 'viewed' then 'viewed' else 'sent' end
  where id = v_signer.id
  returning * into v_signer;

  update public.document_packets
  set
    status = v_next_packet_status,
    sent_at = case when v_next_packet_status = 'sent' then coalesce(sent_at, v_now) else sent_at end,
    source_context_json = coalesce(source_context_json, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
      'signingDeliveryLastAt', v_now,
      'signingDeliveryLastSignerId', v_signer.id,
      'signingDeliveryLastProviderMessageId', trim(p_provider_message_id),
      'signingDeliveryLastResend', coalesce(p_is_resend, false),
      'signing_status', case
        when lower(v_signer.signer_role) = 'agent' then 'sent_to_agent'
        when lower(v_signer.signer_role) = 'seller' then 'sent_to_seller'
        else 'sent_for_signature'
      end,
      'signingStatus', case
        when lower(v_signer.signer_role) = 'agent' then 'sent_to_agent'
        when lower(v_signer.signer_role) = 'seller' then 'sent_to_seller'
        else 'sent_for_signature'
      end,
      'lifecycle_state', case when v_next_packet_status = 'sent' then 'sent' else null end
    ))
  where id = v_packet.id
  returning * into v_packet;

  if p_dispatch_id is not null then
    update public.document_signing_dispatches
    set
      status = 'delivered',
      delivery_evidence_json = v_evidence,
      completed_at = coalesce(completed_at, v_now),
      updated_at = v_now
    where id = p_dispatch_id
    returning * into v_dispatch;
  end if;

  v_event_type := case when p_is_resend then 'mandate_signing_email_resent' else 'seller_signing_email_sent' end;
  insert into public.document_packet_events (
    packet_id, organisation_id, version_id, event_type, event_payload_json, created_by, created_at
  ) values (
    v_packet.id, v_packet.organisation_id, v_version.id, v_event_type,
    v_evidence || jsonb_build_object('dispatchId', v_dispatch_id, 'packetStatus', v_packet.status, 'signerStatus', v_signer.status),
    null, v_now
  ) returning id into v_event_id;

  return jsonb_build_object(
    'contract', 'phase0-mandate-signing-delivery-v1',
    'recorded', true,
    'idempotent', false,
    'packetId', v_packet.id,
    'packetVersionId', v_version.id,
    'packetStatus', v_packet.status,
    'signerId', v_signer.id,
    'signerStatus', v_signer.status,
    'dispatchId', v_dispatch_id,
    'eventId', v_event_id,
    'providerMessageId', trim(p_provider_message_id),
    'deliveredAt', v_now,
    'deliveryEvidence', v_evidence
  );
end;
$$;

insert into public.document_signing_dispatches (
  organisation_id, packet_id, packet_version_id, layout_id, layout_revision,
  dispatch_kind, target_signer_role, idempotency_key, status,
  delivery_evidence_json, authorized_by, authorized_at, completed_at, created_at, updated_at
)
select
  signer.organisation_id,
  signer.packet_id,
  signer.packet_version_id,
  layout.id,
  layout.revision,
  case when event.event_type = 'mandate_signing_email_resent' then 'resend' else 'initial' end,
  lower(signer.signer_role),
  'mandate-signing:' || signer.packet_id::text || ':' || signer.packet_version_id::text || ':' || signer.id::text || ':' || (event.event_payload_json->>'providerMessageId'),
  'delivered',
  event.event_payload_json,
  null,
  event.created_at,
  event.created_at,
  event.created_at,
  now()
from public.document_packet_signers signer
join public.document_signing_field_layouts layout
  on layout.packet_id = signer.packet_id
 and layout.packet_version_id = signer.packet_version_id
 and layout.status = 'applied'
 and layout.placement_verified is true
join public.document_packet_events event
  on event.packet_id = signer.packet_id
 and event.version_id = signer.packet_version_id
 and event.event_type in ('seller_signing_email_sent', 'mandate_signing_email_resent')
 and event.event_payload_json->>'signerId' = signer.id::text
 and nullif(event.event_payload_json->>'providerMessageId', '') is not null
where signer.status in ('sent', 'viewed')
  and signer.signing_token is not null
  and not exists (
    select 1
    from public.document_signing_dispatches dispatch
    where dispatch.packet_id = signer.packet_id
      and dispatch.packet_version_id = signer.packet_version_id
      and dispatch.status = 'delivered'
      and (dispatch.target_signer_role is null or dispatch.target_signer_role = lower(signer.signer_role))
  )
on conflict (idempotency_key) do nothing;

comment on function public.bridge_record_mandate_signing_delivery_phase0(
  uuid, uuid, uuid, text, text, jsonb, uuid, boolean
) is
  'Phase 0 service-only mandate signing delivery recorder. Provider-confirmed delivery now always creates or updates the delivered dispatch proof required by F1 signer sessions.';

commit;
