begin;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create or replace function private.bridge_reconcile_listing_from_completed_seller_onboarding()
returns trigger
language plpgsql
security definer
set search_path = ''
as $func$
declare
  v_listing public.private_listings%rowtype;
  v_form jsonb := coalesce(new.form_data, '{}'::jsonb);
  v_address text := nullif(pg_catalog.btrim(coalesce(v_form->>'propertyAddress', v_form->>'propertyAddressSearch', '')), '');
  v_address_line_1 text := nullif(pg_catalog.btrim(coalesce(v_form->>'propertyAddressLine1', v_form->>'streetAddress', v_address, '')), '');
  v_address_line_2 text := nullif(pg_catalog.btrim(coalesce(v_form->>'propertyAddressLine2', '')), '');
  v_place_id text := nullif(pg_catalog.btrim(coalesce(v_form->>'googlePlaceId', v_form#>>'{propertyAddressDetails,placeId}', '')), '');
  v_existing_address text;
  v_property_changed boolean := false;
  v_latitude numeric := null;
  v_longitude numeric := null;
  v_asking_price numeric := null;
begin
  if new.status <> 'completed' then
    return new;
  end if;

  select *
    into v_listing
  from public.private_listings
  where id = new.private_listing_id
  for update;

  if not found then
    return new;
  end if;

  v_existing_address := nullif(pg_catalog.btrim(pg_catalog.concat_ws(', ',
    nullif(v_listing.address_line_1, ''),
    nullif(v_listing.address_line_2, ''),
    nullif(v_listing.suburb, ''),
    nullif(v_listing.city, ''),
    nullif(v_listing.province, ''),
    nullif(v_listing.postal_code, '')
  )), '');

  v_property_changed := case
    when v_place_id is not null and nullif(pg_catalog.btrim(v_listing.google_place_id), '') is not null
      then v_place_id <> nullif(pg_catalog.btrim(v_listing.google_place_id), '')
    when v_address is not null and v_existing_address is not null
      then pg_catalog.regexp_replace(pg_catalog.lower(v_address), '[^a-z0-9]+', '', 'g')
        <> pg_catalog.regexp_replace(pg_catalog.lower(v_existing_address), '[^a-z0-9]+', '', 'g')
    else false
  end;

  if coalesce(v_form->>'latitude', '') ~ '^-?[0-9]+([.][0-9]+)?$' then
    v_latitude := (v_form->>'latitude')::numeric;
  end if;
  if coalesce(v_form->>'longitude', '') ~ '^-?[0-9]+([.][0-9]+)?$' then
    v_longitude := (v_form->>'longitude')::numeric;
  end if;
  if coalesce(v_form->>'askingPrice', '') ~ '^-?[0-9]+([.][0-9]+)?$' then
    v_asking_price := (v_form->>'askingPrice')::numeric;
  end if;

  update public.private_listings
     set address_line_1 = coalesce(v_address_line_1, address_line_1),
         address_line_2 = coalesce(v_address_line_2, address_line_2),
         street_address = coalesce(v_address_line_1, street_address),
         suburb = coalesce(nullif(pg_catalog.btrim(v_form->>'suburb'), ''), suburb),
         city = coalesce(nullif(pg_catalog.btrim(v_form->>'city'), ''), city),
         province = coalesce(nullif(pg_catalog.btrim(v_form->>'province'), ''), province),
         country = coalesce(nullif(pg_catalog.btrim(v_form->>'country'), ''), country),
         postal_code = coalesce(nullif(pg_catalog.btrim(v_form->>'postalCode'), ''), postal_code),
         google_place_id = coalesce(v_place_id, google_place_id),
         latitude = coalesce(v_latitude, latitude),
         longitude = coalesce(v_longitude, longitude),
         property_type = coalesce(nullif(pg_catalog.btrim(v_form->>'propertyType'), ''), property_type),
         asking_price = coalesce(v_asking_price, asking_price),
         estimated_value = coalesce(v_asking_price, estimated_value),
         seller_onboarding_status = 'completed',
         listing_status = case when v_property_changed then 'onboarding_completed' else listing_status end,
         listing_visibility = case when v_property_changed then 'internal' else listing_visibility end,
         is_active = case when v_property_changed then false else is_active end,
         mandate_status = case when v_property_changed then 'not_started' else mandate_status end,
         mandate_packet_id = case when v_property_changed then null else mandate_packet_id end,
         updated_at = pg_catalog.now()
   where id = new.private_listing_id;

  if v_property_changed then
    update public.private_listing_documents
       set status = 'not_applicable',
           updated_at = pg_catalog.now()
     where private_listing_id = new.private_listing_id
       and pg_catalog.lower(coalesce(document_type, '')) in (
         'signed_mandate', 'signed mandate', 'mandate_signed', 'sales_mandate_signed'
       )
       and status <> 'not_applicable';

    update public.private_listing_document_requirements
       set status = 'required',
           is_required = true,
           updated_at = pg_catalog.now()
     where private_listing_id = new.private_listing_id
       and (requirement_group = 'mandate' or pg_catalog.lower(requirement_key) like '%mandate%');

    update public.leads
       set stage = 'Seller Onboarding Submitted',
           status = 'Submitted',
           seller_property_address = coalesce(v_address, v_address_line_1, seller_property_address),
           formatted_address = coalesce(v_address, formatted_address),
           street_address = coalesce(v_address_line_1, street_address),
           suburb = coalesce(nullif(pg_catalog.btrim(v_form->>'suburb'), ''), suburb),
           city = coalesce(nullif(pg_catalog.btrim(v_form->>'city'), ''), city),
           province = coalesce(nullif(pg_catalog.btrim(v_form->>'province'), ''), province),
           country = coalesce(nullif(pg_catalog.btrim(v_form->>'country'), ''), country),
           postal_code = coalesce(nullif(pg_catalog.btrim(v_form->>'postalCode'), ''), postal_code),
           google_place_id = coalesce(v_place_id, google_place_id),
           latitude = coalesce(v_latitude, latitude),
           longitude = coalesce(v_longitude, longitude),
           estimated_value = coalesce(v_asking_price, estimated_value),
           mandate_packet_id = null,
           seller_onboarding_status = 'completed',
           listing_id = new.private_listing_id,
           updated_at = pg_catalog.now()
     where organisation_id = v_listing.organisation_id
       and lead_id::text in (
         v_listing.seller_lead_id::text,
         v_listing.originating_crm_lead_id::text
       );

    insert into public.private_listing_activity (
      private_listing_id,
      activity_type,
      activity_title,
      activity_description,
      visibility,
      metadata
    ) values (
      new.private_listing_id,
      'seller_property_changed_after_mandate',
      'Property details changed — mandate reset',
      'Seller onboarding identified a different property. The previous mandate remains in the audit trail but no longer satisfies this listing.',
      'internal',
      pg_catalog.jsonb_build_object(
        'source', 'seller_onboarding_reconciliation',
        'previousAddress', v_existing_address,
        'submittedAddress', v_address,
        'onboardingId', new.id
      )
    );
  end if;

  return new;
end;
$func$;

revoke all on function private.bridge_reconcile_listing_from_completed_seller_onboarding() from public, anon, authenticated;

drop trigger if exists bridge_reconcile_listing_from_completed_seller_onboarding
  on public.private_listing_seller_onboarding;
create trigger bridge_reconcile_listing_from_completed_seller_onboarding
after insert or update
on public.private_listing_seller_onboarding
for each row
when (new.status = 'completed')
execute function private.bridge_reconcile_listing_from_completed_seller_onboarding();

comment on function private.bridge_reconcile_listing_from_completed_seller_onboarding() is
  'Projects completed seller onboarding property fields to the canonical listing and retires property-specific mandate evidence when the property identity changes.';

commit;
