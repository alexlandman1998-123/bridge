begin;

create or replace function public.bridge_update_private_listing_seller_onboarding_progress(
  p_token text,
  p_status text default 'in_progress',
  p_form_data jsonb default '{}'::jsonb,
  p_seller_type text default null,
  p_ownership_structure text default null,
  p_marital_regime text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $func$
declare
  v_onboarding public.private_listing_seller_onboarding%rowtype;
  v_listing public.private_listings%rowtype;
  v_listing_json jsonb;
  v_status text := coalesce(nullif(trim(lower(p_status)), ''), 'in_progress');
  v_form_data jsonb := coalesce(p_form_data, '{}'::jsonb);
begin
  if v_status not in ('not_started', 'sent', 'in_progress', 'completed', 'rejected') then
    v_status := 'in_progress';
  end if;

  select *
    into v_onboarding
  from public.private_listing_seller_onboarding
  where token = nullif(trim(p_token), '')
    and (token_expires_at is null or token_expires_at > now())
  limit 1;

  if not found then
    return null;
  end if;

  update public.private_listing_seller_onboarding
     set status = v_status,
         form_data = coalesce(form_data, '{}'::jsonb) || v_form_data,
         seller_type = coalesce(nullif(trim(p_seller_type), ''), seller_type),
         ownership_structure = coalesce(nullif(trim(p_ownership_structure), ''), ownership_structure),
         marital_regime = coalesce(nullif(trim(p_marital_regime), ''), marital_regime),
         updated_at = now()
   where id = v_onboarding.id
   returning * into v_onboarding;

  if v_status in ('sent', 'in_progress') then
    update public.private_listings
       set listing_status = case
             when listing_status = 'seller_lead' then 'onboarding_sent'
             else listing_status
           end,
           seller_onboarding_status = v_status,
           updated_at = now()
     where id = v_onboarding.private_listing_id
     returning * into v_listing;
  else
    select *
      into v_listing
    from public.private_listings
    where id = v_onboarding.private_listing_id;
  end if;

  if not found then
    return null;
  end if;

  v_listing_json := to_jsonb(v_listing);

  return jsonb_build_object(
    'listing', jsonb_build_object(
      'id', v_listing.id,
      'organisation_id', v_listing.organisation_id,
      'assigned_agent_id', v_listing.assigned_agent_id,
      'seller_lead_id', v_listing.seller_lead_id,
      'originating_crm_lead_id', v_listing.originating_crm_lead_id,
      'listing_status', v_listing.listing_status,
      'seller_onboarding_status', v_listing.seller_onboarding_status,
      'seller_type', v_listing.seller_type,
      'title', v_listing.title,
      'address_line_1', v_listing.address_line_1,
      'address_line_2', v_listing.address_line_2,
      'suburb', v_listing.suburb,
      'city', v_listing.city,
      'province', v_listing.province,
      'country', v_listing.country,
      'postal_code', v_listing.postal_code,
      'asking_price', v_listing.asking_price,
      'estimated_value', v_listing.estimated_value,
      'property_type', v_listing.property_type,
      'created_at', v_listing.created_at,
      'updated_at', v_listing.updated_at
    ) || jsonb_strip_nulls(jsonb_build_object(
      'formatted_address', v_listing_json -> 'formatted_address',
      'street_address', v_listing_json -> 'street_address',
      'property_category', v_listing_json -> 'property_category',
      'property_structure_type', v_listing_json -> 'property_structure_type',
      'seller_canonical_facts_json', v_listing_json -> 'seller_canonical_facts_json',
      'seller_canonical_fact_readiness_json', v_listing_json -> 'seller_canonical_fact_readiness_json'
    )),
    'onboarding', to_jsonb(v_onboarding) - 'seller_portal_password_hash' - 'seller_portal_access_token_hash' - 'seller_portal_invite_token_hash',
    'transaction', 'null'::jsonb,
    'requirements', '[]'::jsonb,
    'documents', '[]'::jsonb,
    'appointments', '[]'::jsonb,
    'mandatePacket', 'null'::jsonb,
    'corePayload', true
  );
end;
$func$;

revoke all on function public.bridge_update_private_listing_seller_onboarding_progress(text, text, jsonb, text, text, text)
  from public, service_role;
grant execute on function public.bridge_update_private_listing_seller_onboarding_progress(text, text, jsonb, text, text, text)
  to anon, authenticated;

comment on function public.bridge_update_private_listing_seller_onboarding_progress(text, text, jsonb, text, text, text) is
  'Persists seller onboarding progress and returns only the core listing/onboarding payload. Optional portal enrichment must not run on the Step 1 save path.';

notify pgrst, 'reload schema';

commit;
