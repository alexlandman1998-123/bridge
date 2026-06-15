begin;
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
set search_path = public
as $func$
declare
  v_onboarding public.private_listing_seller_onboarding%rowtype;
  v_form_data jsonb := coalesce(p_form_data, '{}'::jsonb);
  v_listing public.private_listings%rowtype;
begin
  select *
    into v_onboarding
  from public.private_listing_seller_onboarding
  where token = nullif(trim(p_token), '')
    and (token_expires_at is null or token_expires_at > now())
  limit 1;

  if not found then
    return null;
  end if;

  select * into v_listing
  from public.private_listings
  where id = v_onboarding.private_listing_id;

  if not found then
    return null;
  end if;

  update public.private_listing_seller_onboarding
     set status = 'completed',
         form_data = coalesce(form_data, '{}'::jsonb) || v_form_data,
         seller_type = coalesce(nullif(trim(p_seller_type), ''), seller_type),
         ownership_structure = coalesce(nullif(trim(p_ownership_structure), ''), ownership_structure),
         marital_regime = coalesce(nullif(trim(p_marital_regime), ''), marital_regime),
         submitted_at = coalesce(submitted_at, now()),
         updated_at = now()
   where id = v_onboarding.id;

  update public.private_listings
     set listing_status = case
           when listing_status in ('seller_lead', 'onboarding_sent') then 'onboarding_completed'
           else listing_status
         end,
         seller_onboarding_status = 'completed',
         seller_type = coalesce(nullif(trim(p_seller_type), ''), seller_type),
         updated_at = now()
   where id = v_onboarding.private_listing_id;

  update public.leads
     set stage = 'Onboarding Completed',
         status = 'Onboarding Completed',
         seller_onboarding_status = 'completed',
         seller_onboarding_token = coalesce(v_onboarding.token, seller_onboarding_token),
         listing_id = v_listing.id,
         updated_at = now()
   where organisation_id = v_listing.organisation_id
     and (lead_id = v_listing.originating_crm_lead_id or lead_id = v_listing.seller_lead_id);

  if to_regclass('public.private_listing_activity') is not null then
    begin
      insert into public.private_listing_activity (
        private_listing_id,
        activity_type,
        activity_title,
        activity_description,
        visibility,
        metadata
      )
      values (
        v_onboarding.private_listing_id,
        'seller_onboarding_completed',
        'Seller onboarding completed',
        'Seller completed onboarding from the secure seller portal.',
        'internal',
        jsonb_build_object('submittedAt', now(), 'source', 'seller_portal')
      )
      on conflict do nothing;
    exception
      when undefined_table or undefined_column then
        null;
    end;
  end if;

  return public.bridge_private_listing_seller_portal_payload(p_token);
end;
$func$;
grant execute on function public.bridge_complete_private_listing_seller_onboarding(text, jsonb, text, text, text) to anon, authenticated;
commit;
