begin;

-- Phase 0: an invitation is not "sent" until the provider has accepted it.
-- The edge function is the only caller: it supplies provider evidence after a
-- successful response, and this transaction advances the exact signer,
-- packet, dispatch record, and audit event together.
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
  v_dispatch public.document_signing_dispatches%rowtype;
  v_event_id uuid;
  v_now timestamptz := now();
  v_next_packet_status text;
  v_event_type text;
  v_evidence jsonb;
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
    v_evidence || jsonb_build_object('dispatchId', p_dispatch_id, 'packetStatus', v_packet.status, 'signerStatus', v_signer.status),
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
    'dispatchId', p_dispatch_id,
    'eventId', v_event_id,
    'providerMessageId', trim(p_provider_message_id),
    'deliveredAt', v_now,
    'deliveryEvidence', v_evidence
  );
end;
$$;

-- The packet tables still permit normal authenticated editing for drafts and
-- signer setup. Do not allow that broad editing surface to activate a signer
-- session or mark a mandate packet sent: those transitions are evidence-backed
-- server actions only.
create or replace function public.bridge_enforce_authoritative_signing_delivery_phase0()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := coalesce(auth.role(), 'unknown');
  v_old_status text := case when tg_op = 'INSERT' then '' else coalesce(old.status, '') end;
begin
  if v_role <> 'service_role'
     and coalesce(new.status, '') in ('sent', 'viewed', 'signed')
     and coalesce(new.status, '') is distinct from v_old_status then
    raise exception 'Only the controlled delivery/signing service may activate a signer session.'
      using errcode = '42501', detail = 'PHASE0_SIGNER_STATUS_SERVICE_ONLY';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_authoritative_signing_delivery_phase0 on public.document_packet_signers;
create trigger trg_authoritative_signing_delivery_phase0
before insert or update of status on public.document_packet_signers
for each row execute function public.bridge_enforce_authoritative_signing_delivery_phase0();

create or replace function public.bridge_enforce_authoritative_mandate_packet_sent_phase0()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := coalesce(auth.role(), 'unknown');
begin
  if v_role <> 'service_role'
     and lower(coalesce(new.packet_type, '')) = 'mandate'
     and coalesce(new.status, '') = 'sent'
     and coalesce(new.status, '') is distinct from coalesce(old.status, '') then
    raise exception 'Only provider-confirmed signing delivery may mark a mandate packet sent.'
      using errcode = '42501', detail = 'PHASE0_PACKET_SENT_SERVICE_ONLY';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_authoritative_mandate_packet_sent_phase0 on public.document_packets;
create trigger trg_authoritative_mandate_packet_sent_phase0
before update of status on public.document_packets
for each row execute function public.bridge_enforce_authoritative_mandate_packet_sent_phase0();

-- A browser guard is useful for clarity, but it is not an authority boundary.
-- Keep a direct table update (including an administrator's update) from making
-- a listing market-active unless the linked mandate has completed the canonical
-- packet/F2 final-artifact chain. Existing legacy listings can still be edited
-- on unrelated fields; activation, public-distribution, and mandate-binding
-- edges must all satisfy the canonical chain.
create or replace function public.bridge_require_canonical_completed_mandate_phase0(
  p_organisation_id uuid,
  p_mandate_packet_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_packet public.document_packets%rowtype;
  v_version public.document_packet_versions%rowtype;
  v_evidence public.legal_final_artifact_evidence%rowtype;
begin
  if p_mandate_packet_id is null then
    raise exception 'A canonical completed mandate packet is required before activating a listing.'
      using errcode = 'P0001', detail = 'PHASE0_PRIVATE_LISTING_CANONICAL_MANDATE_REQUIRED';
  end if;

  select * into v_packet
  from public.document_packets
  where id = p_mandate_packet_id;

  if not found
     or v_packet.organisation_id is distinct from p_organisation_id
     or lower(coalesce(v_packet.packet_type, '')) <> 'mandate'
     or lower(coalesce(v_packet.status, '')) <> 'completed' then
    raise exception 'The linked mandate packet is not a completed canonical mandate.'
      using errcode = 'P0001', detail = 'PHASE0_PRIVATE_LISTING_CANONICAL_MANDATE_REQUIRED';
  end if;

  select * into v_version
  from public.document_packet_versions
  where packet_id = v_packet.id
    and version_number = v_packet.current_version_number;

  select * into v_evidence
  from public.legal_final_artifact_evidence
  where packet_version_id = v_version.id;

  if not found
     or v_version.organisation_id is distinct from v_packet.organisation_id
     or nullif(trim(coalesce(v_version.final_signed_file_bucket, '')), '') is null
     or nullif(trim(coalesce(v_version.final_signed_file_path, '')), '') is null
     or v_version.finalised_at is null
     or v_evidence.organisation_id is distinct from v_packet.organisation_id
     or v_evidence.packet_id is distinct from v_packet.id
     or v_evidence.bucket is distinct from v_version.final_signed_file_bucket
     or v_evidence.path is distinct from v_version.final_signed_file_path
     or v_evidence.generated_at is distinct from v_version.finalised_at then
    raise exception 'The mandate packet has no valid F2 final signed artifact evidence.'
      using errcode = 'P0001', detail = 'PHASE0_PRIVATE_LISTING_CANONICAL_MANDATE_REQUIRED';
  end if;
end;
$$;

create or replace function public.bridge_enforce_private_listing_mandate_completion_phase0()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_requires_completion boolean := false;
  v_new_operationally_active boolean := false;
begin
  v_new_operationally_active :=
    lower(coalesce(new.listing_status, '')) in ('mandate_signed', 'active', 'listing_active', 'in_progress', 'live', 'published', 'finalised', 'finalized', 'fully_signed', 'signed', 'signed_uploaded', 'uploaded_signed', 'under_offer', 'transaction_created', 'sold')
    or coalesce(new.is_active, false)
    or lower(coalesce(new.listing_visibility, '')) in ('active_market', 'public', 'published', 'live')
    or lower(coalesce(new.mandate_status, '')) = 'signed'
    or lower(coalesce(new.bridge_listing_status, '')) = 'published'
    or lower(coalesce(new.property24_status, '')) = 'published'
    or lower(coalesce(new.private_property_status, '')) = 'published'
    or exists (
      select 1
      from public.listing_publication_data publication
      where publication.listing_id = new.id
        and lower(trim(coalesce(publication.status, ''))) = 'published'
    )
    or exists (
      select 1
      from public.listing_external_links external_link
      where external_link.listing_id = new.id
        and lower(trim(coalesce(external_link.status, ''))) in ('live', 'published')
    );

  if tg_op = 'INSERT' then
    v_requires_completion := v_new_operationally_active;
  else
    v_requires_completion :=
      (lower(coalesce(new.listing_status, '')) in ('mandate_signed', 'active', 'listing_active', 'in_progress', 'live', 'published', 'finalised', 'finalized', 'fully_signed', 'signed', 'signed_uploaded', 'uploaded_signed', 'under_offer', 'transaction_created', 'sold')
        and lower(coalesce(new.listing_status, '')) is distinct from lower(coalesce(old.listing_status, '')))
      or (coalesce(new.is_active, false) and not coalesce(old.is_active, false))
      or (lower(coalesce(new.listing_visibility, '')) in ('active_market', 'public', 'published', 'live')
        and lower(coalesce(new.listing_visibility, '')) is distinct from lower(coalesce(old.listing_visibility, '')))
      or (lower(coalesce(new.mandate_status, '')) = 'signed'
        and lower(coalesce(new.mandate_status, '')) is distinct from lower(coalesce(old.mandate_status, '')))
      or (lower(coalesce(new.bridge_listing_status, '')) = 'published'
        and lower(coalesce(new.bridge_listing_status, '')) is distinct from lower(coalesce(old.bridge_listing_status, '')))
      or (lower(coalesce(new.property24_status, '')) = 'published'
        and lower(coalesce(new.property24_status, '')) is distinct from lower(coalesce(old.property24_status, '')))
      or (lower(coalesce(new.private_property_status, '')) = 'published'
        and lower(coalesce(new.private_property_status, '')) is distinct from lower(coalesce(old.private_property_status, '')))
      or (v_new_operationally_active and (
        new.mandate_packet_id is distinct from old.mandate_packet_id
        or new.organisation_id is distinct from old.organisation_id
      ));
  end if;

  if not v_requires_completion then
    return new;
  end if;

  perform public.bridge_require_canonical_completed_mandate_phase0(
    new.organisation_id,
    new.mandate_packet_id
  );

  return new;
end;
$$;

drop trigger if exists trg_private_listing_mandate_completion_phase0 on public.private_listings;
create trigger trg_private_listing_mandate_completion_phase0
before insert or update of organisation_id, listing_status, listing_visibility, mandate_status, is_active, mandate_packet_id,
  bridge_listing_status, property24_status, private_property_status
on public.private_listings
for each row execute function public.bridge_enforce_private_listing_mandate_completion_phase0();

create or replace function public.bridge_require_listing_canonical_mandate_phase0(
  p_listing_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_listing public.private_listings%rowtype;
begin
  select * into v_listing
  from public.private_listings
  where id = p_listing_id;

  if not found then
    raise exception 'The listing for this public distribution record was not found.'
      using errcode = 'P0001', detail = 'PHASE0_PRIVATE_LISTING_CANONICAL_MANDATE_REQUIRED';
  end if;

  perform public.bridge_require_canonical_completed_mandate_phase0(
    v_listing.organisation_id,
    v_listing.mandate_packet_id
  );
end;
$$;

create or replace function public.bridge_enforce_listing_publication_mandate_completion_phase0()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if lower(trim(coalesce(new.status, ''))) <> 'published' then
    return new;
  end if;
  if tg_op = 'UPDATE'
     and lower(trim(coalesce(old.status, ''))) = 'published'
     and new.listing_id is not distinct from old.listing_id then
    return new;
  end if;

  perform public.bridge_require_listing_canonical_mandate_phase0(new.listing_id);
  return new;
end;
$$;

drop trigger if exists trg_listing_publication_mandate_completion_phase0 on public.listing_publication_data;
create trigger trg_listing_publication_mandate_completion_phase0
before insert or update of status, listing_id
on public.listing_publication_data
for each row execute function public.bridge_enforce_listing_publication_mandate_completion_phase0();

create or replace function public.bridge_enforce_listing_external_publication_mandate_completion_phase0()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if lower(trim(coalesce(new.status, ''))) not in ('live', 'published') then
    return new;
  end if;
  if tg_op = 'UPDATE'
     and lower(trim(coalesce(old.status, ''))) in ('live', 'published')
     and new.listing_id is not distinct from old.listing_id then
    return new;
  end if;

  perform public.bridge_require_listing_canonical_mandate_phase0(new.listing_id);
  return new;
end;
$$;

drop trigger if exists trg_listing_external_publication_mandate_completion_phase0 on public.listing_external_links;
create trigger trg_listing_external_publication_mandate_completion_phase0
before insert or update of status, listing_id
on public.listing_external_links
for each row execute function public.bridge_enforce_listing_external_publication_mandate_completion_phase0();

-- Final artifacts are immutable.  Do not let a linked active/public listing
-- drift away from the completed mandate by changing the packet back to a
-- draft-like state or pointing it at a different current version.
create or replace function public.bridge_enforce_active_listing_mandate_integrity_phase0()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if lower(trim(coalesce(old.packet_type, ''))) <> 'mandate'
     or lower(trim(coalesce(old.status, ''))) <> 'completed' then
    return new;
  end if;

  if lower(trim(coalesce(new.packet_type, ''))) = 'mandate'
     and lower(trim(coalesce(new.status, ''))) = 'completed'
     and new.current_version_number is not distinct from old.current_version_number
     and new.organisation_id is not distinct from old.organisation_id then
    return new;
  end if;

  if exists (
    select 1
    from public.private_listings listing
    where listing.mandate_packet_id = old.id
      and (
        lower(coalesce(listing.listing_status, '')) in ('mandate_signed', 'active', 'listing_active', 'in_progress', 'live', 'published', 'finalised', 'finalized', 'fully_signed', 'signed', 'signed_uploaded', 'uploaded_signed', 'under_offer', 'transaction_created', 'sold')
        or coalesce(listing.is_active, false)
        or lower(coalesce(listing.listing_visibility, '')) in ('active_market', 'public', 'published', 'live')
        or lower(coalesce(listing.mandate_status, '')) = 'signed'
        or lower(coalesce(listing.bridge_listing_status, '')) = 'published'
        or lower(coalesce(listing.property24_status, '')) = 'published'
        or lower(coalesce(listing.private_property_status, '')) = 'published'
        or exists (
          select 1
          from public.listing_publication_data publication
          where publication.listing_id = listing.id
            and lower(trim(coalesce(publication.status, ''))) = 'published'
        )
        or exists (
          select 1
          from public.listing_external_links external_link
          where external_link.listing_id = listing.id
            and lower(trim(coalesce(external_link.status, ''))) in ('live', 'published')
        )
      )
  ) then
    raise exception 'A completed mandate linked to an active or public listing cannot be invalidated.'
      using errcode = 'P0001', detail = 'PHASE0_ACTIVE_LISTING_MANDATE_IMMUTABLE';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_active_listing_mandate_integrity_phase0 on public.document_packets;
create trigger trg_active_listing_mandate_integrity_phase0
before update of status, current_version_number, organisation_id, packet_type
on public.document_packets
for each row execute function public.bridge_enforce_active_listing_mandate_integrity_phase0();

revoke all on function public.bridge_require_canonical_completed_mandate_phase0(uuid, uuid) from public, anon, authenticated;
revoke all on function public.bridge_require_listing_canonical_mandate_phase0(uuid) from public, anon, authenticated;
revoke all on function public.bridge_enforce_private_listing_mandate_completion_phase0() from public, anon, authenticated;
revoke all on function public.bridge_enforce_listing_publication_mandate_completion_phase0() from public, anon, authenticated;
revoke all on function public.bridge_enforce_listing_external_publication_mandate_completion_phase0() from public, anon, authenticated;
revoke all on function public.bridge_enforce_active_listing_mandate_integrity_phase0() from public, anon, authenticated;

revoke all on function public.bridge_record_mandate_signing_delivery_phase0(uuid, uuid, uuid, text, text, jsonb, uuid, boolean) from public, anon, authenticated;
grant execute on function public.bridge_record_mandate_signing_delivery_phase0(uuid, uuid, uuid, text, text, jsonb, uuid, boolean) to service_role;

-- E4's completion receipt used to be writable from the browser. The Phase 0
-- sender records it in the same service-role transaction as the signer and
-- provider evidence, so a client cannot fabricate a delivered dispatch.
revoke all on function public.bridge_complete_applied_envelope_dispatch_e4(uuid, boolean, jsonb) from public, anon, authenticated;
grant execute on function public.bridge_complete_applied_envelope_dispatch_e4(uuid, boolean, jsonb) to service_role;

comment on function public.bridge_record_mandate_signing_delivery_phase0(uuid, uuid, uuid, text, text, jsonb, uuid, boolean) is
  'Phase 0 authoritative mandate invitation delivery: provider evidence atomically promotes the exact signer, updates packet lifecycle, records E4 dispatch evidence, and appends an audit event.';

commit;
