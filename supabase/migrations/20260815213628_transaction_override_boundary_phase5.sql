begin;

create or replace function public.bridge_can_create_transaction_override(target_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(exists (
    select 1
    from public.organisation_users ou
    where ou.organisation_id = target_org
      and ou.user_id = auth.uid()
      and coalesce(ou.membership_status, ou.status) = 'active'
      and regexp_replace(lower(coalesce(
        nullif(ou.workspace_role, ''),
        nullif(ou.organization_role, ''),
        nullif(ou.organisation_role, ''),
        nullif(ou.role, ''),
        nullif(ou.app_role, ''),
        ''
      )), '[\s-]+', '_', 'g') in (
        'admin',
        'administrator',
        'agency_manager',
        'agency_principal',
        'broker_owner',
        'branch_manager',
        'director',
        'manager',
        'owner',
        'partner',
        'principal',
        'super_admin',
        'workspace_admin',
        'organisation_admin',
        'organization_admin'
      )
  ), false)
$$;

create or replace function public.bridge_create_mvp_transaction(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_profile jsonb := coalesce(p_payload->'routing_profile_json', '{}'::jsonb);
  v_organisation_id uuid := nullif(trim(v_payload->>'organisation_id'), '')::uuid;
  v_lead_id uuid := nullif(trim(v_payload->>'originating_lead_id'), '')::uuid;
  v_listing_id uuid := nullif(trim(v_payload->>'listing_id'), '')::uuid;
  v_offer_id uuid := nullif(trim(v_payload->>'accepted_offer_id'), '')::uuid;
  v_idempotency_key text := nullif(trim(v_payload->>'creation_idempotency_key'), '');
  v_creation_mode text := lower(nullif(trim(coalesce(v_payload->>'creation_mode', v_payload->>'creationMode')), ''));
  v_allow_direct_lead_conversion boolean := false;
  v_override_reason text := nullif(trim(coalesce(
    v_payload->>'transaction_creation_override_reason',
    v_payload->>'transactionCreationOverrideReason',
    v_payload->>'override_reason',
    v_payload->>'overrideReason'
  )), '');
  v_override_actor_role text;
  v_transaction_type text := lower(nullif(trim(v_profile->>'transactionType'), ''));
  v_finance_type text := lower(nullif(trim(v_profile->>'financeType'), ''));
  v_property_tenure text := lower(nullif(trim(v_profile->>'propertyTenure'), ''));
  v_buyer_entity_type text := lower(nullif(trim(v_profile->>'buyerEntityType'), ''));
  v_seller_entity_type text := lower(nullif(trim(v_profile->>'sellerEntityType'), ''));
  v_buyer_id uuid := nullif(trim(v_payload->>'buyer_id'), '')::uuid;
  v_buyer_email text := lower(nullif(trim(v_payload->>'buyer_email'), ''));
  v_buyer_name text := coalesce(nullif(trim(v_payload->>'buyer_name'), ''), 'Buyer pending');
  v_buyer_phone text := nullif(trim(v_payload->>'buyer_phone'), '');
  v_offer_status text;
  v_offer_lead_id uuid;
  v_offer_listing_id uuid;
  v_lead_domain text;
  v_transaction public.transactions%rowtype;
  v_existing boolean := false;
begin
  if auth.uid() is null or v_organisation_id is null or not public.bridge_is_active_member(v_organisation_id) then
    raise exception 'You do not have access to create a transaction in this organisation.' using errcode = '42501';
  end if;

  v_allow_direct_lead_conversion := v_offer_id is null and v_creation_mode in ('onboarding_capture', 'manual_intake', 'manual_capture');

  if v_allow_direct_lead_conversion then
    if v_override_reason is null or length(v_override_reason) < 12 then
      raise exception 'Manual transaction override requires a written reason.' using errcode = '22023';
    end if;

    if not public.bridge_can_create_transaction_override(v_organisation_id) then
      raise exception 'Manual transaction override requires an authorised principal/admin actor.' using errcode = '42501';
    end if;

    select regexp_replace(lower(coalesce(
      nullif(ou.workspace_role, ''),
      nullif(ou.organization_role, ''),
      nullif(ou.organisation_role, ''),
      nullif(ou.role, ''),
      nullif(ou.app_role, ''),
      'unknown'
    )), '[\s-]+', '_', 'g')
    into v_override_actor_role
    from public.organisation_users ou
    where ou.organisation_id = v_organisation_id
      and ou.user_id = auth.uid()
      and coalesce(ou.membership_status, ou.status) = 'active'
    order by ou.created_at asc
    limit 1;

    v_profile := jsonb_set(
      v_profile,
      '{transactionCreationOverride}',
      jsonb_build_object(
        'version', 'arch9_mvp_transaction_override_authorization_v1',
        'reason', v_override_reason,
        'actorId', auth.uid(),
        'actorRole', coalesce(v_override_actor_role, 'unknown'),
        'authorised', true,
        'source', 'bridge_create_mvp_transaction'
      ),
      true
    );
  end if;

  if v_lead_id is null or v_listing_id is null or v_idempotency_key is null then
    raise exception 'MVP transaction creation requires a buyer lead, listing and idempotency key.' using errcode = '22023';
  end if;

  if v_offer_id is null and not v_allow_direct_lead_conversion then
    raise exception 'MVP transaction creation requires a buyer lead, listing, accepted offer and idempotency key.' using errcode = '22023';
  end if;

  if v_transaction_type not in ('resale', 'private_sale', 'development_sale')
    or v_finance_type not in ('cash', 'bond', 'hybrid')
    or v_property_tenure not in ('freehold', 'sectional_title', 'estate_hoa')
    or v_buyer_entity_type not in ('individual', 'company', 'trust')
    or v_seller_entity_type not in ('individual', 'company', 'trust', 'developer')
    or (v_seller_entity_type = 'developer' and v_transaction_type <> 'development_sale') then
    raise exception 'Transaction facts are incomplete or outside the Arch9 MVP launch scope.' using errcode = '22023';
  end if;

  select lead_domain into v_lead_domain
  from public.leads
  where lead_id = v_lead_id and organisation_id = v_organisation_id;
  if not found or v_lead_domain <> 'agency' then
    raise exception 'The buyer lead is not an agency lead in this organisation.' using errcode = '22023';
  end if;

  perform 1
  from public.private_listings
  where id = v_listing_id and organisation_id = v_organisation_id;
  if not found then
    raise exception 'The listing is not available in this organisation.' using errcode = '22023';
  end if;

  if v_offer_id is not null then
    select status, buyer_lead_id, listing_id
    into v_offer_status, v_offer_lead_id, v_offer_listing_id
    from public.offers
    where id = v_offer_id and organisation_id = v_organisation_id;
    if not found or v_offer_lead_id is distinct from v_lead_id or v_offer_listing_id is distinct from v_listing_id then
      raise exception 'The accepted offer does not match the buyer lead and listing.' using errcode = '22023';
    end if;
  end if;

  perform pg_advisory_xact_lock(hashtext(v_organisation_id::text || ':' || coalesce(v_offer_id::text, v_idempotency_key)));

  select * into v_transaction
  from public.transactions
  where organisation_id = v_organisation_id
    and (
      (v_offer_id is not null and accepted_offer_id = v_offer_id)
      or creation_idempotency_key = v_idempotency_key
    )
  order by ((v_offer_id is not null and accepted_offer_id = v_offer_id)) desc
  limit 1;
  v_existing := found;

  if not v_existing and v_offer_id is not null and v_offer_status <> 'accepted' then
    raise exception 'Only an accepted offer can create an MVP transaction.' using errcode = '22023';
  end if;

  if not v_existing and v_buyer_id is null and v_buyer_email is not null then
    select id into v_buyer_id
    from public.buyers
    where organisation_id = v_organisation_id and lower(email) = v_buyer_email
    order by id
    limit 1;
  end if;

  if not v_existing and v_buyer_id is null then
    insert into public.buyers (organisation_id, name, phone, email)
    values (v_organisation_id, v_buyer_name, v_buyer_phone, v_buyer_email)
    returning id into v_buyer_id;
  end if;

  if not v_existing then
    insert into public.transactions (
      organisation_id, buyer_id, transaction_reference, transaction_type,
      property_type, property_tenure, property_address_line_1, suburb, city,
      province, property_description, sales_price, purchase_price, finance_type,
      cash_amount, bond_amount, deposit_amount, purchaser_type, seller_type,
      seller_has_existing_bond, existing_bond, cancellation_required, vat_treatment,
      routing_profile_version, routing_profile_json, stage, current_main_stage,
      next_action, comment, onboarding_status, assigned_agent, assigned_agent_email,
      assigned_agent_id, owner_user_id, is_active, lifecycle_state, listing_id,
      originating_lead_id, originating_buyer_lead_id, accepted_offer_id,
      buyer_contact_id, seller_contact_id, otp_packet_id, mandate_packet_id,
      commission_snapshot_id, gross_commission_percentage, gross_commission_amount,
      agent_split_percentage_snapshot, agency_split_percentage_snapshot,
      agent_commission_amount, agency_commission_amount, creation_idempotency_key,
      created_at, updated_at
    ) values (
      v_organisation_id, v_buyer_id,
      nullif(trim(v_payload->>'transaction_reference'), ''),
      nullif(trim(v_payload->>'transaction_type'), ''),
      nullif(trim(v_payload->>'property_type'), ''),
      nullif(trim(v_payload->>'property_tenure'), ''),
      nullif(trim(v_payload->>'property_address_line_1'), ''),
      nullif(trim(v_payload->>'suburb'), ''), nullif(trim(v_payload->>'city'), ''),
      nullif(trim(v_payload->>'province'), ''), nullif(trim(v_payload->>'property_description'), ''),
      nullif(trim(v_payload->>'sales_price'), '')::numeric,
      nullif(trim(v_payload->>'purchase_price'), '')::numeric,
      nullif(trim(v_payload->>'finance_type'), ''),
      nullif(trim(v_payload->>'cash_amount'), '')::numeric,
      nullif(trim(v_payload->>'bond_amount'), '')::numeric,
      nullif(trim(v_payload->>'deposit_amount'), '')::numeric,
      nullif(trim(v_payload->>'purchaser_type'), ''), nullif(trim(v_payload->>'seller_type'), ''),
      coalesce((v_payload->>'seller_has_existing_bond')::boolean, false),
      coalesce((v_payload->>'existing_bond')::boolean, false),
      coalesce((v_payload->>'cancellation_required')::boolean, false),
      nullif(trim(v_payload->>'vat_treatment'), ''), nullif(trim(v_payload->>'routing_profile_version'), ''),
      v_profile, nullif(trim(v_payload->>'stage'), ''), nullif(trim(v_payload->>'current_main_stage'), ''),
      nullif(trim(v_payload->>'next_action'), ''), nullif(trim(v_payload->>'comment'), ''),
      nullif(trim(v_payload->>'onboarding_status'), ''), nullif(trim(v_payload->>'assigned_agent'), ''),
      nullif(trim(v_payload->>'assigned_agent_email'), ''),
      nullif(trim(v_payload->>'assigned_agent_id'), '')::uuid,
      nullif(trim(v_payload->>'owner_user_id'), '')::uuid, true,
      coalesce(nullif(trim(v_payload->>'lifecycle_state'), ''), 'active'),
      v_listing_id, v_lead_id, v_lead_id, v_offer_id,
      nullif(trim(v_payload->>'buyer_contact_id'), '')::uuid,
      nullif(trim(v_payload->>'seller_contact_id'), '')::uuid,
      nullif(trim(v_payload->>'otp_packet_id'), '')::uuid,
      nullif(trim(v_payload->>'mandate_packet_id'), '')::uuid,
      nullif(trim(v_payload->>'commission_snapshot_id'), '')::uuid,
      nullif(trim(v_payload->>'gross_commission_percentage'), '')::numeric,
      nullif(trim(v_payload->>'gross_commission_amount'), '')::numeric,
      nullif(trim(v_payload->>'agent_split_percentage_snapshot'), '')::numeric,
      nullif(trim(v_payload->>'agency_split_percentage_snapshot'), '')::numeric,
      nullif(trim(v_payload->>'agent_commission_amount'), '')::numeric,
      nullif(trim(v_payload->>'agency_commission_amount'), '')::numeric,
      v_idempotency_key, now(), now()
    )
    on conflict (organisation_id, creation_idempotency_key)
      where creation_idempotency_key is not null
      do update set updated_at = excluded.updated_at
    returning * into v_transaction;
  end if;

  update public.leads
  set converted_transaction_id = v_transaction.id,
      converted_at = coalesce(converted_at, now()),
      current_stage = 'Onboarding',
      stage = 'Onboarding',
      status = 'Onboarding',
      updated_at = now()
  where organisation_id = v_organisation_id and lead_id = v_lead_id;

  if v_offer_id is not null then
    update public.offers
    set transaction_id = v_transaction.id,
        status = case when status = 'accepted' then 'converted_to_transaction' else status end,
        converted_to_transaction_at = coalesce(converted_to_transaction_at, now())
    where id = v_offer_id and organisation_id = v_organisation_id;
  end if;

  perform public.bridge_seed_mvp_transaction_participants(v_transaction.id, v_payload->'participant_bootstrap');
  perform public.bridge_seed_mvp_transaction_documents(v_transaction.id, v_payload->'document_bootstrap');
  perform public.bridge_seed_mvp_transaction_workflow_lanes(v_transaction.id, v_organisation_id, v_payload->'workflow_bootstrap');

  return jsonb_build_object('transaction', to_jsonb(v_transaction), 'existing', v_existing);
end;
$$;

revoke all on function public.bridge_can_create_transaction_override(uuid) from public;
grant execute on function public.bridge_can_create_transaction_override(uuid) to authenticated;

revoke all on function public.bridge_create_mvp_transaction(jsonb) from public;
grant execute on function public.bridge_create_mvp_transaction(jsonb) to authenticated;

notify pgrst, 'reload schema';

commit;
