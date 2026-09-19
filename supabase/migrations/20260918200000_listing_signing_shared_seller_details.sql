-- Keep seller details edited in a signing pack authoritative across onboarding,
-- the listing projection and the mutable pre-signing pack snapshot.
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
    'idNumber', nullif(trim(coalesce(v_seller->>'idNumber', '')), ''),
    'residentialAddress', nullif(trim(coalesce(v_seller->>'residentialAddress', '')), ''),
    'incomeTaxNumber', nullif(trim(coalesce(v_seller->>'incomeTaxNumber', '')), ''),
    'email', nullif(trim(coalesce(v_seller->>'email', '')), ''),
    'phone', nullif(trim(coalesce(v_seller->>'phone', '')), '')
  );
  v_form_data := coalesce(v_onboarding.form_data, '{}'::jsonb) || jsonb_build_object(
    'idNumber', v_pack_seller->>'idNumber', 'sellerIdNumber', v_pack_seller->>'idNumber',
    'residentialAddress', v_pack_seller->>'residentialAddress', 'residential_address', v_pack_seller->>'residentialAddress',
    'sellerTaxNumber', v_pack_seller->>'incomeTaxNumber', 'incomeTaxNumber', v_pack_seller->>'incomeTaxNumber',
    'email', v_pack_seller->>'email', 'phone', v_pack_seller->>'phone'
  );
  v_canonical := coalesce(v_onboarding.canonical_facts_json, v_form_data->'canonicalSellerFacts', '{}'::jsonb);
  v_canonical_seller := coalesce(v_canonical->'seller', '{}'::jsonb) || jsonb_build_object(
    'id_number', v_pack_seller->>'idNumber', 'residential_address', v_pack_seller->>'residentialAddress',
    'tax_number', v_pack_seller->>'incomeTaxNumber', 'email', v_pack_seller->>'email', 'phone', v_pack_seller->>'phone'
  );
  v_canonical := jsonb_set(v_canonical, '{seller}', v_canonical_seller, true);
  v_form_data := v_form_data || jsonb_build_object('canonicalSellerFacts', v_canonical, 'canonical_seller_facts', v_canonical);

  if coalesce(v_session.signing_pack_snapshot->'seller'->>'idNumber', '') is distinct from coalesce(v_pack_seller->>'idNumber', '') then v_changed_fields := array_append(v_changed_fields, 'ID or passport number'); end if;
  if coalesce(v_session.signing_pack_snapshot->'seller'->>'residentialAddress', '') is distinct from coalesce(v_pack_seller->>'residentialAddress', '') then v_changed_fields := array_append(v_changed_fields, 'residential or registered address'); end if;
  if coalesce(v_session.signing_pack_snapshot->'seller'->>'incomeTaxNumber', '') is distinct from coalesce(v_pack_seller->>'incomeTaxNumber', '') then v_changed_fields := array_append(v_changed_fields, 'income tax number'); end if;
  if coalesce(v_session.signing_pack_snapshot->'seller'->>'email', '') is distinct from coalesce(v_pack_seller->>'email', '') then v_changed_fields := array_append(v_changed_fields, 'email'); end if;
  if coalesce(v_session.signing_pack_snapshot->'seller'->>'phone', '') is distinct from coalesce(v_pack_seller->>'phone', '') then v_changed_fields := array_append(v_changed_fields, 'phone number'); end if;

  update public.private_listing_seller_onboarding
     set form_data = v_form_data, canonical_facts_json = v_canonical,
         canonical_facts_updated_at = v_now, updated_at = v_now
   where id = v_onboarding.id;
  update public.private_listings
     set seller_canonical_facts_json = v_canonical,
         seller_canonical_facts_updated_at = v_now, updated_at = v_now
   where id = v_session.private_listing_id;
  update public.private_listing_mandate_signing_sessions
     set signing_pack_snapshot = jsonb_set(coalesce(signing_pack_snapshot, '{}'::jsonb), '{seller}', v_pack_seller, true),
         updated_at = v_now
   where id = v_session.id;

  if cardinality(v_changed_fields) > 0 then
    insert into public.private_listing_activity (private_listing_id, activity_type, activity_title, activity_description, visibility, metadata)
    values (v_session.private_listing_id, 'seller_signing_details_updated', 'Seller details updated during signing', 'Seller details were updated before the signing pack was finalised.', 'internal', jsonb_build_object('signingSessionId', v_session.id, 'changedFields', v_changed_fields, 'updatedAt', v_now));
  end if;
  return jsonb_build_object('signingPack', jsonb_set(coalesce(v_session.signing_pack_snapshot, '{}'::jsonb), '{seller}', v_pack_seller, true), 'changedFields', v_changed_fields, 'updatedAt', v_now);
end;
$$;

revoke all on function public.bridge_update_listing_signing_seller_details(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.bridge_update_listing_signing_seller_details(uuid, jsonb) to service_role;
