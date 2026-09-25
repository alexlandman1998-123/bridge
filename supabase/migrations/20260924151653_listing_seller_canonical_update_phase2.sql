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
      'onboarding', to_jsonb(v_onboarding),
      'mutationId', p_mutation_id,
      'idempotentReplay', true,
      'updatedAt', v_listing.updated_at
    );
  end if;

  if p_expected_updated_at is not null and v_listing.updated_at is distinct from p_expected_updated_at then
    raise exception using
      errcode = '40001',
      message = 'This seller record changed after you opened it. Reload the listing and review the latest details before saving.';
  end if;

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

  select * into v_onboarding
  from public.private_listing_seller_onboarding
  where private_listing_id = p_listing_id
  for update;

  if found then
    update public.private_listing_seller_onboarding
       set form_data = coalesce(v_onboarding.form_data, '{}'::jsonb) || coalesce(p_form_data, '{}'::jsonb),
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
      coalesce(p_form_data, '{}'::jsonb),
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
    'onboarding', to_jsonb(v_onboarding),
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
