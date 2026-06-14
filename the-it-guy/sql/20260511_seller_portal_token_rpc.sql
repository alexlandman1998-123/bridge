begin;

create or replace function public.bridge_private_listing_seller_portal_payload(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_onboarding public.private_listing_seller_onboarding%rowtype;
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

  select *
    into v_listing
  from public.private_listings
  where id = v_onboarding.private_listing_id
  limit 1;

  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'listing', to_jsonb(v_listing),
    'onboarding', to_jsonb(v_onboarding)
  );
end;
$$;

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
as $$
declare
  v_onboarding public.private_listing_seller_onboarding%rowtype;
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
   where id = v_onboarding.id;

  if v_status in ('sent', 'in_progress') then
    update public.private_listings
       set listing_status = case
             when listing_status = 'seller_lead' then 'onboarding_sent'
             else listing_status
           end,
           seller_onboarding_status = v_status,
           updated_at = now()
     where id = v_onboarding.private_listing_id;
  end if;

  return public.bridge_private_listing_seller_portal_payload(p_token);
end;
$$;

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
as $$
declare
  v_onboarding public.private_listing_seller_onboarding%rowtype;
  v_listing public.private_listings%rowtype;
  v_form_data jsonb := coalesce(p_form_data, '{}'::jsonb);
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

  select *
    into v_listing
  from public.private_listings
  where id = v_onboarding.private_listing_id
  limit 1;

  if found then
    update public.leads
       set stage = 'Seller Onboarding Submitted',
           status = 'Submitted',
           seller_onboarding_status = 'completed',
           seller_onboarding_token = coalesce(nullif(trim(p_token), ''), seller_onboarding_token),
           listing_id = v_onboarding.private_listing_id::text,
           updated_at = now()
     where organisation_id = v_listing.organisation_id
       and lead_id::text in (
         nullif(trim(coalesce(v_listing.seller_lead_id::text, '')), ''),
         nullif(trim(coalesce(v_listing.originating_crm_lead_id::text, '')), '')
       );
  end if;

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
$$;

grant execute on function public.bridge_private_listing_seller_portal_payload(text) to anon, authenticated;
grant execute on function public.bridge_update_private_listing_seller_onboarding_progress(text, text, jsonb, text, text, text) to anon, authenticated;
grant execute on function public.bridge_complete_private_listing_seller_onboarding(text, jsonb, text, text, text) to anon, authenticated;

commit;
