begin;

do $$
declare
  v_canonical_org_id uuid := 'efa6c6ff-6941-4b59-8bcb-e4d9ba9e585a';
  v_created_contacts integer := 0;
  v_upserted_leads integer := 0;
  v_linked_listings integer := 0;
begin
  create temp table tmp_produktive_listing_lead_backfill on commit drop as
  with source_listings as (
    select
      listing.id as listing_id,
      listing.organisation_id,
      listing.assigned_agent_id,
      listing.created_by,
      listing.branch_id,
      listing.listing_reference,
      listing.title,
      listing.asking_price,
      listing.estimated_value,
      listing.formatted_address,
      listing.street_address,
      listing.address_line_1,
      listing.suburb,
      listing.city,
      listing.province,
      listing.country,
      listing.postal_code,
      listing.latitude,
      listing.longitude,
      listing.google_place_id,
      listing.seller_onboarding_status,
      listing.internal_listing_notes,
      coalesce(listing.seller_canonical_facts_json, '{}'::jsonb) as seller_facts,
      listing.created_at,
      listing.updated_at,
      coalesce(
        listing.seller_lead_id,
        listing.originating_crm_lead_id,
        (
          substr(md5('produktive-seller-lead:' || listing.id::text), 1, 8) || '-' ||
          substr(md5('produktive-seller-lead:' || listing.id::text), 9, 4) || '-' ||
          substr(md5('produktive-seller-lead:' || listing.id::text), 13, 4) || '-' ||
          substr(md5('produktive-seller-lead:' || listing.id::text), 17, 4) || '-' ||
          substr(md5('produktive-seller-lead:' || listing.id::text), 21, 12)
        )::uuid
      ) as lead_id
    from public.private_listings listing
    where listing.organisation_id = v_canonical_org_id
  ),
  normalized as (
    select
      source_listings.*,
      nullif(trim(source_listings.seller_facts ->> 'sellerName'), '') as seller_name,
      nullif(trim(coalesce(
        source_listings.formatted_address,
        source_listings.street_address,
        source_listings.address_line_1,
        source_listings.title
      )), '') as property_address,
      nullif(trim(coalesce(
        source_listings.title,
        source_listings.formatted_address,
        source_listings.street_address,
        source_listings.address_line_1
      )), '') as property_interest
    from source_listings
  )
  select
    normalized.*,
    case
      when normalized.seller_name is null then null::uuid
      else (
        substr(md5('produktive-seller-contact:' || normalized.listing_id::text), 1, 8) || '-' ||
        substr(md5('produktive-seller-contact:' || normalized.listing_id::text), 9, 4) || '-' ||
        substr(md5('produktive-seller-contact:' || normalized.listing_id::text), 13, 4) || '-' ||
        substr(md5('produktive-seller-contact:' || normalized.listing_id::text), 17, 4) || '-' ||
        substr(md5('produktive-seller-contact:' || normalized.listing_id::text), 21, 12)
      )::uuid
    end as contact_id
  from normalized;

  insert into public.contacts as existing_contact (
    contact_id,
    organisation_id,
    assigned_agent_id,
    first_name,
    last_name,
    phone,
    email,
    contact_type,
    notes,
    created_at,
    updated_at,
    is_demo_data,
    demo_metadata
  )
  select
    contact_id,
    organisation_id,
    assigned_agent_id,
    seller_name,
    '',
    null,
    null,
    'seller',
    'Backfilled from Produktive listing import ' || coalesce(listing_reference, listing_id::text) || '.',
    coalesce(created_at, now()),
    now(),
    false,
    jsonb_build_object(
      'source', 'produktive_listing_lead_backfill',
      'listingId', listing_id,
      'listingReference', listing_reference
    )
  from tmp_produktive_listing_lead_backfill
  where contact_id is not null
  on conflict (contact_id) do update
    set organisation_id = excluded.organisation_id,
        assigned_agent_id = coalesce(excluded.assigned_agent_id, existing_contact.assigned_agent_id),
        first_name = coalesce(nullif(excluded.first_name, ''), existing_contact.first_name),
        contact_type = 'seller',
        notes = coalesce(existing_contact.notes, excluded.notes),
        updated_at = now(),
        is_demo_data = false,
        demo_metadata = coalesce(existing_contact.demo_metadata, '{}'::jsonb) || excluded.demo_metadata;

  get diagnostics v_created_contacts = row_count;

  insert into public.leads as existing_lead (
    lead_id,
    organisation_id,
    assigned_agent_id,
    contact_id,
    lead_category,
    lead_direction,
    lead_source,
    stage,
    status,
    priority,
    budget,
    area_interest,
    property_interest,
    seller_property_address,
    estimated_value,
    notes,
    created_at,
    updated_at,
    branch_id,
    listing_id,
    seller_onboarding_status,
    lead_type,
    current_stage,
    assigned_user_id,
    created_by,
    is_demo_data,
    demo_metadata,
    assigned_at,
    ownership_status,
    formatted_address,
    street_address,
    suburb,
    city,
    province,
    country,
    postal_code,
    latitude,
    longitude,
    google_place_id,
    enquired_listing_id,
    enquired_property_title,
    enquired_property_address,
    enquired_property_price,
    source_reference_id,
    raw_enquiry_payload,
    lead_domain,
    source_channel
  )
  select
    lead_id,
    organisation_id,
    assigned_agent_id,
    contact_id,
    'seller',
    'Outbound',
    'Produktive listing backfill',
    'New Lead',
    'New Lead',
    'Medium',
    0,
    null,
    property_interest,
    property_address,
    coalesce(estimated_value, asking_price, 0),
    nullif(trim(concat_ws(E'\n',
      'Backfilled from Produktive listing import.',
      'Listing reference: ' || nullif(listing_reference, ''),
      internal_listing_notes
    )), ''),
    coalesce(created_at, now()),
    now(),
    branch_id,
    listing_id::text,
    case
      when seller_onboarding_status in ('not_started', 'sent', 'in_progress', 'completed', 'rejected') then seller_onboarding_status
      else 'not_started'
    end,
    'seller',
    'New Lead',
    assigned_agent_id,
    created_by,
    false,
    jsonb_build_object(
      'source', 'produktive_listing_lead_backfill',
      'listingId', listing_id,
      'listingReference', listing_reference,
      'sellerName', seller_name,
      'sellerFacts', seller_facts
    ),
    case when assigned_agent_id is not null then now() else null end,
    case when assigned_agent_id is not null then 'assigned' else 'awaiting_assignment' end,
    property_address,
    coalesce(street_address, address_line_1, property_address),
    suburb,
    city,
    province,
    coalesce(country, 'South Africa'),
    postal_code,
    latitude,
    longitude,
    google_place_id,
    listing_id,
    property_interest,
    property_address,
    coalesce(estimated_value, asking_price),
    listing_reference,
    jsonb_build_object(
      'source', 'produktive_listing_lead_backfill',
      'listingId', listing_id,
      'listingReference', listing_reference,
      'sellerName', seller_name,
      'sellerFacts', seller_facts
    ),
    'agency',
    'manual'
  from tmp_produktive_listing_lead_backfill
  on conflict (lead_id) do update
    set organisation_id = excluded.organisation_id,
        assigned_agent_id = coalesce(excluded.assigned_agent_id, existing_lead.assigned_agent_id),
        contact_id = coalesce(existing_lead.contact_id, excluded.contact_id),
        lead_category = 'seller',
        lead_source = coalesce(existing_lead.lead_source, excluded.lead_source),
        stage = coalesce(existing_lead.stage, excluded.stage),
        status = coalesce(existing_lead.status, excluded.status),
        priority = coalesce(existing_lead.priority, excluded.priority),
        property_interest = coalesce(existing_lead.property_interest, excluded.property_interest),
        seller_property_address = coalesce(existing_lead.seller_property_address, excluded.seller_property_address),
        estimated_value = greatest(coalesce(existing_lead.estimated_value, 0), coalesce(excluded.estimated_value, 0)),
        notes = coalesce(existing_lead.notes, excluded.notes),
        updated_at = now(),
        branch_id = coalesce(existing_lead.branch_id, excluded.branch_id),
        listing_id = coalesce(existing_lead.listing_id, excluded.listing_id),
        seller_onboarding_status = coalesce(existing_lead.seller_onboarding_status, excluded.seller_onboarding_status, 'not_started'),
        lead_type = coalesce(existing_lead.lead_type, excluded.lead_type),
        current_stage = coalesce(existing_lead.current_stage, excluded.current_stage),
        assigned_user_id = coalesce(existing_lead.assigned_user_id, excluded.assigned_user_id),
        created_by = coalesce(existing_lead.created_by, excluded.created_by),
        is_demo_data = false,
        demo_metadata = coalesce(existing_lead.demo_metadata, '{}'::jsonb) || excluded.demo_metadata,
        ownership_status = case
          when existing_lead.ownership_status is not null then existing_lead.ownership_status
          when excluded.assigned_agent_id is not null then 'assigned'
          else 'awaiting_assignment'
        end,
        formatted_address = coalesce(existing_lead.formatted_address, excluded.formatted_address),
        street_address = coalesce(existing_lead.street_address, excluded.street_address),
        suburb = coalesce(existing_lead.suburb, excluded.suburb),
        city = coalesce(existing_lead.city, excluded.city),
        province = coalesce(existing_lead.province, excluded.province),
        country = coalesce(existing_lead.country, excluded.country),
        postal_code = coalesce(existing_lead.postal_code, excluded.postal_code),
        latitude = coalesce(existing_lead.latitude, excluded.latitude),
        longitude = coalesce(existing_lead.longitude, excluded.longitude),
        google_place_id = coalesce(existing_lead.google_place_id, excluded.google_place_id),
        enquired_listing_id = coalesce(existing_lead.enquired_listing_id, excluded.enquired_listing_id),
        enquired_property_title = coalesce(existing_lead.enquired_property_title, excluded.enquired_property_title),
        enquired_property_address = coalesce(existing_lead.enquired_property_address, excluded.enquired_property_address),
        enquired_property_price = coalesce(existing_lead.enquired_property_price, excluded.enquired_property_price),
        source_reference_id = coalesce(existing_lead.source_reference_id, excluded.source_reference_id),
        raw_enquiry_payload = coalesce(existing_lead.raw_enquiry_payload, '{}'::jsonb) || excluded.raw_enquiry_payload,
        lead_domain = coalesce(existing_lead.lead_domain, excluded.lead_domain),
        source_channel = coalesce(existing_lead.source_channel, excluded.source_channel);

  get diagnostics v_upserted_leads = row_count;

  update public.private_listings listing
     set seller_lead_id = backfill.lead_id,
         originating_crm_lead_id = backfill.lead_id,
         updated_at = now()
    from tmp_produktive_listing_lead_backfill backfill
   where listing.id = backfill.listing_id
     and listing.organisation_id = v_canonical_org_id
     and (
       listing.seller_lead_id is distinct from backfill.lead_id
       or listing.originating_crm_lead_id is distinct from backfill.lead_id
     );

  get diagnostics v_linked_listings = row_count;

  raise notice 'Produktive lead backfill: contacts %, leads %, listings linked %',
    v_created_contacts,
    v_upserted_leads,
    v_linked_listings;
end;
$$;

commit;
