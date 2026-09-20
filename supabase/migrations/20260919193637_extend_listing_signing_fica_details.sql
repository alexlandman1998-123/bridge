-- Extend the service-only pre-signing correction bridge. The public link is
-- authorised by its opaque signing token in the Edge Function; this RPC stays
-- service-role-only and never exposes seller data through the Data API.
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
  v_seller jsonb := coalesce(p_seller, '{}'::jsonb);
  v_pack_seller jsonb;
  v_form_data jsonb;
  v_canonical jsonb;
  v_canonical_seller jsonb;
  v_changed_fields text[] := array[]::text[];
  v_pack_snapshot jsonb;
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

  v_pack_seller := coalesce(v_session.signing_pack_snapshot->'seller', '{}'::jsonb) || jsonb_build_object(
    'firstName', nullif(trim(coalesce(v_seller->>'firstName', '')), ''),
    'surname', nullif(trim(coalesce(v_seller->>'surname', '')), ''),
    'name', nullif(trim(concat_ws(' ', nullif(trim(coalesce(v_seller->>'firstName', '')), ''), nullif(trim(coalesce(v_seller->>'surname', '')), ''))), ''),
    'idNumber', nullif(trim(coalesce(v_seller->>'idNumber', '')), ''),
    'dateOfBirth', nullif(trim(coalesce(v_seller->>'dateOfBirth', '')), ''),
    'nationality', nullif(trim(coalesce(v_seller->>'nationality', '')), ''),
    'countryOfResidence', nullif(trim(coalesce(v_seller->>'countryOfResidence', '')), ''),
    'residentialAddress', nullif(trim(coalesce(v_seller->>'residentialAddress', '')), ''),
    'incomeTaxNumber', nullif(trim(coalesce(v_seller->>'incomeTaxNumber', '')), ''),
    'email', nullif(trim(lower(coalesce(v_seller->>'email', ''))), ''),
    'phone', nullif(trim(coalesce(v_seller->>'phone', '')), ''),
    'occupation', nullif(trim(coalesce(v_seller->>'occupation', '')), ''),
    'sourceOfFunds', nullif(trim(coalesce(v_seller->>'sourceOfFunds', '')), '')
  );
  v_form_data := coalesce(v_onboarding.form_data, '{}'::jsonb) || jsonb_build_object(
    'sellerFirstName', v_pack_seller->>'firstName', 'firstName', v_pack_seller->>'firstName',
    'sellerSurname', v_pack_seller->>'surname', 'lastName', v_pack_seller->>'surname', 'sellerName', v_pack_seller->>'name',
    'idNumber', v_pack_seller->>'idNumber', 'sellerIdNumber', v_pack_seller->>'idNumber',
    'dateOfBirth', v_pack_seller->>'dateOfBirth', 'date_of_birth', v_pack_seller->>'dateOfBirth', 'birthDate', v_pack_seller->>'dateOfBirth',
    'nationality', v_pack_seller->>'nationality', 'countryOfResidence', v_pack_seller->>'countryOfResidence',
    'residentialAddress', v_pack_seller->>'residentialAddress', 'residential_address', v_pack_seller->>'residentialAddress',
    'sellerTaxNumber', v_pack_seller->>'incomeTaxNumber', 'incomeTaxNumber', v_pack_seller->>'incomeTaxNumber',
    'email', v_pack_seller->>'email', 'phone', v_pack_seller->>'phone',
    'occupation', v_pack_seller->>'occupation', 'sourceOfFunds', v_pack_seller->>'sourceOfFunds', 'source_of_funds', v_pack_seller->>'sourceOfFunds'
  );
  v_canonical := coalesce(v_onboarding.canonical_facts_json, v_form_data->'canonicalSellerFacts', '{}'::jsonb);
  v_canonical_seller := coalesce(v_canonical->'seller', '{}'::jsonb) || jsonb_build_object(
    'first_name', v_pack_seller->>'firstName', 'surname', v_pack_seller->>'surname',
    'id_number', v_pack_seller->>'idNumber', 'date_of_birth', v_pack_seller->>'dateOfBirth',
    'nationality', v_pack_seller->>'nationality', 'residential_address', v_pack_seller->>'residentialAddress',
    'tax_number', v_pack_seller->>'incomeTaxNumber', 'email', v_pack_seller->>'email', 'phone', v_pack_seller->>'phone'
  );
  v_canonical := jsonb_set(v_canonical, '{seller}', v_canonical_seller, true);
  v_form_data := v_form_data || jsonb_build_object('canonicalSellerFacts', v_canonical, 'canonical_seller_facts', v_canonical);

  foreach v_pack_snapshot in array array[
    jsonb_build_object('label', 'first name', 'before', coalesce(v_session.signing_pack_snapshot->'seller'->>'firstName', ''), 'after', coalesce(v_pack_seller->>'firstName', '')),
    jsonb_build_object('label', 'surname', 'before', coalesce(v_session.signing_pack_snapshot->'seller'->>'surname', ''), 'after', coalesce(v_pack_seller->>'surname', '')),
    jsonb_build_object('label', 'ID or passport number', 'before', coalesce(v_session.signing_pack_snapshot->'seller'->>'idNumber', ''), 'after', coalesce(v_pack_seller->>'idNumber', '')),
    jsonb_build_object('label', 'date of birth', 'before', coalesce(v_session.signing_pack_snapshot->'seller'->>'dateOfBirth', ''), 'after', coalesce(v_pack_seller->>'dateOfBirth', '')),
    jsonb_build_object('label', 'nationality', 'before', coalesce(v_session.signing_pack_snapshot->'seller'->>'nationality', ''), 'after', coalesce(v_pack_seller->>'nationality', '')),
    jsonb_build_object('label', 'country of residence', 'before', coalesce(v_session.signing_pack_snapshot->'seller'->>'countryOfResidence', ''), 'after', coalesce(v_pack_seller->>'countryOfResidence', '')),
    jsonb_build_object('label', 'residential or registered address', 'before', coalesce(v_session.signing_pack_snapshot->'seller'->>'residentialAddress', ''), 'after', coalesce(v_pack_seller->>'residentialAddress', '')),
    jsonb_build_object('label', 'income tax number', 'before', coalesce(v_session.signing_pack_snapshot->'seller'->>'incomeTaxNumber', ''), 'after', coalesce(v_pack_seller->>'incomeTaxNumber', '')),
    jsonb_build_object('label', 'email', 'before', coalesce(v_session.signing_pack_snapshot->'seller'->>'email', ''), 'after', coalesce(v_pack_seller->>'email', '')),
    jsonb_build_object('label', 'phone number', 'before', coalesce(v_session.signing_pack_snapshot->'seller'->>'phone', ''), 'after', coalesce(v_pack_seller->>'phone', '')),
    jsonb_build_object('label', 'occupation', 'before', coalesce(v_session.signing_pack_snapshot->'seller'->>'occupation', ''), 'after', coalesce(v_pack_seller->>'occupation', '')),
    jsonb_build_object('label', 'source of funds', 'before', coalesce(v_session.signing_pack_snapshot->'seller'->>'sourceOfFunds', ''), 'after', coalesce(v_pack_seller->>'sourceOfFunds', ''))
  ] loop
    if v_pack_snapshot->>'before' is distinct from v_pack_snapshot->>'after' then
      v_changed_fields := array_append(v_changed_fields, v_pack_snapshot->>'label');
    end if;
  end loop;

  update public.private_listing_seller_onboarding
     set form_data = v_form_data, canonical_facts_json = v_canonical,
         canonical_facts_updated_at = v_now, updated_at = v_now
   where id = v_onboarding.id;
  update public.private_listings
     set seller_canonical_facts_json = v_canonical,
         seller_canonical_facts_updated_at = v_now, updated_at = v_now
   where id = v_session.private_listing_id;

  v_pack_snapshot := jsonb_set(coalesce(v_session.signing_pack_snapshot, '{}'::jsonb), '{seller}', v_pack_seller, true);
  update public.private_listing_mandate_signing_sessions
     set signing_pack_snapshot = v_pack_snapshot, updated_at = v_now
   where status = 'active'
     and (id = v_session.id or (v_session.signing_group_id is not null and signing_group_id = v_session.signing_group_id));

  if cardinality(v_changed_fields) > 0 then
    insert into public.private_listing_activity (private_listing_id, activity_type, activity_title, activity_description, visibility, metadata)
    values (v_session.private_listing_id, 'seller_signing_details_updated', 'Seller details updated during signing', 'Seller details were updated before the signing pack was finalised.', 'internal', jsonb_build_object('signingSessionId', v_session.id, 'signingGroupId', v_session.signing_group_id, 'changedFields', v_changed_fields, 'updatedAt', v_now));
  end if;
  return jsonb_build_object('signingPack', v_pack_snapshot, 'changedFields', v_changed_fields, 'updatedAt', v_now);
end;
$$;

revoke all on function public.bridge_update_listing_signing_seller_details(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.bridge_update_listing_signing_seller_details(uuid, jsonb) to service_role;
