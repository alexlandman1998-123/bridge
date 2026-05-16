begin;

do $$
begin
  if to_regclass('public.client_portal_contexts') is not null then
    create index if not exists client_portal_contexts_seller_workspace_token_idx
      on public.client_portal_contexts (seller_workspace_token)
      where seller_workspace_token is not null;
  end if;
end $$;

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
  v_next_form_data jsonb := '{}'::jsonb;
  v_listing public.private_listings%rowtype;
  v_originating_lead_id uuid := null;
  v_seller_lead_id uuid := null;
  v_context_seller_lead_id uuid := null;
  v_client_email text := null;
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
  where id = v_onboarding.private_listing_id;

  if not found then
    return null;
  end if;

  v_next_form_data := coalesce(v_onboarding.form_data, '{}'::jsonb) || v_form_data;

  update public.private_listing_seller_onboarding
     set status = 'completed',
         form_data = v_next_form_data,
         seller_type = coalesce(nullif(trim(p_seller_type), ''), seller_type),
         ownership_structure = coalesce(nullif(trim(p_ownership_structure), ''), ownership_structure),
         marital_regime = coalesce(nullif(trim(p_marital_regime), ''), marital_regime),
         submitted_at = coalesce(submitted_at, now()),
         updated_at = now()
   where id = v_onboarding.id
   returning * into v_onboarding;

  update public.private_listings
     set listing_status = case
           when listing_status in ('seller_lead', 'onboarding_sent') then 'onboarding_completed'
           else listing_status
         end,
         seller_onboarding_status = 'completed',
         seller_type = coalesce(nullif(trim(p_seller_type), ''), seller_type),
         updated_at = now()
   where id = v_onboarding.private_listing_id
   returning * into v_listing;

  if nullif(trim(v_listing.originating_crm_lead_id::text), '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    v_originating_lead_id := v_listing.originating_crm_lead_id::uuid;
  end if;

  if nullif(trim(v_listing.seller_lead_id::text), '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    v_seller_lead_id := v_listing.seller_lead_id::uuid;
  end if;

  v_context_seller_lead_id := coalesce(v_seller_lead_id, v_originating_lead_id);
  v_client_email := lower(nullif(trim(coalesce(
    v_next_form_data->>'sellerEmail',
    v_next_form_data->>'email',
    v_next_form_data->>'contactEmail',
    ''
  )), ''));

  if v_originating_lead_id is not null or v_seller_lead_id is not null then
    update public.leads
       set stage = 'Onboarding Completed',
           status = 'Onboarding Completed',
           seller_onboarding_status = 'completed',
           seller_onboarding_token = coalesce(v_onboarding.token, seller_onboarding_token),
           listing_id = v_listing.id,
           updated_at = now()
     where organisation_id = v_listing.organisation_id
       and lead_id = any(array_remove(array[v_originating_lead_id, v_seller_lead_id], null));
  end if;

  if to_regclass('public.client_portal_contexts') is not null then
    begin
      update public.client_portal_contexts
         set organisation_id = v_listing.organisation_id,
             client_email = v_client_email,
             context_type = 'selling',
             seller_lead_id = v_context_seller_lead_id,
             listing_id = v_listing.id::text,
             status = 'active',
             updated_at = now()
       where seller_workspace_token = v_onboarding.token;

      if not found then
        insert into public.client_portal_contexts (
          organisation_id,
          client_email,
          context_type,
          transaction_id,
          seller_lead_id,
          listing_id,
          seller_workspace_token,
          status,
          updated_at
        )
        values (
          v_listing.organisation_id,
          v_client_email,
          'selling',
          null,
          v_context_seller_lead_id,
          v_listing.id::text,
          v_onboarding.token,
          'active',
          now()
        );
      end if;
    exception
      when undefined_table or undefined_column then
        null;
    end;
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
        'Seller completed onboarding from the secure client portal.',
        'internal',
        jsonb_build_object('submittedAt', now(), 'source', 'client_portal')
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
