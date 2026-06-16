begin;

alter table if exists public.private_listings
  add column if not exists seller_lead_id uuid references public.leads(lead_id) on delete set null,
  add column if not exists mandate_packet_id uuid references public.document_packets(id) on delete set null;

with completed_mandates as (
  select
    pkt.id as packet_id,
    pkt.organisation_id,
    coalesce(
      pkt.lead_id::text,
      nullif(trim(pkt.source_context_json->>'leadId'), ''),
      nullif(trim(pkt.source_context_json->>'lead_id'), ''),
      nullif(trim(pkt.source_context_json->>'uiLeadId'), ''),
      nullif(trim(pkt.source_context_json->>'sellerLeadId'), '')
    ) as lead_id_text,
    coalesce(pkt.completed_at, pkt.updated_at, pkt.created_at, now()) as signed_at
  from public.document_packets pkt
  where pkt.packet_type = 'mandate'
    and pkt.status in ('completed', 'signed', 'fully_signed')
),
eligible as (
  select
    completed_mandates.packet_id,
    completed_mandates.organisation_id,
    completed_mandates.signed_at,
    lead.lead_id,
    lead.assigned_agent_id,
    lead.seller_onboarding_status,
    lead.seller_property_address,
    lead.property_interest,
    lead.area_interest,
    lead.estimated_value,
    lead.budget,
    lead.notes
  from completed_mandates
  join public.leads lead
    on lead.organisation_id = completed_mandates.organisation_id
   and lead.lead_id::text = completed_mandates.lead_id_text
  where completed_mandates.lead_id_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$'
    and not exists (
      select 1
      from public.private_listings existing
      where existing.organisation_id = completed_mandates.organisation_id
        and coalesce(existing.listing_status, '') <> 'withdrawn'
        and coalesce(existing.listing_visibility, '') <> 'archived'
        and (
          existing.mandate_packet_id = completed_mandates.packet_id
          or existing.seller_lead_id::text = completed_mandates.lead_id_text
          or existing.originating_crm_lead_id::text = completed_mandates.lead_id_text
        )
    )
),
inserted as (
  insert into public.private_listings (
    organisation_id,
    assigned_agent_id,
    seller_lead_id,
    originating_crm_lead_id,
    listing_reference,
    listing_status,
    listing_visibility,
    property_type,
    listing_category,
    title,
    description,
    asking_price,
    estimated_value,
    address_line_1,
    suburb,
    mandate_type,
    mandate_status,
    mandate_packet_id,
    seller_onboarding_status,
    is_active,
    created_by,
    bridge_listing_status,
    internal_listing_notes,
    created_at,
    updated_at
  )
  select
    eligible.organisation_id,
    eligible.assigned_agent_id,
    eligible.lead_id,
    eligible.lead_id::text,
    'PL-' || upper(substr(md5(eligible.packet_id::text), 1, 8)),
    'mandate_signed',
    'internal',
    null,
    'private_sale',
    coalesce(
      nullif(trim(eligible.property_interest), ''),
      nullif(trim(eligible.seller_property_address), ''),
      nullif(trim(eligible.area_interest), ''),
      'Signed mandate listing'
    ),
    nullif(trim(coalesce(eligible.notes, '')), ''),
    nullif(coalesce(eligible.estimated_value, eligible.budget, 0), 0),
    nullif(coalesce(eligible.estimated_value, eligible.budget, 0), 0),
    coalesce(
      nullif(trim(eligible.seller_property_address), ''),
      nullif(trim(eligible.property_interest), ''),
      nullif(trim(eligible.area_interest), '')
    ),
    nullif(trim(coalesce(eligible.area_interest, '')), ''),
    'sole',
    'signed',
    eligible.packet_id,
    case
      when lower(coalesce(eligible.seller_onboarding_status, '')) like '%complete%' then 'completed'
      else coalesce(nullif(trim(eligible.seller_onboarding_status), ''), 'completed')
    end,
    false,
    eligible.assigned_agent_id,
    'not_published',
    'Backfilled from signed mandate packet ' || eligible.packet_id::text,
    eligible.signed_at,
    now()
  from eligible
  returning id, organisation_id, seller_lead_id, mandate_packet_id
)
update public.leads lead
   set listing_id = inserted.id,
       stage = 'Converted To Listing',
       status = 'Converted To Listing',
       mandate_packet_id = inserted.mandate_packet_id,
       updated_at = now()
from inserted
where lead.organisation_id = inserted.organisation_id
  and lead.lead_id = inserted.seller_lead_id;

insert into public.private_listing_activity (
  private_listing_id,
  activity_type,
  activity_title,
  activity_description,
  visibility,
  metadata,
  created_at
)
select
  listing.id,
  'listing_created_after_mandate',
  'Listing backfilled from signed mandate',
  'Bridge created this private listing from an already completed mandate packet.',
  'internal',
  jsonb_build_object(
    'source', 'signed_mandate_backfill',
    'packetId', listing.mandate_packet_id,
    'leadId', listing.seller_lead_id
  ),
  now()
from public.private_listings listing
where listing.listing_status = 'mandate_signed'
  and listing.mandate_packet_id is not null
  and not exists (
    select 1
    from public.private_listing_activity existing
    where existing.private_listing_id = listing.id
      and existing.activity_type = 'listing_created_after_mandate'
  );

notify pgrst, 'reload schema';

commit;
