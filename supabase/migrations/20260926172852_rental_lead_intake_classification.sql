begin;

-- Keep website landlord details inside the existing atomic receipt, lead and
-- notification transaction. Only the service-role website API can call it.
do $website_rental_intake$
declare
  v_definition text;
  v_old_attribution text := '''leadIntent'', nullif(pg_catalog.left(coalesce(p_attribution ->> ''leadIntent'', ''''), 16), '''')';
  v_new_attribution text := '''leadIntent'', nullif(pg_catalog.left(coalesce(p_attribution ->> ''leadIntent'', ''''), 16), ''''),
    ''rentalPropertyAddress'', nullif(pg_catalog.left(trim(coalesce(p_attribution ->> ''rentalPropertyAddress'', '''')), 300), ''''),
    ''rentalPropertyType'', nullif(pg_catalog.left(trim(coalesce(p_attribution ->> ''rentalPropertyType'', '''')), 80), ''''),
    ''expectedMonthlyRent'', nullif(pg_catalog.left(trim(coalesce(p_attribution ->> ''expectedMonthlyRent'', '''')), 40), '''')';
  v_old_intents text := 'v_lead_intent not in (''buy'', ''sell'', ''rent'', ''other'')';
  v_old_category text := 'when v_type = ''general_enquiry'' and v_lead_intent = ''sell'' then ''seller''';
  v_old_bell_title text := 'case when v_lead_category = ''seller'' then ''New seller lead received'' else ''New buyer lead received'' end';
  v_old_bell_route text := '''actionRoute'', ''/pipeline''';
begin
  select pg_get_functiondef(
    'public.website_capture_lead_submission(text,text,uuid,uuid,text,text,text,text,boolean,boolean,text,text,jsonb)'::regprocedure
  ) into v_definition;

  if position(v_old_attribution in v_definition) = 0
    or position(v_old_intents in v_definition) = 0
    or position(v_old_category in v_definition) = 0
    or position(v_old_bell_title in v_definition) = 0
    or position(v_old_bell_route in v_definition) = 0 then
    raise exception 'Website lead capture contract changed; review rental intake migration';
  end if;

  v_definition := replace(v_definition, v_old_attribution, v_new_attribution);
  v_definition := replace(v_definition, v_old_intents,
    'v_lead_intent not in (''buy'', ''sell'', ''rent'', ''let'', ''other'')');
  v_definition := replace(v_definition, v_old_category,
    'when v_type = ''general_enquiry'' and v_lead_intent in (''sell'', ''let'') then ''seller''');
  v_definition := replace(v_definition, v_old_bell_title,
    'case when v_lead_intent = ''let'' then ''New landlord lead received'' when v_lead_intent = ''rent'' or v_publication.listing_type = ''Rental'' then ''New tenant lead received'' when v_lead_category = ''seller'' then ''New seller lead received'' else ''New buyer lead received'' end');
  v_definition := replace(v_definition, v_old_bell_route,
    '''actionRoute'', case when v_lead_intent in (''rent'', ''let'') or v_publication.listing_type = ''Rental'' then ''/agent/rentals/pipeline/leads'' else ''/pipeline'' end');
  execute v_definition;
end;
$website_rental_intake$;

-- Classify only explicit rental intent or a listing known to be rental.
-- Existing leads are deliberately left for a separate reviewed backfill.
create or replace function public.classify_new_rental_lead()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_payload jsonb;
  v_intent text;
  v_listing_id uuid;
  v_listing_category text;
  v_publication_type text;
  v_role text;
  v_address text;
begin
  v_payload := coalesce(new.raw_enquiry_payload, '{}'::jsonb);
  v_listing_id := coalesce(new.enquired_listing_id, new.listing_id);
  if new.lead_domain is distinct from 'agency' or pg_catalog.jsonb_typeof(v_payload) <> 'object' then
    return new;
  end if;
  if v_payload ->> 'arch9RentalLead' = 'true'
    or v_payload ->> 'classification' = 'rental'
    or v_payload ->> 'leadType' = 'rental' then
    return new;
  end if;

  if new.lead_source = 'Website' and new.source_channel = 'website' then
    v_intent := pg_catalog.lower(coalesce(v_payload ->> 'leadIntent', ''));
    if v_intent not in ('rent', 'let') then
      v_intent := pg_catalog.lower(coalesce(v_payload #>> '{attribution,leadIntent}', ''));
    end if;
  end if;

  if v_intent = 'let' then
    v_role := 'landlord';
  elsif v_intent = 'rent' then
    v_role := 'tenant';
  elsif v_listing_id is not null then
    select listing.listing_category, publication.listing_type
    into v_listing_category, v_publication_type
    from public.private_listings listing
    left join public.listing_publication_data publication on publication.listing_id = listing.id
    where listing.id = v_listing_id and listing.organisation_id = new.organisation_id;
    if coalesce(v_publication_type, case when pg_catalog.lower(coalesce(v_listing_category, '')) = 'rental' then 'Rental' end) = 'Rental' then
      v_role := 'tenant';
    end if;
  end if;

  if v_role is null then return new; end if;

  v_address := nullif(pg_catalog.left(trim(coalesce(v_payload #>> '{attribution,rentalPropertyAddress}', '')), 300), '');
  new.raw_enquiry_payload := v_payload || pg_catalog.jsonb_build_object(
    'version', 'arch9_rental_crm_lead_model_v1',
    'arch9RentalLead', true,
    'classification', 'rental',
    'leadType', 'rental',
    'role', v_role,
    'stage', 'new',
    'leadId', new.lead_id,
    'organisationId', new.organisation_id,
    'assignedAgentId', new.assigned_agent_id,
    'source', coalesce(new.lead_source, 'unknown'),
    'propertyAddress', v_address,
    'propertyType', v_payload #>> '{attribution,rentalPropertyType}',
    'expectedMonthlyRent', v_payload #>> '{attribution,expectedMonthlyRent}',
    'relationships', pg_catalog.jsonb_build_object('listingId', v_listing_id),
    'consents', pg_catalog.jsonb_build_object(
      'privacy', case when v_payload ->> 'privacyAccepted' = 'true' then 'granted' else 'not_captured' end,
      'marketing', case when v_payload ->> 'marketingConsent' = 'true' then 'granted' when v_payload ->> 'marketingConsent' = 'false' then 'declined' else 'not_captured' end,
      'screening', 'not_captured'
    ),
    'qualification', pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
      'propertyAddress', v_address,
      'propertyType', v_payload #>> '{attribution,rentalPropertyType}',
      'expectedMonthlyRent', v_payload #>> '{attribution,expectedMonthlyRent}'
    )),
    'ingestion', pg_catalog.jsonb_build_object('classification', 'rental_intake_v1')
  );
  if v_role = 'landlord' and v_address is not null then
    new.seller_property_address := v_address;
  end if;
  return new;
end;
$$;

drop trigger if exists classify_new_rental_lead on public.leads;
create trigger classify_new_rental_lead
before insert on public.leads
for each row execute function public.classify_new_rental_lead();

revoke all on function public.classify_new_rental_lead() from public, anon, authenticated;

commit;
