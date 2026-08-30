begin;

create or replace function public.bridge_prepare_seller_onboarding_link(
  p_listing_id uuid,
  p_token text,
  p_token_expires_at timestamptz,
  p_form_data jsonb default '{}'::jsonb,
  p_seller_type text default null,
  p_ownership_structure text default null,
  p_marital_regime text default null,
  p_performed_by uuid default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $func$
declare
  v_listing public.private_listings%rowtype;
  v_onboarding public.private_listing_seller_onboarding%rowtype;
  v_originating_lead_id uuid := null;
  v_seller_lead_id uuid := null;
  v_now timestamptz := now();
begin
  select *
    into v_listing
  from public.private_listings
  where id = p_listing_id
  for update;

  if not found then
    raise exception 'Private listing not found.' using errcode = 'P0002';
  end if;

  insert into public.private_listing_seller_onboarding (
    private_listing_id,
    token,
    token_expires_at,
    seller_type,
    ownership_structure,
    marital_regime,
    form_data,
    status,
    updated_at
  )
  values (
    v_listing.id,
    nullif(trim(p_token), ''),
    p_token_expires_at,
    nullif(trim(p_seller_type), ''),
    nullif(trim(p_ownership_structure), ''),
    nullif(trim(p_marital_regime), ''),
    coalesce(p_form_data, '{}'::jsonb),
    'sent',
    v_now
  )
  on conflict (private_listing_id) do update
     set token = coalesce(nullif(trim(excluded.token), ''), private_listing_seller_onboarding.token),
         token_expires_at = excluded.token_expires_at,
         seller_type = coalesce(excluded.seller_type, private_listing_seller_onboarding.seller_type),
         ownership_structure = coalesce(excluded.ownership_structure, private_listing_seller_onboarding.ownership_structure),
         marital_regime = coalesce(excluded.marital_regime, private_listing_seller_onboarding.marital_regime),
         form_data = coalesce(private_listing_seller_onboarding.form_data, '{}'::jsonb) || coalesce(excluded.form_data, '{}'::jsonb),
         status = 'sent',
         updated_at = v_now
  returning * into v_onboarding;

  update public.private_listings
     set listing_status = case
           when listing_status = 'seller_lead' then 'onboarding_sent'
           else listing_status
         end,
         seller_onboarding_status = 'sent',
         seller_type = coalesce(nullif(trim(p_seller_type), ''), seller_type),
         updated_at = v_now
   where id = v_listing.id
   returning * into v_listing;

  if nullif(trim(v_listing.originating_crm_lead_id::text), '') ~*
     '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    v_originating_lead_id := v_listing.originating_crm_lead_id::uuid;
  end if;
  if nullif(trim(v_listing.seller_lead_id::text), '') ~*
     '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    v_seller_lead_id := v_listing.seller_lead_id::uuid;
  end if;

  if v_originating_lead_id is not null or v_seller_lead_id is not null then
    update public.leads
       set stage = 'Seller Onboarding Sent',
           status = 'Sent',
           seller_onboarding_status = 'sent',
           seller_onboarding_token = v_onboarding.token,
           listing_id = v_listing.id,
           updated_at = v_now
     where organisation_id = v_listing.organisation_id
       and lead_id = any(array_remove(array[v_originating_lead_id, v_seller_lead_id], null));
  end if;

  begin
    insert into public.private_listing_activity (
      private_listing_id,
      activity_type,
      activity_title,
      activity_description,
      performed_by,
      visibility,
      metadata
    )
    values (
      v_listing.id,
      'seller_onboarding_link_prepared',
      'Seller onboarding link prepared',
      'A secure seller onboarding link was prepared.',
      p_performed_by,
      'internal',
      jsonb_build_object('token', v_onboarding.token, 'preparedAt', v_now)
    );
  exception
    when insufficient_privilege or undefined_table or undefined_column then
      null;
  end;

  return jsonb_build_object(
    'onboarding', to_jsonb(v_onboarding),
    'listing', to_jsonb(v_listing),
    'prepared_at', v_now
  );
end;
$func$;

revoke all on function public.bridge_prepare_seller_onboarding_link(uuid, text, timestamptz, jsonb, text, text, text, uuid) from public;
revoke all on function public.bridge_prepare_seller_onboarding_link(uuid, text, timestamptz, jsonb, text, text, text, uuid) from anon;
grant execute on function public.bridge_prepare_seller_onboarding_link(uuid, text, timestamptz, jsonb, text, text, text, uuid) to authenticated;

commit;
