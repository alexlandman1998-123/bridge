begin;

-- The legal-document agent notification trigger runs inside the authoritative
-- signing-delivery transaction.  Its context helper returns an OUT column named
-- lead_id, so the unqualified leads.lead_id predicate can become ambiguous and
-- abort provider-confirmed delivery after the email has already been accepted.
create or replace function public.bridge_legal_document_agent_context_phase1(
  p_packet_id uuid,
  p_payload jsonb default '{}'::jsonb
)
returns table(
  organisation_id uuid,
  transaction_id uuid,
  listing_id uuid,
  lead_id uuid,
  agent_user_id uuid,
  packet_type text,
  document_label text,
  action_path text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_packet public.document_packets%rowtype;
  v_transaction public.transactions%rowtype;
  v_listing public.private_listings%rowtype;
  v_lead public.leads%rowtype;
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_source_context jsonb;
  v_transaction_id uuid;
  v_listing_id uuid;
  v_lead_id uuid;
  v_agent_user_id uuid;
begin
  select *
    into v_packet
  from public.document_packets
  where id = p_packet_id;

  if v_packet.id is null then
    return;
  end if;

  v_source_context := coalesce(v_packet.source_context_json, '{}'::jsonb) || v_payload;

  v_transaction_id := coalesce(
    public.bridge_legal_document_notification_uuid_phase1(to_jsonb(v_packet) ->> 'transaction_id'),
    public.bridge_legal_document_notification_uuid_phase1(v_source_context ->> 'transactionId'),
    public.bridge_legal_document_notification_uuid_phase1(v_source_context ->> 'transaction_id')
  );

  if v_transaction_id is not null then
    select *
      into v_transaction
    from public.transactions transaction_row
    where transaction_row.id = v_transaction_id
    limit 1;
  end if;

  if v_transaction.id is null then
    select *
      into v_transaction
    from public.transactions transaction_row
    where to_jsonb(transaction_row) ->> 'mandate_packet_id' = p_packet_id::text
       or to_jsonb(transaction_row) ->> 'otp_packet_id' = p_packet_id::text
    order by transaction_row.updated_at desc nulls last, transaction_row.created_at desc nulls last
    limit 1;
  end if;

  v_transaction_id := coalesce(v_transaction.id, v_transaction_id);

  v_listing_id := coalesce(
    public.bridge_legal_document_notification_uuid_phase1(to_jsonb(v_transaction) ->> 'listing_id'),
    public.bridge_legal_document_notification_uuid_phase1(to_jsonb(v_packet) ->> 'listing_id'),
    public.bridge_legal_document_notification_uuid_phase1(v_source_context ->> 'listingId'),
    public.bridge_legal_document_notification_uuid_phase1(v_source_context ->> 'listing_id'),
    public.bridge_legal_document_notification_uuid_phase1(v_source_context ->> 'privateListingId'),
    public.bridge_legal_document_notification_uuid_phase1(v_source_context ->> 'private_listing_id')
  );

  if v_listing_id is not null then
    select *
      into v_listing
    from public.private_listings listing_row
    where listing_row.id = v_listing_id
    limit 1;
  end if;

  if v_listing.id is null then
    select *
      into v_listing
    from public.private_listings listing_row
    where listing_row.mandate_packet_id = p_packet_id
    order by listing_row.updated_at desc nulls last, listing_row.created_at desc nulls last
    limit 1;
  end if;

  v_listing_id := coalesce(v_listing.id, v_listing_id);

  v_lead_id := coalesce(
    public.bridge_legal_document_notification_uuid_phase1(to_jsonb(v_transaction) ->> 'originating_lead_id'),
    public.bridge_legal_document_notification_uuid_phase1(to_jsonb(v_transaction) ->> 'lead_id'),
    public.bridge_legal_document_notification_uuid_phase1(to_jsonb(v_listing) ->> 'seller_lead_id'),
    public.bridge_legal_document_notification_uuid_phase1(to_jsonb(v_listing) ->> 'originating_crm_lead_id'),
    public.bridge_legal_document_notification_uuid_phase1(to_jsonb(v_packet) ->> 'lead_id'),
    public.bridge_legal_document_notification_uuid_phase1(v_source_context ->> 'leadId'),
    public.bridge_legal_document_notification_uuid_phase1(v_source_context ->> 'lead_id')
  );

  if v_lead_id is not null then
    select *
      into v_lead
    from public.leads lead_row
    where lead_row.lead_id = v_lead_id
    limit 1;
  end if;

  v_agent_user_id := coalesce(
    public.bridge_legal_document_notification_uuid_phase1(to_jsonb(v_packet) ->> 'assigned_agent_id'),
    public.bridge_legal_document_notification_uuid_phase1(to_jsonb(v_packet) ->> 'assigned_user_id'),
    public.bridge_legal_document_notification_uuid_phase1(to_jsonb(v_transaction) ->> 'assigned_agent_id'),
    public.bridge_legal_document_notification_uuid_phase1(to_jsonb(v_transaction) ->> 'owner_user_id'),
    v_listing.assigned_agent_id,
    v_lead.assigned_agent_id,
    public.bridge_legal_document_notification_uuid_phase1(to_jsonb(v_packet) ->> 'created_by')
  );

  organisation_id := coalesce(v_packet.organisation_id, v_transaction.organisation_id, v_listing.organisation_id, v_lead.organisation_id);
  transaction_id := v_transaction_id;
  listing_id := v_listing_id;
  lead_id := v_lead_id;
  agent_user_id := v_agent_user_id;
  packet_type := lower(coalesce(nullif(trim(to_jsonb(v_packet) ->> 'packet_type'), ''), 'document'));
  document_label := public.bridge_legal_document_notification_label_phase1(packet_type);
  action_path := '/legal-documents/' || p_packet_id::text;
  return next;
end;
$$;

comment on function public.bridge_legal_document_agent_context_phase1(uuid, jsonb) is
  'Resolves agent-facing notification context for legal-document events with qualified lead lookup safe for signing-delivery triggers.';

commit;
