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

  update public.private_listings
     set listing_status = case
           when v_status in ('sent', 'in_progress') and listing_status = 'seller_lead' then 'onboarding_sent'
           else listing_status
         end,
         seller_onboarding_status = case
           when v_status in ('sent', 'in_progress') then v_status
           else seller_onboarding_status
         end,
         updated_at = case
           when v_status in ('sent', 'in_progress') then now()
           else updated_at
         end
   where id = v_onboarding.private_listing_id
   returning * into v_listing;

  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'listing', to_jsonb(v_listing),
    'onboarding', to_jsonb(v_onboarding) - 'seller_portal_password_hash' - 'seller_portal_access_token_hash' - 'seller_portal_invite_token_hash',
    'transaction', 'null'::jsonb,
    'requirements', '[]'::jsonb,
    'documents', '[]'::jsonb,
    'appointments', '[]'::jsonb,
    'mandatePacket', 'null'::jsonb,
    'corePayload', true,
    'portalAccess', jsonb_build_object(
      'passwordSet', v_onboarding.seller_portal_password_hash is not null,
      'accessGranted', true,
      'expiresAt', v_onboarding.seller_portal_access_token_expires_at,
      'portalLinkExpiresAt', v_onboarding.seller_portal_link_expires_at
    )
  );
end;
$func$;

grant execute on function public.bridge_update_private_listing_seller_onboarding_progress(text, text, jsonb, text, text, text) to anon, authenticated;

comment on function public.bridge_update_private_listing_seller_onboarding_progress(text, text, jsonb, text, text, text) is
  'Saves seller onboarding draft progress on the hot path and returns a minimal payload so optional portal enrichment cannot delay Save & Continue.';

notify pgrst, 'reload schema';

commit;
