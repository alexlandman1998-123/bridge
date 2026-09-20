-- Phase 1 corrective follow-up: FICA correction must not turn an entity into
-- a blank natural-person seller. This replaces the Phase 4 bridge with an
-- entity-aware version while preserving the public-link/service-role boundary.
create or replace function public.bridge_update_listing_signing_seller_details(
  p_session_id uuid,
  p_seller jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_session public.private_listing_mandate_signing_sessions%rowtype;
  v_onboarding public.private_listing_seller_onboarding%rowtype;
  v_now timestamptz := now();
  v_input jsonb := coalesce(p_seller, '{}'::jsonb);
  v_pack_seller jsonb;
  v_form_data jsonb;
  v_canonical jsonb;
  v_canonical_seller jsonb;
  v_changed_fields text[] := array[]::text[];
  v_legal_type text;
  v_entity_name text;
  v_entity_registration_number text;
  v_registered_address text;
  v_is_trust boolean;
  v_is_entity boolean;
begin
  select * into v_session
  from public.private_listing_mandate_signing_sessions
  where id = p_session_id
  for update;

  if not found or v_session.status <> 'active' or v_session.expires_at <= v_now then
    raise exception 'This signing link has expired or has already been used.';
  end if;

  select * into v_onboarding
  from public.private_listing_seller_onboarding
  where private_listing_id = v_session.private_listing_id
  for update;

  if not found then
    raise exception 'Seller onboarding details are unavailable for this signing pack.';
  end if;

  v_legal_type := lower(coalesce(v_session.signing_pack_snapshot->'seller'->>'legalType', ''));
  v_is_trust := v_legal_type in ('trust', 'foreign_trust');
  v_is_entity := v_legal_type in ('company', 'close_corporation', 'foreign_company', 'trust', 'foreign_trust', 'deceased_estate');
  v_entity_name := nullif(trim(coalesce(v_input->>'entityName', '')), '');
  v_entity_registration_number := nullif(trim(coalesce(v_input->>'entityRegistrationNumber', '')), '');
  v_registered_address := nullif(trim(coalesce(v_input->>'registeredAddress', '')), '');

  if v_is_entity then
    if v_entity_name is null or v_entity_registration_number is null or v_registered_address is null then
      raise exception 'Entity name, registration number and registered address are required.';
    end if;
    v_pack_seller := coalesce(v_session.signing_pack_snapshot->'seller', '{}'::jsonb) ||
      case when v_is_trust then jsonb_build_object(
        'name', v_entity_name, 'trustName', v_entity_name,
        'trustRegistrationNumber', v_entity_registration_number,
        'trustRegisteredAddress', v_registered_address
      ) else jsonb_build_object(
        'name', v_entity_name, 'companyName', v_entity_name,
        'companyRegistrationNumber', v_entity_registration_number,
        'companyRegisteredAddress', v_registered_address
      ) end;
  else
    v_pack_seller := coalesce(v_session.signing_pack_snapshot->'seller', '{}'::jsonb) || jsonb_build_object(
      'firstName', nullif(trim(coalesce(v_input->>'firstName', '')), ''),
      'surname', nullif(trim(coalesce(v_input->>'surname', '')), ''),
      'name', nullif(trim(concat_ws(' ', nullif(trim(coalesce(v_input->>'firstName', '')), ''), nullif(trim(coalesce(v_input->>'surname', '')), ''))), ''),
      'idNumber', nullif(trim(coalesce(v_input->>'idNumber', '')), ''),
      'dateOfBirth', nullif(trim(coalesce(v_input->>'dateOfBirth', '')), ''),
      'nationality', nullif(trim(coalesce(v_input->>'nationality', '')), ''),
      'countryOfResidence', nullif(trim(coalesce(v_input->>'countryOfResidence', '')), ''),
      'residentialAddress', nullif(trim(coalesce(v_input->>'residentialAddress', '')), ''),
      'incomeTaxNumber', nullif(trim(coalesce(v_input->>'incomeTaxNumber', '')), ''),
      'email', nullif(trim(lower(coalesce(v_input->>'email', ''))), ''),
      'phone', nullif(trim(coalesce(v_input->>'phone', '')), ''),
      'occupation', nullif(trim(coalesce(v_input->>'occupation', '')), ''),
      'sourceOfFunds', nullif(trim(coalesce(v_input->>'sourceOfFunds', '')), '')
    );
  end if;

  v_form_data := coalesce(v_onboarding.form_data, '{}'::jsonb);
  v_canonical := coalesce(v_onboarding.canonical_facts_json, v_form_data->'canonicalSellerFacts', '{}'::jsonb);
  v_canonical_seller := coalesce(v_canonical->'seller', '{}'::jsonb);

  if v_is_entity then
    v_form_data := v_form_data || case when v_is_trust then jsonb_build_object(
      'trustName', v_entity_name, 'trustRegistrationNumber', v_entity_registration_number, 'trustRegisteredAddress', v_registered_address
    ) else jsonb_build_object(
      'companyName', v_entity_name, 'companyRegistrationNumber', v_entity_registration_number, 'companyRegisteredAddress', v_registered_address
    ) end;
    v_canonical_seller := v_canonical_seller || case when v_is_trust then jsonb_build_object(
      'trust', coalesce(v_canonical_seller->'trust', '{}'::jsonb) || jsonb_build_object('name', v_entity_name, 'registration_number', v_entity_registration_number, 'registered_address', v_registered_address)
    ) else jsonb_build_object(
      'company', coalesce(v_canonical_seller->'company', '{}'::jsonb) || jsonb_build_object('name', v_entity_name, 'registration_number', v_entity_registration_number, 'registered_address', v_registered_address)
    ) end;
    v_changed_fields := array['entity identity and registered address'];
  else
    v_form_data := v_form_data || jsonb_build_object(
      'sellerFirstName', v_pack_seller->>'firstName', 'firstName', v_pack_seller->>'firstName',
      'sellerSurname', v_pack_seller->>'surname', 'lastName', v_pack_seller->>'surname', 'sellerName', v_pack_seller->>'name',
      'idNumber', v_pack_seller->>'idNumber', 'sellerIdNumber', v_pack_seller->>'idNumber',
      'dateOfBirth', v_pack_seller->>'dateOfBirth', 'date_of_birth', v_pack_seller->>'dateOfBirth',
      'nationality', v_pack_seller->>'nationality', 'countryOfResidence', v_pack_seller->>'countryOfResidence',
      'residentialAddress', v_pack_seller->>'residentialAddress', 'residential_address', v_pack_seller->>'residentialAddress',
      'sellerTaxNumber', v_pack_seller->>'incomeTaxNumber', 'incomeTaxNumber', v_pack_seller->>'incomeTaxNumber',
      'email', v_pack_seller->>'email', 'phone', v_pack_seller->>'phone',
      'occupation', v_pack_seller->>'occupation', 'sourceOfFunds', v_pack_seller->>'sourceOfFunds'
    );
    v_canonical_seller := v_canonical_seller || jsonb_build_object(
      'first_name', v_pack_seller->>'firstName', 'surname', v_pack_seller->>'surname',
      'id_number', v_pack_seller->>'idNumber', 'date_of_birth', v_pack_seller->>'dateOfBirth',
      'nationality', v_pack_seller->>'nationality', 'residential_address', v_pack_seller->>'residentialAddress',
      'tax_number', v_pack_seller->>'incomeTaxNumber', 'email', v_pack_seller->>'email', 'phone', v_pack_seller->>'phone'
    );
    v_changed_fields := array['seller FICA details'];
  end if;

  v_canonical := jsonb_set(v_canonical, '{seller}', v_canonical_seller, true);
  v_form_data := v_form_data || jsonb_build_object('canonicalSellerFacts', v_canonical, 'canonical_seller_facts', v_canonical);

  update public.private_listing_seller_onboarding
     set form_data = v_form_data, canonical_facts_json = v_canonical, canonical_facts_updated_at = v_now, updated_at = v_now
   where id = v_onboarding.id;
  update public.private_listings
     set seller_canonical_facts_json = v_canonical, seller_canonical_facts_updated_at = v_now, updated_at = v_now
   where id = v_session.private_listing_id;
  update public.private_listing_mandate_signing_sessions
     set signing_pack_snapshot = jsonb_set(coalesce(signing_pack_snapshot, '{}'::jsonb), '{seller}', v_pack_seller, true), updated_at = v_now
   where status = 'active' and (id = v_session.id or (v_session.signing_group_id is not null and signing_group_id = v_session.signing_group_id));

  insert into public.private_listing_activity (private_listing_id, activity_type, activity_title, activity_description, visibility, metadata)
  values (v_session.private_listing_id, 'seller_signing_details_updated', 'Seller details updated during signing', 'Seller details were updated before the signing pack was finalised.', 'internal', jsonb_build_object('signingSessionId', v_session.id, 'signingGroupId', v_session.signing_group_id, 'changedFields', v_changed_fields, 'updatedAt', v_now));

  return jsonb_build_object('signingPack', jsonb_set(coalesce(v_session.signing_pack_snapshot, '{}'::jsonb), '{seller}', v_pack_seller, true), 'changedFields', v_changed_fields, 'updatedAt', v_now);
end;
$$;

revoke all on function public.bridge_update_listing_signing_seller_details(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.bridge_update_listing_signing_seller_details(uuid, jsonb) to service_role;
