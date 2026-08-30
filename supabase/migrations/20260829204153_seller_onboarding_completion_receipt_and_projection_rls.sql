begin;

create or replace function public.bridge_sanitize_seller_onboarding_form_data(
  p_form_data jsonb
)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $func$
declare
  v_form_data jsonb := case
    when jsonb_typeof(coalesce(p_form_data, '{}'::jsonb)) = 'object' then coalesce(p_form_data, '{}'::jsonb)
    else '{}'::jsonb
  end;
  v_disclosure jsonb;
begin
  -- Generated documents are derived artifacts. Keep the source answers and
  -- signatures here and generate the HTML only when a document is requested.
  v_form_data := v_form_data - array[
    'generatedDocument', 'generated_document', 'generatedHtml', 'generated_html',
    'sellerCompliancePack', 'seller_compliance_pack',
    'canonicalSellerFacts', 'canonical_seller_facts',
    'canonicalSellerFactReadiness', 'canonical_seller_fact_readiness',
    'date_of_birth', 'birthDate',
    'alternative_number', 'alternatePhone', 'alternate_phone',
    'income_tax_number', 'taxNumber', 'tax_number',
    'sa_resident', 'taxResident', 'tax_resident',
    'popi_consent', 'popi_consent_accepted', 'popi_consent_accepted_at',
    'arch9_terms_acceptance', 'arch9_terms_accepted', 'arch9_terms_accepted_at',
    'seller_compliance_signers', 'seller_compliance_signing',
    'seller_compliance_active_signer_id', 'property_disclosure'
  ];

  if jsonb_typeof(v_form_data->'propertyDisclosure') = 'object' then
    v_disclosure := (v_form_data->'propertyDisclosure') - array[
      'generatedDocument', 'generated_document', 'generatedHtml', 'generated_html',
      'arch9_terms_acceptance', 'arch9_terms_accepted', 'arch9_terms_accepted_at'
    ];
    v_form_data := jsonb_set(v_form_data, '{propertyDisclosure}', v_disclosure, true);
  end if;

  return v_form_data;
end;
$func$;

revoke all on function public.bridge_sanitize_seller_onboarding_form_data(jsonb) from public;

create or replace function public.bridge_complete_private_listing_seller_onboarding(
  p_token text,
  p_form_data jsonb default '{}'::jsonb,
  p_seller_type text default null,
  p_ownership_structure text default null,
  p_marital_regime text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $func$
declare
  v_onboarding public.private_listing_seller_onboarding%rowtype;
  v_listing public.private_listings%rowtype;
  v_raw_form_data jsonb := case
    when jsonb_typeof(coalesce(p_form_data, '{}'::jsonb)) = 'object' then coalesce(p_form_data, '{}'::jsonb)
    else '{}'::jsonb
  end;
  v_existing_form_data jsonb := '{}'::jsonb;
  v_next_form_data jsonb := '{}'::jsonb;
  v_canonical_facts jsonb := '{}'::jsonb;
  v_canonical_readiness jsonb := '{}'::jsonb;
  v_originating_lead_id uuid := null;
  v_seller_lead_id uuid := null;
  v_context_seller_lead_id uuid := null;
  v_client_email text := null;
  v_asking_price numeric := null;
  v_bedrooms integer := null;
  v_bathrooms numeric := null;
  v_garages integer := null;
  v_parking_bays integer := null;
  v_floor_size numeric := null;
  v_erf_size numeric := null;
  v_rates_taxes numeric := null;
  v_levies numeric := null;
begin
  select *
    into v_onboarding
  from public.private_listing_seller_onboarding
  where token = nullif(pg_catalog.btrim(p_token), '')
    and (token_expires_at is null or token_expires_at > pg_catalog.now())
  limit 1;

  if not found then
    return null;
  end if;

  select *
    into v_listing
  from public.private_listings
  where id = v_onboarding.private_listing_id;

  if not found then
    return null;
  end if;

  v_canonical_facts := coalesce(
    v_raw_form_data->'canonicalSellerFacts',
    v_raw_form_data->'canonical_seller_facts',
    v_onboarding.canonical_facts_json,
    '{}'::jsonb
  );
  v_canonical_readiness := coalesce(
    v_raw_form_data->'canonicalSellerFactReadiness',
    v_raw_form_data->'canonical_seller_fact_readiness',
    v_onboarding.canonical_fact_readiness_json,
    '{}'::jsonb
  );
  v_existing_form_data := public.bridge_sanitize_seller_onboarding_form_data(v_onboarding.form_data);
  v_next_form_data := v_existing_form_data || public.bridge_sanitize_seller_onboarding_form_data(v_raw_form_data);

  update public.private_listing_seller_onboarding
     set status = 'completed',
         form_data = v_next_form_data,
         seller_type = coalesce(nullif(pg_catalog.btrim(p_seller_type), ''), seller_type),
         ownership_structure = coalesce(nullif(pg_catalog.btrim(p_ownership_structure), ''), ownership_structure),
         marital_regime = coalesce(nullif(pg_catalog.btrim(p_marital_regime), ''), marital_regime),
         canonical_facts_json = v_canonical_facts,
         canonical_fact_readiness_json = v_canonical_readiness,
         canonical_facts_updated_at = pg_catalog.now(),
         submitted_at = coalesce(submitted_at, pg_catalog.now()),
         updated_at = pg_catalog.now()
   where id = v_onboarding.id
   returning * into v_onboarding;

  update public.private_listings
     set listing_status = case
           when listing_status in ('seller_lead', 'onboarding_sent') then 'onboarding_completed'
           else listing_status
         end,
         seller_onboarding_status = 'completed',
         seller_type = coalesce(nullif(pg_catalog.btrim(p_seller_type), ''), seller_type),
         seller_canonical_facts_json = v_canonical_facts,
         seller_canonical_fact_readiness_json = v_canonical_readiness,
         seller_canonical_facts_updated_at = pg_catalog.now(),
         updated_at = pg_catalog.now()
   where id = v_onboarding.private_listing_id
   returning * into v_listing;

  -- These projections previously ran in the anonymous browser session and
  -- failed RLS. They now run only after a valid, unexpired onboarding token
  -- has resolved the exact listing above.
  if pg_catalog.to_regclass('public.listing_publication_data') is not null then
    begin
      if coalesce(v_next_form_data->>'askingPrice', v_canonical_facts#>>'{property,askingPrice}', '') ~ '^-?[0-9]+([.][0-9]+)?$' then
        v_asking_price := coalesce(v_next_form_data->>'askingPrice', v_canonical_facts#>>'{property,askingPrice}')::numeric;
      end if;
      if coalesce(v_next_form_data->>'bedrooms', '') ~ '^[0-9]+$' then v_bedrooms := (v_next_form_data->>'bedrooms')::integer; end if;
      if coalesce(v_next_form_data->>'bathrooms', '') ~ '^[0-9]+([.][0-9]+)?$' then v_bathrooms := (v_next_form_data->>'bathrooms')::numeric; end if;
      if coalesce(v_next_form_data->>'garages', '') ~ '^[0-9]+$' then v_garages := (v_next_form_data->>'garages')::integer; end if;
      if coalesce(v_next_form_data->>'parkingBays', '') ~ '^[0-9]+$' then v_parking_bays := (v_next_form_data->>'parkingBays')::integer; end if;
      if coalesce(v_next_form_data->>'floorSize', '') ~ '^[0-9]+([.][0-9]+)?$' then v_floor_size := (v_next_form_data->>'floorSize')::numeric; end if;
      if coalesce(v_next_form_data->>'erfSize', '') ~ '^[0-9]+([.][0-9]+)?$' then v_erf_size := (v_next_form_data->>'erfSize')::numeric; end if;
      if coalesce(v_next_form_data->>'ratesTaxes', '') ~ '^[0-9]+([.][0-9]+)?$' then v_rates_taxes := (v_next_form_data->>'ratesTaxes')::numeric; end if;
      if coalesce(v_next_form_data->>'levies', '') ~ '^[0-9]+([.][0-9]+)?$' then v_levies := (v_next_form_data->>'levies')::numeric; end if;

      insert into public.listing_publication_data (
        listing_id, title, address, suburb, province, property_type, listing_type,
        asking_price, bedrooms, bathrooms, garages, parking_bays, floor_size,
        erf_size, rates_taxes, levies, description, features, amenities, status
      ) values (
        v_listing.id,
        nullif(pg_catalog.btrim(coalesce(v_next_form_data->>'propertyTitle', v_canonical_facts#>>'{property,title}', v_listing.title, '')), ''),
        nullif(pg_catalog.btrim(coalesce(
          v_next_form_data->>'propertyAddress',
          v_canonical_facts#>>'{property,address,formatted}',
          pg_catalog.concat_ws(', ', nullif(v_listing.address_line_1, ''), nullif(v_listing.address_line_2, ''), nullif(v_listing.suburb, ''), nullif(v_listing.city, '')),
          ''
        )), ''),
        nullif(pg_catalog.btrim(coalesce(v_next_form_data->>'suburb', v_canonical_facts#>>'{property,address,suburb}', '')), ''),
        nullif(pg_catalog.btrim(coalesce(v_next_form_data->>'province', v_canonical_facts#>>'{property,address,province}', '')), ''),
        nullif(pg_catalog.btrim(coalesce(v_next_form_data->>'propertyType', v_canonical_facts#>>'{property,type}', '')), ''),
        'Sale', v_asking_price, v_bedrooms, v_bathrooms, v_garages,
        v_parking_bays, v_floor_size, v_erf_size, v_rates_taxes, v_levies,
        nullif(pg_catalog.btrim(coalesce(v_next_form_data->>'description', '')), ''),
        case when jsonb_typeof(v_next_form_data->'features') = 'array' then v_next_form_data->'features' else '[]'::jsonb end,
        case when jsonb_typeof(v_next_form_data->'amenities') = 'array' then v_next_form_data->'amenities' else '[]'::jsonb end,
        'Draft'
      )
      on conflict (listing_id) do update set
        title = coalesce(excluded.title, public.listing_publication_data.title),
        address = coalesce(excluded.address, public.listing_publication_data.address),
        suburb = coalesce(excluded.suburb, public.listing_publication_data.suburb),
        province = coalesce(excluded.province, public.listing_publication_data.province),
        property_type = coalesce(excluded.property_type, public.listing_publication_data.property_type),
        asking_price = coalesce(excluded.asking_price, public.listing_publication_data.asking_price),
        bedrooms = coalesce(excluded.bedrooms, public.listing_publication_data.bedrooms),
        bathrooms = coalesce(excluded.bathrooms, public.listing_publication_data.bathrooms),
        garages = coalesce(excluded.garages, public.listing_publication_data.garages),
        parking_bays = coalesce(excluded.parking_bays, public.listing_publication_data.parking_bays),
        floor_size = coalesce(excluded.floor_size, public.listing_publication_data.floor_size),
        erf_size = coalesce(excluded.erf_size, public.listing_publication_data.erf_size),
        rates_taxes = coalesce(excluded.rates_taxes, public.listing_publication_data.rates_taxes),
        levies = coalesce(excluded.levies, public.listing_publication_data.levies),
        description = coalesce(excluded.description, public.listing_publication_data.description),
        features = case when excluded.features = '[]'::jsonb then public.listing_publication_data.features else excluded.features end,
        amenities = case when excluded.amenities = '[]'::jsonb then public.listing_publication_data.amenities else excluded.amenities end,
        updated_at = pg_catalog.now();
    exception
      when undefined_table or undefined_column then
        null;
    end;
  end if;

  if nullif(pg_catalog.btrim(v_listing.originating_crm_lead_id::text), '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    v_originating_lead_id := v_listing.originating_crm_lead_id::uuid;
  end if;
  if nullif(pg_catalog.btrim(v_listing.seller_lead_id::text), '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    v_seller_lead_id := v_listing.seller_lead_id::uuid;
  end if;
  v_context_seller_lead_id := coalesce(v_seller_lead_id, v_originating_lead_id);
  v_client_email := pg_catalog.lower(nullif(pg_catalog.btrim(coalesce(
    v_next_form_data->>'sellerEmail', v_next_form_data->>'email', v_next_form_data->>'contactEmail', ''
  )), ''));

  if v_originating_lead_id is not null or v_seller_lead_id is not null then
    update public.leads
       set stage = 'Onboarding Completed', status = 'Onboarding Completed',
           seller_onboarding_status = 'completed',
           seller_onboarding_token = coalesce(v_onboarding.token, seller_onboarding_token),
           listing_id = v_listing.id, updated_at = pg_catalog.now()
     where organisation_id = v_listing.organisation_id
       and lead_id = any(pg_catalog.array_remove(array[v_originating_lead_id, v_seller_lead_id], null));
  end if;

  if pg_catalog.to_regclass('public.client_portal_contexts') is not null then
    begin
      update public.client_portal_contexts
         set organisation_id = v_listing.organisation_id, client_email = v_client_email,
             context_type = 'selling', seller_lead_id = v_context_seller_lead_id,
             listing_id = v_listing.id::text, status = 'active', updated_at = pg_catalog.now()
       where seller_workspace_token = v_onboarding.token;
      if not found then
        insert into public.client_portal_contexts (
          organisation_id, client_email, context_type, transaction_id, seller_lead_id,
          listing_id, seller_workspace_token, status, updated_at
        ) values (
          v_listing.organisation_id, v_client_email, 'selling', null,
          v_context_seller_lead_id, v_listing.id::text, v_onboarding.token, 'active', pg_catalog.now()
        );
      end if;
    exception when undefined_table or undefined_column then null;
    end;
  end if;

  if pg_catalog.to_regclass('public.private_listing_activity') is not null then
    begin
      insert into public.private_listing_activity (
        private_listing_id, activity_type, activity_title, activity_description, visibility, metadata
      ) values (
        v_onboarding.private_listing_id, 'seller_onboarding_completed', 'Seller onboarding completed',
        'Seller completed onboarding from the secure client portal.', 'internal',
        jsonb_build_object('submittedAt', pg_catalog.now(), 'source', 'client_portal')
      ) on conflict do nothing;
    exception when undefined_table or undefined_column then null;
    end;
  end if;

  return jsonb_build_object(
    'onboardingId', v_onboarding.id,
    'listingId', v_listing.id,
    'status', v_onboarding.status,
    'submittedAt', v_onboarding.submitted_at
  );
end;
$func$;

create or replace function public.bridge_get_private_listing_seller_onboarding_completion(
  p_token text
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $func$
  select jsonb_build_object(
    'onboardingId', onboarding.id,
    'listingId', onboarding.private_listing_id,
    'status', onboarding.status,
    'submittedAt', onboarding.submitted_at
  )
  from public.private_listing_seller_onboarding onboarding
  where onboarding.token = nullif(pg_catalog.btrim(p_token), '')
    and (onboarding.token_expires_at is null or onboarding.token_expires_at > pg_catalog.now())
  limit 1;
$func$;

revoke all on function public.bridge_complete_private_listing_seller_onboarding(text, jsonb, text, text, text) from public;
revoke all on function public.bridge_get_private_listing_seller_onboarding_completion(text) from public;
grant execute on function public.bridge_complete_private_listing_seller_onboarding(text, jsonb, text, text, text) to anon, authenticated;
grant execute on function public.bridge_get_private_listing_seller_onboarding_completion(text) to anon, authenticated;

comment on function public.bridge_complete_private_listing_seller_onboarding(text, jsonb, text, text, text) is
  'Completes token-scoped seller onboarding, persists canonical/publication projections, and returns only the four-field completion receipt.';
comment on function public.bridge_get_private_listing_seller_onboarding_completion(text) is
  'Returns the lightweight token-scoped seller onboarding completion receipt for timeout recovery.';
comment on function public.bridge_sanitize_seller_onboarding_form_data(jsonb) is
  'Removes generated artifacts and compatibility aliases before seller onboarding source data is persisted.';

notify pgrst, 'reload schema';

commit;
