begin;

create or replace function public.bridge_private_listing_conversion_timeline(
  p_private_listing_id uuid default null,
  p_lead_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_private_listing_id uuid := p_private_listing_id;
  v_lead_id uuid := p_lead_id;
  v_organisation_id uuid := null;
  v_mandate_packet_id uuid := null;
  v_transaction_ids uuid[] := array[]::uuid[];
  v_timeline jsonb := '[]'::jsonb;
begin
  if v_private_listing_id is null and v_lead_id is not null then
    select l.listing_id
      into v_private_listing_id
    from public.leads l
    where l.lead_id = v_lead_id
    limit 1;
  end if;

  if v_private_listing_id is null and v_lead_id is not null then
    select pl.id
      into v_private_listing_id
    from public.private_listings pl
    where nullif(trim(pl.originating_crm_lead_id), '') = v_lead_id::text
       or nullif(trim(pl.seller_lead_id), '') = v_lead_id::text
    order by pl.created_at desc
    limit 1;
  end if;

  if v_private_listing_id is null then
    return jsonb_build_object(
      'ok', false,
      'reason', 'listing_not_found',
      'timeline', '[]'::jsonb
    );
  end if;

  select
    pl.organisation_id,
    coalesce(
      v_lead_id,
      case
        when nullif(trim(coalesce(pl.originating_crm_lead_id, '')), '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          then nullif(trim(pl.originating_crm_lead_id), '')::uuid
      end,
      case
        when nullif(trim(coalesce(pl.seller_lead_id, '')), '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          then nullif(trim(pl.seller_lead_id), '')::uuid
      end
    ),
    pl.mandate_packet_id
    into v_organisation_id, v_lead_id, v_mandate_packet_id
  from public.private_listings pl
  where pl.id = v_private_listing_id
  limit 1;

  if v_organisation_id is null then
    select pl.organisation_id, pl.mandate_packet_id
      into v_organisation_id, v_mandate_packet_id
    from public.private_listings pl
    where pl.id = v_private_listing_id
    limit 1;
  end if;

  if v_organisation_id is null then
    return jsonb_build_object(
      'ok', false,
      'reason', 'listing_not_found',
      'timeline', '[]'::jsonb
    );
  end if;

  if not public.bridge_is_active_member(v_organisation_id) then
    return jsonb_build_object(
      'ok', false,
      'reason', 'forbidden',
      'timeline', '[]'::jsonb
    );
  end if;

  if v_lead_id is null then
    select l.lead_id
      into v_lead_id
    from public.leads l
    where l.organisation_id = v_organisation_id
      and l.listing_id = v_private_listing_id
    order by l.created_at desc
    limit 1;
  end if;

  if v_mandate_packet_id is null then
    select l.mandate_packet_id
      into v_mandate_packet_id
    from public.leads l
    where l.lead_id = v_lead_id
      and l.organisation_id = v_organisation_id
    limit 1;
  end if;

  select coalesce(array_agg(distinct t.id), array[]::uuid[])
    into v_transaction_ids
  from public.transactions t
  where t.organisation_id = v_organisation_id
    and t.listing_id = v_private_listing_id;

  with timeline_rows as (
    select
      'lead'::text as source_table,
      'lead_created'::text as event_type,
      l.lead_id::text as source_id,
      'Seller lead created'::text as title,
      coalesce(l.lead_source, l.status, l.stage, 'Seller lead')::text as summary,
      l.created_at as occurred_at,
      jsonb_build_object(
        'leadId', l.lead_id,
        'stage', l.stage,
        'status', l.status,
        'leadSource', l.lead_source
      ) as metadata
    from public.leads l
    where l.lead_id = v_lead_id
      and l.organisation_id = v_organisation_id

    union all

    select
      'lead_activities',
      coalesce(activity.activity_type, 'lead_activity'),
      activity.activity_id::text,
      coalesce(activity.activity_type, 'Lead activity'),
      coalesce(activity.activity_note, activity.outcome, ''),
      coalesce(activity.activity_date, activity.created_at),
      jsonb_build_object(
        'leadId', activity.lead_id,
        'agentId', activity.agent_id,
        'outcome', activity.outcome
      )
    from public.lead_activities activity
    where activity.lead_id = v_lead_id
      and activity.organisation_id = v_organisation_id

    union all

    select
      'lead_communication_events',
      coalesce(comm.communication_type, 'communication'),
      comm.communication_id::text,
      coalesce(comm.subject, initcap(coalesce(comm.communication_type, 'communication'))),
      coalesce(comm.summary, comm.message, ''),
      coalesce(comm.occurred_at, comm.created_at),
      jsonb_build_object(
        'leadId', comm.lead_id,
        'contactId', comm.contact_id,
        'agentId', comm.agent_id,
        'direction', comm.direction,
        'status', comm.status,
        'source', comm.source
      ) || coalesce(comm.metadata, '{}'::jsonb)
    from public.lead_communication_events comm
    where comm.lead_id = v_lead_id
      and comm.organisation_id = v_organisation_id

    union all

    select
      'private_listings',
      'listing_created',
      pl.id::text,
      'Listing created',
      coalesce(pl.title, pl.address_line_1, pl.listing_reference, 'Private listing'),
      pl.created_at,
      jsonb_build_object(
        'privateListingId', pl.id,
        'listingStatus', pl.listing_status,
        'mandateStatus', pl.mandate_status,
        'sellerOnboardingStatus', pl.seller_onboarding_status
      )
    from public.private_listings pl
    where pl.id = v_private_listing_id
      and pl.organisation_id = v_organisation_id

    union all

    select
      'private_listing_seller_onboarding',
      case when onboarding.submitted_at is not null then 'seller_onboarding_submitted' else 'seller_onboarding_created' end,
      onboarding.id::text,
      case when onboarding.submitted_at is not null then 'Seller onboarding submitted' else 'Seller onboarding created' end,
      coalesce(onboarding.status, ''),
      coalesce(onboarding.submitted_at, onboarding.created_at),
      jsonb_build_object(
        'privateListingId', onboarding.private_listing_id,
        'sellerType', onboarding.seller_type,
        'ownershipStructure', onboarding.ownership_structure,
        'maritalRegime', onboarding.marital_regime,
        'status', onboarding.status
      )
    from public.private_listing_seller_onboarding onboarding
    where onboarding.private_listing_id = v_private_listing_id

    union all

    select
      'private_listing_activity',
      coalesce(activity.activity_type, 'listing_activity'),
      activity.id::text,
      coalesce(activity.activity_title, activity.activity_type, 'Listing activity'),
      coalesce(activity.activity_description, ''),
      activity.created_at,
      jsonb_build_object(
        'privateListingId', activity.private_listing_id,
        'visibility', activity.visibility,
        'performedBy', activity.performed_by
      ) || coalesce(activity.metadata, '{}'::jsonb)
    from public.private_listing_activity activity
    where activity.private_listing_id = v_private_listing_id

    union all

    select
      'private_listing_documents',
      'seller_document_uploaded',
      doc.id::text,
      'Seller document uploaded',
      coalesce(doc.document_name, doc.document_type, 'Seller document'),
      coalesce(doc.uploaded_at, doc.created_at),
      jsonb_build_object(
        'privateListingId', doc.private_listing_id,
        'requirementId', doc.requirement_id,
        'documentType', doc.document_type,
        'status', doc.status,
        'visibility', doc.visibility,
        'pendingTransactionPromotion', doc.pending_transaction_promotion,
        'promotedTransactionId', doc.promoted_transaction_id,
        'promotedDocumentId', doc.promoted_document_id
      )
    from public.private_listing_documents doc
    where doc.private_listing_id = v_private_listing_id

    union all

    select
      'document_packets',
      coalesce(pkt.status, 'packet_created'),
      pkt.id::text,
      coalesce(pkt.title, 'Mandate packet'),
      coalesce(pkt.packet_type, 'document_packet'),
      coalesce(pkt.completed_at, pkt.sent_at, pkt.created_at),
      jsonb_build_object(
        'packetId', pkt.id,
        'leadId', pkt.lead_id,
        'transactionId', pkt.transaction_id,
        'status', pkt.status,
        'packetType', pkt.packet_type
      ) || coalesce(pkt.source_context_json, '{}'::jsonb)
    from public.document_packets pkt
    where pkt.id = v_mandate_packet_id
      and pkt.organisation_id = v_organisation_id

    union all

    select
      'document_packet_events',
      event.event_type,
      event.id::text,
      replace(initcap(replace(event.event_type, '_', ' ')), '  ', ' '),
      coalesce(event.event_payload_json ->> 'message', ''),
      event.created_at,
      jsonb_build_object(
        'packetId', event.packet_id,
        'versionId', event.version_id,
        'createdBy', event.created_by
      ) || coalesce(event.event_payload_json, '{}'::jsonb)
    from public.document_packet_events event
    where event.packet_id = v_mandate_packet_id
      and event.organisation_id = v_organisation_id

    union all

    select
      'document_packet_signers',
      coalesce(signer.status, 'signer_created'),
      signer.id::text,
      case when signer.status = 'signed' then 'Mandate signer completed' else 'Mandate signer status' end,
      coalesce(signer.signer_name, signer.signer_email, signer.signer_role, ''),
      coalesce(signer.signed_at, signer.viewed_at, signer.created_at),
      jsonb_build_object(
        'packetId', signer.packet_id,
        'signerRole', signer.signer_role,
        'signerName', signer.signer_name,
        'signerEmail', signer.signer_email,
        'status', signer.status,
        'viewedAt', signer.viewed_at,
        'signedAt', signer.signed_at
      )
    from public.document_packet_signers signer
    where signer.packet_id = v_mandate_packet_id
      and signer.organisation_id = v_organisation_id

    union all

    select
      'transactions',
      'transaction_created',
      t.id::text,
      'Transaction created',
      coalesce(t.status, t.stage, t.current_main_stage, 'Transaction'),
      t.created_at,
      jsonb_build_object(
        'transactionId', t.id,
        'listingId', t.listing_id,
        'stage', t.stage,
        'status', t.status,
        'currentMainStage', t.current_main_stage
      )
    from public.transactions t
    where t.id = any(v_transaction_ids)

    union all

    select
      'transaction_events',
      event.event_type,
      event.id::text,
      replace(initcap(replace(event.event_type, '_', ' ')), '  ', ' '),
      coalesce(event.event_data ->> 'message', event.event_data ->> 'documentName', ''),
      event.created_at,
      jsonb_build_object(
        'transactionId', event.transaction_id,
        'createdBy', event.created_by,
        'createdByRole', event.created_by_role
      ) || coalesce(event.event_data, '{}'::jsonb)
    from public.transaction_events event
    where event.transaction_id = any(v_transaction_ids)
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'sourceTable', source_table,
        'eventType', event_type,
        'sourceId', source_id,
        'title', title,
        'summary', summary,
        'occurredAt', occurred_at,
        'metadata', metadata
      )
      order by occurred_at asc, source_table asc, source_id asc
    ),
    '[]'::jsonb
  )
  into v_timeline
  from timeline_rows
  where occurred_at is not null;

  return jsonb_build_object(
    'ok', true,
    'organisationId', v_organisation_id,
    'privateListingId', v_private_listing_id,
    'leadId', v_lead_id,
    'mandatePacketId', v_mandate_packet_id,
    'transactionIds', coalesce(to_jsonb(v_transaction_ids), '[]'::jsonb),
    'timeline', v_timeline
  );
end;
$$;

comment on function public.bridge_private_listing_conversion_timeline(uuid, uuid)
  is 'Read-only timeline aggregator for Seller Lead to Listing conversion history across lead, onboarding, listing, mandate, seller document, and transaction event sources.';

grant execute on function public.bridge_private_listing_conversion_timeline(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';

commit;
