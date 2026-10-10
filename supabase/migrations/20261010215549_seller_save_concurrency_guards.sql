-- Guard the existing token RPCs without changing their public argument names.
-- The original completion projections remain private and run under these locks.
begin;
create schema if not exists seller_save_private;
revoke all on schema seller_save_private from public, anon, authenticated;
alter function public.bridge_update_private_listing_seller_onboarding_progress(text,text,jsonb,text,text,text) set schema seller_save_private;
alter function public.bridge_complete_private_listing_seller_onboarding(text,jsonb,text,text,text) set schema seller_save_private;
revoke all on function seller_save_private.bridge_update_private_listing_seller_onboarding_progress(text,text,jsonb,text,text,text) from public, anon, authenticated;
revoke all on function seller_save_private.bridge_complete_private_listing_seller_onboarding(text,jsonb,text,text,text) from public, anon, authenticated;

create function seller_save_private.lock_onboarding_save(p_token text, p_revision jsonb)
returns public.private_listing_seller_onboarding
language plpgsql security definer set search_path = '' as $$
declare
  v_onboarding public.private_listing_seller_onboarding%rowtype;
  v_listing public.private_listings%rowtype;
begin
  select * into v_onboarding from public.private_listing_seller_onboarding
    where token = nullif(pg_catalog.btrim(p_token), '')
      and (token_expires_at is null or token_expires_at > pg_catalog.now()) limit 1;
  if not found then return null; end if;
  -- Match the agent command's lock order: listing first, then onboarding.
  select * into v_listing from public.private_listings where id = v_onboarding.private_listing_id for update;
  if not found then return null; end if;
  select * into v_onboarding from public.private_listing_seller_onboarding
    where id = v_onboarding.id and token = nullif(pg_catalog.btrim(p_token), '')
      and (token_expires_at is null or token_expires_at > pg_catalog.now()) for update;
  if not found or not public.bridge_private_listing_seller_portal_link_is_active(to_jsonb(v_onboarding), to_jsonb(v_listing)) then return null; end if;
  if not (coalesce(p_revision, '{}'::jsonb) ? 'updatedAt')
     or v_onboarding.id::text is distinct from p_revision->>'onboardingId'
     or v_onboarding.updated_at is distinct from nullif(p_revision->>'updatedAt', '')::timestamptz then
    raise exception using errcode = 'PT409', message = 'Someone else saved changes to this seller record. Your entries are still in this form. Review the latest saved details before trying again.';
  end if;
  if v_onboarding.status = 'completed' or v_onboarding.submitted_at is not null then
    raise exception using errcode = 'PT409', message = 'Seller onboarding has already been submitted. Your entries are still in this form. Review the completed record before making further changes.';
  end if;
  return v_onboarding;
end;
$$;
revoke all on function seller_save_private.lock_onboarding_save(text,jsonb) from public, anon, authenticated;

create function public.bridge_update_private_listing_seller_onboarding_progress(
 p_token text, p_status text default 'in_progress', p_form_data jsonb default '{}'::jsonb,
 p_seller_type text default null, p_ownership_structure text default null, p_marital_regime text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_onboarding public.private_listing_seller_onboarding%rowtype;
begin
  v_onboarding := seller_save_private.lock_onboarding_save(p_token, p_form_data->'__sellerSave');
  if v_onboarding.id is null then return null; end if;
  -- Draft saving cannot manufacture completion or reopen a submitted record.
  if p_status not in ('not_started','sent','in_progress') then
    raise exception using errcode = '22023', message = 'Use seller onboarding submission to complete this record.';
  end if;
  return seller_save_private.bridge_update_private_listing_seller_onboarding_progress(
    p_token, p_status, p_form_data - '__sellerSave', p_seller_type, p_ownership_structure, p_marital_regime);
end;
$$;
create function public.bridge_complete_private_listing_seller_onboarding(
 p_token text, p_form_data jsonb default '{}'::jsonb, p_seller_type text default null,
 p_ownership_structure text default null, p_marital_regime text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_onboarding public.private_listing_seller_onboarding%rowtype;
begin
  v_onboarding := seller_save_private.lock_onboarding_save(p_token, p_form_data->'__sellerSave');
  if v_onboarding.id is null then return null; end if;
  return seller_save_private.bridge_complete_private_listing_seller_onboarding(
    p_token, p_form_data - '__sellerSave', p_seller_type, p_ownership_structure, p_marital_regime);
end;
$$;
revoke all on function public.bridge_update_private_listing_seller_onboarding_progress(text,text,jsonb,text,text,text) from public;
revoke all on function public.bridge_complete_private_listing_seller_onboarding(text,jsonb,text,text,text) from public;
grant execute on function public.bridge_update_private_listing_seller_onboarding_progress(text,text,jsonb,text,text,text) to anon, authenticated;
grant execute on function public.bridge_complete_private_listing_seller_onboarding(text,jsonb,text,text,text) to anon, authenticated;

-- Staff-only profile/prefill saves use the same lock order and compare the
-- revision captured by the caller, including a checked absence on creation.
create function public.save_private_listing_seller_onboarding_profile(
 p_listing_id uuid, p_token text, p_form_data jsonb, p_revision jsonb,
 p_status text, p_seller_type text, p_ownership_structure text, p_marital_regime text,
 p_replace_token boolean default false, p_reopen_for_correction boolean default false
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
 v_onboarding public.private_listing_seller_onboarding%rowtype;
 v_listing public.private_listings%rowtype;
 v_status text := p_status;
 v_now timestamptz;
begin
 select * into v_listing from public.private_listings where id = p_listing_id for update;
 if not found then raise exception using errcode='P0002', message='The listing was not found or is no longer available.'; end if;
 select * into v_onboarding from public.private_listing_seller_onboarding where private_listing_id=p_listing_id for update;
 if not (coalesce(p_revision,'{}'::jsonb) ? 'updatedAt')
    or v_onboarding.id::text is distinct from p_revision->>'onboardingId'
    or v_onboarding.updated_at is distinct from nullif(p_revision->>'updatedAt','')::timestamptz then
   raise exception using errcode='PT409', message='Someone else saved changes to this seller record. Your entries are still in this form. Review the latest saved details before trying again.';
 end if;
 if v_status not in ('not_started','sent','in_progress','completed','rejected') then
   raise exception using errcode='22023', message='Invalid seller onboarding status.';
 end if;
 if not p_replace_token and not p_reopen_for_correction and (v_onboarding.status='completed' or v_onboarding.submitted_at is not null) then v_status := 'completed'; end if;
 v_now := pg_catalog.clock_timestamp();
 if v_onboarding.id is not null then
   update public.private_listing_seller_onboarding set
     token=case when p_replace_token then p_token else token end,
     form_data=p_form_data - '__sellerSave', status=v_status,
     seller_type=coalesce(p_seller_type,seller_type), ownership_structure=coalesce(p_ownership_structure,ownership_structure),
     marital_regime=coalesce(p_marital_regime,marital_regime),
     canonical_facts_json=coalesce(p_form_data->'canonicalSellerFacts',canonical_facts_json),
     canonical_fact_readiness_json=coalesce(p_form_data->'canonicalSellerFactReadiness',canonical_fact_readiness_json),
     canonical_facts_updated_at=case when p_form_data ? 'canonicalSellerFacts' then v_now else canonical_facts_updated_at end,
     submitted_at=case when p_replace_token or p_reopen_for_correction then null when v_status='completed' then coalesce(submitted_at,v_now) else submitted_at end,
     updated_at=v_now
   where id=v_onboarding.id returning * into v_onboarding;
 else
   insert into public.private_listing_seller_onboarding(private_listing_id,token,form_data,status,seller_type,ownership_structure,marital_regime,
     canonical_facts_json,canonical_fact_readiness_json,canonical_facts_updated_at,submitted_at,updated_at)
   values(p_listing_id,p_token,p_form_data - '__sellerSave',v_status,p_seller_type,p_ownership_structure,p_marital_regime,
     coalesce(p_form_data->'canonicalSellerFacts','{}'::jsonb),coalesce(p_form_data->'canonicalSellerFactReadiness','{}'::jsonb),
     v_now,case when v_status='completed' then v_now else null end,v_now) returning * into v_onboarding;
 end if;
 update public.private_listings set seller_onboarding_status=v_status,
   seller_type=coalesce(p_seller_type,seller_type),
   seller_canonical_facts_json=coalesce(p_form_data->'canonicalSellerFacts',seller_canonical_facts_json),
   seller_canonical_fact_readiness_json=coalesce(p_form_data->'canonicalSellerFactReadiness',seller_canonical_fact_readiness_json),
   seller_canonical_facts_updated_at=case when p_form_data ? 'canonicalSellerFacts' then v_now else seller_canonical_facts_updated_at end,
   updated_at=v_now where id=p_listing_id returning * into v_listing;
 return (to_jsonb(v_onboarding) - 'seller_portal_password_hash' - 'seller_portal_access_token_hash' - 'seller_portal_invite_token_hash' - 'seller_portal_recovery_token_hash') || jsonb_build_object('listing_updated_at',v_listing.updated_at);
end;
$$;
revoke all on function public.save_private_listing_seller_onboarding_profile(uuid,text,jsonb,jsonb,text,text,text,text,boolean,boolean) from public, anon;
grant execute on function public.save_private_listing_seller_onboarding_profile(uuid,text,jsonb,jsonb,text,text,text,text,boolean,boolean) to authenticated;

-- Save the listing seller projection and onboarding form as one transaction.
-- The function is security invoker: existing RLS policies remain authoritative.
create or replace function public.save_private_listing_seller_canonical_update(
  p_listing_id uuid,
  p_form_data jsonb,
  p_canonical_facts jsonb,
  p_canonical_readiness jsonb,
  p_listing_patch jsonb,
  p_onboarding_status text,
  p_seller_type text,
  p_ownership_structure text,
  p_marital_regime text,
  p_mutation_id uuid,
  p_mutation_type text,
  p_source text,
  p_changed_fields text[],
  p_expected_updated_at timestamptz default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public, extensions
as $$
declare
  v_listing public.private_listings%rowtype;
  v_onboarding public.private_listing_seller_onboarding%rowtype;
  v_now timestamptz := pg_catalog.now();
  v_status text := coalesce(nullif(pg_catalog.btrim(p_onboarding_status), ''), 'not_started');
  v_existing_mutation boolean := false;
  v_asking_price numeric := null;
begin
  select *
    into v_listing
  from public.private_listings
  where id = p_listing_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'The listing was not found or is no longer available.';
  end if;

  if p_mutation_id is not null then
    select exists (
      select 1
      from public.private_listing_activity activity
      where activity.private_listing_id = p_listing_id
        and activity.activity_type = 'seller_canonical_update'
        and activity.metadata ->> 'mutationId' = p_mutation_id::text
    ) into v_existing_mutation;
  end if;

  if v_existing_mutation then
    select * into v_onboarding
    from public.private_listing_seller_onboarding
    where private_listing_id = p_listing_id;

    return jsonb_build_object(
      'listing', to_jsonb(v_listing),
      'onboarding', (to_jsonb(v_onboarding) - 'seller_portal_password_hash' - 'seller_portal_access_token_hash' - 'seller_portal_invite_token_hash' - 'seller_portal_recovery_token_hash'),
      'mutationId', p_mutation_id,
      'idempotentReplay', true,
      'updatedAt', v_listing.updated_at
    );
  end if;

  if v_listing.updated_at is distinct from p_expected_updated_at then
    raise exception using
      errcode = 'PT409',
      message = 'This seller record changed after you opened it. Reload the listing and review the latest details before saving.';
  end if;

  select * into v_onboarding
  from public.private_listing_seller_onboarding
  where private_listing_id = p_listing_id
  for update;
  if p_form_data ? '__sellerSave' and (
    not (p_form_data->'__sellerSave' ? 'updatedAt') or
    v_onboarding.id::text is distinct from p_form_data#>>'{__sellerSave,onboardingId}' or
    v_onboarding.updated_at is distinct from nullif(p_form_data#>>'{__sellerSave,updatedAt}', '')::timestamptz
  ) then
    raise exception using errcode='PT409', message='Someone else saved changes to this seller record. Your entries are still in this form. Review the latest saved details before trying again.';
  end if;
  if v_onboarding.status = 'completed' or v_onboarding.submitted_at is not null then v_status := 'completed'; end if;
  v_now := pg_catalog.clock_timestamp();

  if coalesce(p_listing_patch ->> 'askingPrice', '') ~ '^-?[0-9]+([.][0-9]+)?$' then
    v_asking_price := (p_listing_patch ->> 'askingPrice')::numeric;
  end if;

  update public.private_listings
     set seller_type = coalesce(nullif(pg_catalog.btrim(p_seller_type), ''), seller_type),
         seller_onboarding_status = v_status,
         seller_canonical_facts_json = coalesce(p_canonical_facts, '{}'::jsonb),
         seller_canonical_fact_readiness_json = coalesce(p_canonical_readiness, '{}'::jsonb),
         seller_canonical_facts_updated_at = v_now,
         address_line_1 = coalesce(nullif(pg_catalog.btrim(coalesce(p_listing_patch ->> 'addressLine1', p_listing_patch ->> 'propertyAddress', '')), ''), address_line_1),
         asking_price = coalesce(v_asking_price, asking_price),
         mandate_type = coalesce(nullif(pg_catalog.btrim(p_listing_patch ->> 'mandateType'), ''), mandate_type),
         updated_at = v_now
   where id = p_listing_id
   returning * into v_listing;


  if v_onboarding.id is not null then
    update public.private_listing_seller_onboarding
       set form_data = coalesce(v_onboarding.form_data, '{}'::jsonb) || (coalesce(p_form_data, '{}'::jsonb) - '__sellerSave'),
           status = v_status,
           seller_type = coalesce(nullif(pg_catalog.btrim(p_seller_type), ''), seller_type),
           ownership_structure = coalesce(nullif(pg_catalog.btrim(p_ownership_structure), ''), ownership_structure),
           marital_regime = coalesce(nullif(pg_catalog.btrim(p_marital_regime), ''), marital_regime),
           canonical_facts_json = coalesce(p_canonical_facts, '{}'::jsonb),
           canonical_fact_readiness_json = coalesce(p_canonical_readiness, '{}'::jsonb),
           canonical_facts_updated_at = v_now,
           submitted_at = case when v_status = 'completed' then coalesce(submitted_at, v_now) else submitted_at end,
           updated_at = v_now
     where id = v_onboarding.id
     returning * into v_onboarding;
  else
    insert into public.private_listing_seller_onboarding (
      private_listing_id,
      token,
      form_data,
      status,
      seller_type,
      ownership_structure,
      marital_regime,
      canonical_facts_json,
      canonical_fact_readiness_json,
      canonical_facts_updated_at,
      submitted_at,
      updated_at
    ) values (
      p_listing_id,
      'seller-' || encode(extensions.gen_random_bytes(24), 'hex'),
      (coalesce(p_form_data, '{}'::jsonb) - '__sellerSave'),
      v_status,
      nullif(pg_catalog.btrim(p_seller_type), ''),
      nullif(pg_catalog.btrim(p_ownership_structure), ''),
      nullif(pg_catalog.btrim(p_marital_regime), ''),
      coalesce(p_canonical_facts, '{}'::jsonb),
      coalesce(p_canonical_readiness, '{}'::jsonb),
      v_now,
      case when v_status = 'completed' then v_now else null end,
      v_now
    )
    returning * into v_onboarding;
  end if;

  insert into public.private_listing_activity (
    private_listing_id,
    activity_type,
    activity_title,
    activity_description,
    performed_by,
    visibility,
    metadata
  ) values (
    p_listing_id,
    'seller_canonical_update',
    'Seller details updated',
    'Seller information was saved to the canonical listing and onboarding record.',
    auth.uid(),
    'internal',
    jsonb_build_object(
      'mutationId', p_mutation_id,
      'mutationType', coalesce(nullif(pg_catalog.btrim(p_mutation_type), ''), 'seller_edit'),
      'source', coalesce(nullif(pg_catalog.btrim(p_source), ''), 'agent_listing_workspace'),
      'changedFields', coalesce(to_jsonb(p_changed_fields), '[]'::jsonb),
      'authorityProfile', coalesce(p_listing_patch ->> 'authorityProfile', 'unknown'),
      'requirementsAffected', coalesce((p_listing_patch ->> 'requirementsAffected')::boolean, false),
      'updatedAt', v_now
    )
  );

  return jsonb_build_object(
    'listing', to_jsonb(v_listing),
    'onboarding', (to_jsonb(v_onboarding) - 'seller_portal_password_hash' - 'seller_portal_access_token_hash' - 'seller_portal_invite_token_hash' - 'seller_portal_recovery_token_hash'),
    'mutationId', p_mutation_id,
    'idempotentReplay', false,
    'updatedAt', v_now
  );
end;
$$;

revoke all on function public.save_private_listing_seller_canonical_update(
  uuid, jsonb, jsonb, jsonb, jsonb, text, text, text, text, uuid, text, text, text[], timestamptz
) from public, anon;

grant execute on function public.save_private_listing_seller_canonical_update(
  uuid, jsonb, jsonb, jsonb, jsonb, text, text, text, text, uuid, text, text, text[], timestamptz
) to authenticated;

comment on function public.save_private_listing_seller_canonical_update(
  uuid, jsonb, jsonb, jsonb, jsonb, text, text, text, text, uuid, text, text, text[], timestamptz
) is 'Atomically saves the agent-side canonical seller listing projection, onboarding form and internal audit receipt under existing RLS.';


notify pgrst, 'reload schema';
commit;
