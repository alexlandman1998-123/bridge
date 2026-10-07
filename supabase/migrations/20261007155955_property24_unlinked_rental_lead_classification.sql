begin;

-- Refuse to overwrite a classifier that changed since this repair was reviewed.
do $classifier_baseline$
begin
  if not exists (
    select 1 from pg_catalog.pg_proc
    where oid = 'public.classify_new_rental_lead()'::regprocedure
      and pg_catalog.md5(prosrc) in ('bc2765a00d272acbda254782fa1c13a5', '2708c1c016df0a30cade81453ecf8286')
  ) then
    raise exception 'Rental classifier changed; review before applying the Property24 correction.';
  end if;
end;
$classifier_baseline$;

-- Recognise explicit unlinked Property24 rental enquiries in the existing CRM.
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
  v_listing_id := new.enquired_listing_id;
  if v_listing_id is null and new.listing_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    v_listing_id := new.listing_id::uuid;
  end if;
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
  elsif v_listing_id is null and new.lead_source = 'Property24'
    and pg_catalog.lower(pg_catalog.btrim(coalesce(v_payload ->> 'listingType', ''))) = 'rental' then
    -- Agency-verified historical adverts may have no local listing yet.
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

revoke all on function public.classify_new_rental_lead() from public, anon, authenticated;

-- Target only the 45 Lost records from the reviewed 5 October import batch.
-- Keep contact identity, assignment, notes, status and original enquiry intact.
-- Zero remaining candidates permits a repeat after the full correction.
do $repair_historical_property24_rentals$
declare
  v_expected bigint;
  v_updated bigint;
begin
  select count(*) into v_expected from public.leads where lead_domain = 'agency' and lead_source = 'Property24'
    and organisation_id = '13c6b79f-1d8b-4886-aabf-42ea49565ef5'::uuid
    and enquired_listing_id is null and listing_id is null and status = 'Lost'
    and created_at >= '2026-10-05 07:40:51+00'::timestamptz
    and created_at < '2026-10-05 07:41:49+00'::timestamptz
    and raw_enquiry_payload ->> 'listingType' = 'Rental'
    and raw_enquiry_payload #>> '{agencyVerification,source}' = 'property24_listing_statistics'
    and raw_enquiry_payload #>> '{agencyVerification,agencyId}' = '39227'
    and coalesce(raw_enquiry_payload ->> 'arch9RentalLead', '') <> 'true'
    and pg_catalog.lower(coalesce(raw_enquiry_payload ->> 'classification', '')) <> 'rental'
    and pg_catalog.lower(coalesce(raw_enquiry_payload ->> 'leadType', raw_enquiry_payload ->> 'lead_type', '')) <> 'rental'
    and not (raw_enquiry_payload ? 'rentalCrm' or raw_enquiry_payload ? 'rental_crm');
  if v_expected not in (0, 45) then
    raise exception 'Property24 rental repair scope changed: expected 45 or 0 candidates, found %', v_expected;
  end if;

  update public.leads
  set raw_enquiry_payload = raw_enquiry_payload || pg_catalog.jsonb_build_object(
    'version', 'arch9_rental_crm_lead_model_v1',
    'arch9RentalLead', true, 'classification', 'rental', 'leadType', 'rental',
    'role', 'tenant', 'stage', 'new', 'source', 'Property24',
    'leadId', lead_id, 'organisationId', organisation_id,
    'assignedAgentId', assigned_agent_id, 'branchId', branch_id,
    'consents', pg_catalog.jsonb_build_object('privacy', 'not_captured', 'marketing', 'not_captured', 'screening', 'not_captured')
      || case when pg_catalog.jsonb_typeof(raw_enquiry_payload -> 'consents') = 'object' then raw_enquiry_payload -> 'consents' else '{}'::jsonb end,
    'relationships', pg_catalog.jsonb_build_object('listingId', null)
      || case when pg_catalog.jsonb_typeof(raw_enquiry_payload -> 'relationships') = 'object' then raw_enquiry_payload -> 'relationships' else '{}'::jsonb end,
    'outcome', (case when pg_catalog.jsonb_typeof(raw_enquiry_payload -> 'outcome') = 'object' then raw_enquiry_payload -> 'outcome' else '{}'::jsonb end)
      || pg_catalog.jsonb_build_object('version', 'arch9_rental_lead_outcome_v1', 'status', 'lost'),
    'ingestion', (case when pg_catalog.jsonb_typeof(raw_enquiry_payload -> 'ingestion') = 'object' then raw_enquiry_payload -> 'ingestion' else '{}'::jsonb end)
      || pg_catalog.jsonb_build_object('classification', 'property24_unlinked_rental_repair_v1')
  )
  where lead_domain = 'agency' and lead_source = 'Property24'
    and organisation_id = '13c6b79f-1d8b-4886-aabf-42ea49565ef5'::uuid
    and enquired_listing_id is null and listing_id is null and status = 'Lost'
    and created_at >= '2026-10-05 07:40:51+00'::timestamptz
    and created_at < '2026-10-05 07:41:49+00'::timestamptz
    and raw_enquiry_payload ->> 'listingType' = 'Rental'
    and raw_enquiry_payload #>> '{agencyVerification,source}' = 'property24_listing_statistics'
    and raw_enquiry_payload #>> '{agencyVerification,agencyId}' = '39227'
    and coalesce(raw_enquiry_payload ->> 'arch9RentalLead', '') <> 'true'
    and pg_catalog.lower(coalesce(raw_enquiry_payload ->> 'classification', '')) <> 'rental'
    and pg_catalog.lower(coalesce(raw_enquiry_payload ->> 'leadType', raw_enquiry_payload ->> 'lead_type', '')) <> 'rental'
    and not (raw_enquiry_payload ? 'rentalCrm' or raw_enquiry_payload ? 'rental_crm');
  get diagnostics v_updated = row_count;
  if v_updated <> v_expected then
    raise exception 'Property24 rental repair changed during execution; no correction committed.';
  end if;
end;
$repair_historical_property24_rentals$;

commit;
