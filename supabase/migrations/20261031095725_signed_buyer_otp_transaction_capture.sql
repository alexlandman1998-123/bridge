begin;

-- Capturing an existing signed paper OTP is an assigned-agent operation.
-- It records evidence for review; it grants no legal approval or delivery rights.
create or replace function document_security.can_capture_signed_buyer_otp(p_payload jsonb)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  org uuid := nullif(p_payload->>'organisation_id','')::uuid;
  buyer_lead uuid := nullif(p_payload->>'originating_lead_id','')::uuid;
  listing uuid := nullif(p_payload->>'listing_id','')::uuid;
  object_path text := p_payload->>'signed_otp_storage_path';
  saved_lead public.leads%rowtype;
  evidence jsonb;
  raw jsonb;
begin
  if auth.uid() is null or org is null or buyer_lead is null or listing is null
    or not public.bridge_is_active_member(org) then return false; end if;
  select * into saved_lead from public.leads
    where lead_id=buyer_lead and organisation_id=org and lower(lead_category)='buyer';
  if not found or not coalesce(public.bridge_can_access_assignment(org,saved_lead.assigned_agent_id,null),false)
    or lower(coalesce(saved_lead.status,'')) in ('lost','archived','closed lost','closed_lost') then return false; end if;
  if nullif(p_payload->>'assigned_agent_id','')::uuid is distinct from coalesce(saved_lead.assigned_agent_id,auth.uid())
    or nullif(p_payload->>'owner_user_id','')::uuid is distinct from coalesce(saved_lead.assigned_agent_id,auth.uid()) then return false; end if;
  if not exists(select 1 from public.private_listings where id=listing and organisation_id=org) then return false; end if;
  if object_path is null or cardinality(string_to_array(object_path,'/'))<>5
    or object_path not like 'buyer-otp-documents/'||org::text||'/'||buyer_lead::text||'/uploaded_otp/%'
    or object_path ~ '(^|/)\.\.?(/|$)' then return false; end if;
  raw := coalesce(saved_lead.raw_enquiry_payload,'{}'::jsonb);
  for evidence in select value from jsonb_array_elements(
    jsonb_build_array(raw->'buyerOtpDocument') || case when jsonb_typeof(raw->'buyerOtpDocuments')='array' then raw->'buyerOtpDocuments' else '[]'::jsonb end
  ) loop
    if evidence->>'storageBucket'='documents' and evidence->>'storagePath'=object_path
      and evidence->>'listingId'=listing::text and evidence->>'source'='agent_otp_upload'
      and evidence#>'{metadata,signedByAllPartiesConfirmed}'='true'::jsonb
      and evidence#>'{metadata,arch9TermsIncludedConfirmed}'='true'::jsonb
      and evidence#>'{metadata,transactionFeeConsentIncludedConfirmed}'='true'::jsonb
      and jsonb_typeof(evidence->'fileSize')='number' and (evidence->>'fileSize')::bigint>0
      and jsonb_typeof(evidence#>'{metadata,offerAmount}')='number'
      and (evidence#>>'{metadata,offerAmount}')::numeric>0
      and (evidence#>>'{metadata,offerAmount}')::numeric=(p_payload->>'purchase_price')::numeric
      and (case lower(p_payload->>'finance_type') when 'hybrid' then 'combination' else lower(p_payload->>'finance_type') end)
        = lower(evidence#>>'{metadata,financeType}')
      and exists(select 1 from storage.objects where bucket_id='documents' and name=object_path
        and (metadata->>'size')::bigint=(evidence->>'fileSize')::bigint)
    then return true; end if;
  end loop;
  return false;
end;
$$;

revoke all on function document_security.can_capture_signed_buyer_otp(jsonb) from public,anon,authenticated;

CREATE OR REPLACE FUNCTION public.bridge_create_mvp_transaction(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
  v_buyer_source jsonb := '{}'::jsonb;
  v_seller_source jsonb := '{}'::jsonb;
  v_seller_name text;
  v_seller_email text;
  v_offer_status text;
  v_offer_lead_id uuid;
  v_offer_contact_id uuid;
  v_offer_seller_lead_id uuid;
  v_offer_seller_contact_id uuid;
  v_offer_listing_id uuid;
  v_offer_amount numeric;
  v_offer_deposit numeric;
  v_offer_cash numeric;
  v_offer_bond numeric;
  v_buyer_contact_id uuid := nullif(trim(v_payload->>'buyer_contact_id'), '')::uuid;
  v_seller_contact_id uuid := nullif(trim(v_payload->>'seller_contact_id'), '')::uuid;
  v_listing_seller_lead_id text;
  v_seller_lead_id uuid;
  v_listing_seller_contact_id uuid;
  v_seller_onboarding_id uuid;
  v_lead_domain text;
  v_transaction public.transactions%rowtype;
  v_existing boolean := false;
begin
  if auth.uid() is null or v_organisation_id is null or not public.bridge_is_active_member(v_organisation_id) then
    raise exception 'You do not have access to create a transaction in this organisation.' using errcode = '42501';
  end if;

  v_allow_direct_lead_conversion := v_offer_id is null and v_creation_mode in ('onboarding_capture', 'manual_intake', 'manual_capture', 'signed_otp_capture');

  if v_allow_direct_lead_conversion then
    if v_creation_mode = 'signed_otp_capture' then
      if not document_security.can_capture_signed_buyer_otp(v_payload) then
        raise exception 'Save the signed OTP for this buyer and property before opening the deal.' using errcode = '42501';
      end if;
      v_profile := jsonb_set(v_profile, '{signedOtpCapture}', jsonb_build_object(
        'source', 'signed_buyer_otp', 'leadId', v_lead_id, 'listingId', v_listing_id,
        'storagePath', v_payload->>'signed_otp_storage_path', 'capturedBy', auth.uid(),
        'reviewStatus', 'pending_review', 'legalReviewApproved', false
      ), true);
      v_payload := v_payload || jsonb_build_object(
        'stage', 'OTP Signed', 'current_main_stage', 'OTP', 'onboarding_status', 'signed_otp_received'
      );
    else
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
  end if;

  if v_listing_id is null or v_idempotency_key is null or (v_lead_id is null and v_offer_id is null) then
    raise exception 'MVP transaction creation requires a listing, idempotency key, and an offer or buyer lead.' using errcode = '22023';
  end if;

  if v_offer_id is null and not v_allow_direct_lead_conversion then
    raise exception 'MVP transaction creation requires a buyer lead, listing, accepted offer and idempotency key.' using errcode = '22023';
  end if;

  if not public.bridge_mvp_transaction_scope_ready(v_payload) then
    raise exception 'Transaction facts are incomplete or outside the Arch9 MVP launch scope.' using errcode = '22023';
  end if;

  if v_lead_id is not null then
    select lead_domain into v_lead_domain
    from public.leads
    where lead_id = v_lead_id and organisation_id = v_organisation_id;
    if not found or v_lead_domain <> 'agency' then
      raise exception 'The buyer lead is not an agency lead in this organisation.' using errcode = '22023';
    end if;
  end if;

  select nullif(trim(to_jsonb(listing)->>'seller_lead_id'), ''),
         nullif(trim(to_jsonb(listing)->>'seller_contact_id'), '')::uuid
  into v_listing_seller_lead_id, v_listing_seller_contact_id
  from public.private_listings listing
  where listing.id = v_listing_id and listing.organisation_id = v_organisation_id;
  if not found then
    raise exception 'The listing is not available in this organisation.' using errcode = '22023';
  end if;
  if v_listing_seller_lead_id is not null then
    if v_listing_seller_lead_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      raise exception 'The listing seller lead link is not a real lead identifier.' using errcode = '22023';
    end if;
    perform 1 from public.leads
    where lead_id = v_listing_seller_lead_id::uuid and organisation_id = v_organisation_id;
    if not found then
      raise exception 'The listing seller lead is not in this organisation.' using errcode = '22023';
    end if;
  end if;
  select onboarding.id into v_seller_onboarding_id
  from public.private_listing_seller_onboarding onboarding
  where onboarding.private_listing_id = v_listing_id
  order by onboarding.updated_at desc, onboarding.id
  limit 1;
  if v_seller_onboarding_id is not null then
    select coalesce(onboarding.form_data, '{}'::jsonb) into v_seller_source
    from public.private_listing_seller_onboarding onboarding
    where onboarding.id = v_seller_onboarding_id;
  end if;
  v_seller_name := coalesce(
    nullif(trim(concat_ws(' ', v_seller_source->>'sellerFirstName', v_seller_source->>'sellerSurname')), ''),
    nullif(trim(v_seller_source->>'sellerName'), ''),
    nullif(trim(v_seller_source->>'fullName'), ''),
    nullif(trim(v_payload->>'seller_name'), '')
  );
  v_seller_email := lower(coalesce(
    nullif(trim(v_seller_source->>'sellerEmail'), ''),
    nullif(trim(v_seller_source->>'email'), ''),
    nullif(trim(v_payload->>'seller_email'), '')
  ));

  if v_offer_id is not null then
    select status, buyer_lead_id, buyer_contact_id, seller_lead_id, seller_contact_id, listing_id,
           offer_amount, deposit_amount, cash_component, bond_component
    into v_offer_status, v_offer_lead_id, v_offer_contact_id, v_offer_seller_lead_id, v_offer_seller_contact_id,
         v_offer_listing_id, v_offer_amount, v_offer_deposit, v_offer_cash, v_offer_bond
    from public.offers
    where id = v_offer_id and organisation_id = v_organisation_id;
    if not found or v_offer_lead_id is distinct from v_lead_id or v_offer_listing_id is distinct from v_listing_id then
      raise exception 'The accepted offer does not match the buyer lead and listing.' using errcode = '22023';
    end if;
    if v_offer_lead_id is null and v_offer_contact_id is null then
      raise exception 'The accepted offer has no linked buyer lead or contact.' using errcode = '22023';
    end if;
    if v_offer_seller_lead_id is not null and v_listing_seller_lead_id is not null
      and v_offer_seller_lead_id <> v_listing_seller_lead_id::uuid then
      raise exception 'The accepted offer and listing link different seller leads.' using errcode = '22023';
    end if;
    if v_offer_seller_lead_id is not null then
      perform 1 from public.leads
      where lead_id = v_offer_seller_lead_id and organisation_id = v_organisation_id;
      if not found then
        raise exception 'The offer seller lead is not in this organisation.' using errcode = '22023';
      end if;
    end if;
    if v_offer_seller_contact_id is not null and v_listing_seller_contact_id is not null
      and v_offer_seller_contact_id <> v_listing_seller_contact_id then
      raise exception 'The accepted offer and listing link different seller contacts.' using errcode = '22023';
    end if;
    if v_buyer_contact_id is not null and v_buyer_contact_id is distinct from v_offer_contact_id then
      raise exception 'The buyer contact conflicts with the accepted offer.' using errcode = '22023';
    end if;
    if v_seller_contact_id is not null and v_seller_contact_id is distinct from coalesce(v_offer_seller_contact_id, v_listing_seller_contact_id) then
      raise exception 'The seller contact conflicts with the accepted offer.' using errcode = '22023';
    end if;
    v_buyer_contact_id := v_offer_contact_id;
    v_seller_contact_id := coalesce(v_offer_seller_contact_id, v_listing_seller_contact_id);
    if (v_payload ? 'purchase_price' and nullif(trim(v_payload->>'purchase_price'), '')::numeric is distinct from v_offer_amount)
      or (v_payload ? 'sales_price' and nullif(trim(v_payload->>'sales_price'), '')::numeric is distinct from v_offer_amount)
      or (v_payload ? 'deposit_amount' and nullif(trim(v_payload->>'deposit_amount'), '')::numeric is distinct from coalesce(v_offer_deposit, 0))
      or (v_payload ? 'cash_amount' and nullif(trim(v_payload->>'cash_amount'), '')::numeric is distinct from coalesce(v_offer_cash, 0))
      or (v_payload ? 'bond_amount' and nullif(trim(v_payload->>'bond_amount'), '')::numeric is distinct from coalesce(v_offer_bond, 0)) then
      raise exception 'Transaction financial terms conflict with the accepted offer.' using errcode = '22023';
    end if;
  end if;
  v_seller_lead_id := coalesce(v_listing_seller_lead_id::uuid, v_offer_seller_lead_id);

  if v_buyer_contact_id is not null then
    select to_jsonb(contact) into v_buyer_source from public.contacts contact
    where contact.contact_id = v_buyer_contact_id and contact.organisation_id = v_organisation_id;
    if not found then
      raise exception 'The buyer contact is not in this organisation.' using errcode = '22023';
    end if;
  end if;
  if v_buyer_source = '{}'::jsonb and v_lead_id is not null then
    select to_jsonb(lead) into v_buyer_source from public.leads lead
    where lead.lead_id = v_lead_id and lead.organisation_id = v_organisation_id;
  end if;
  v_buyer_name := coalesce(
    nullif(trim(concat_ws(' ', v_buyer_source->>'first_name', v_buyer_source->>'last_name')), ''),
    nullif(trim(v_buyer_source->>'name'), ''),
    nullif(trim(v_buyer_source->>'full_name'), ''),
    v_buyer_name
  );
  v_buyer_email := lower(coalesce(nullif(trim(v_buyer_source->>'email'), ''), v_buyer_email));
  v_buyer_phone := coalesce(nullif(trim(v_buyer_source->>'phone'), ''), v_buyer_phone);
  if v_seller_contact_id is not null then
    perform 1 from public.contacts
    where contact_id = v_seller_contact_id and organisation_id = v_organisation_id;
    if not found then
      raise exception 'The seller contact is not in this organisation.' using errcode = '22023';
    end if;
  end if;
  if v_buyer_id is not null then
    perform 1 from public.buyers
    where id = v_buyer_id and organisation_id = v_organisation_id;
    if not found then
      raise exception 'The buyer record is not in this organisation.' using errcode = '22023';
    end if;
    if not exists (
      select 1 from public.transactions previous
      where previous.organisation_id = v_organisation_id
        and previous.buyer_id = v_buyer_id
        and ((v_buyer_contact_id is not null and previous.buyer_contact_id = v_buyer_contact_id)
          or (v_lead_id is not null and previous.originating_buyer_lead_id = v_lead_id))
    ) then
      raise exception 'The buyer record has no verified link to this buyer source.' using errcode = '22023';
    end if;
  end if;

  v_profile := jsonb_set(v_profile, '{sourceContinuity}', jsonb_build_object(
    'version', 'arch9_transaction_source_handoff_v1',
    'acceptedOfferId', v_offer_id,
    'listingId', v_listing_id,
    'buyerLeadId', v_lead_id,
    'buyerContactId', v_buyer_contact_id,
    'sellerLeadId', v_seller_lead_id,
    'sellerOnboardingId', v_seller_onboarding_id,
    'sellerContactId', v_seller_contact_id
  ), true);

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

  if v_existing and (
    v_transaction.listing_id is distinct from v_listing_id
    or v_transaction.accepted_offer_id is distinct from v_offer_id
    or v_transaction.originating_buyer_lead_id is distinct from v_lead_id
    or (v_transaction.originating_seller_lead_id is not null and v_transaction.originating_seller_lead_id is distinct from v_seller_lead_id)
    or (v_offer_id is not null and v_transaction.buyer_contact_id is distinct from v_buyer_contact_id)
    or (v_offer_id is not null and v_transaction.seller_contact_id is distinct from v_seller_contact_id)
  ) then
    raise exception 'The existing transaction conflicts with the accepted offer or listing source.' using errcode = '22023';
  end if;

  if not v_existing and v_offer_id is not null and v_offer_status <> 'accepted' then
    raise exception 'Only an accepted offer can create an MVP transaction.' using errcode = '22023';
  end if;
  if not v_existing and v_offer_id is not null
    and not public.bridge_offer_wet_ink_execution_ready(v_offer_id, v_organisation_id, v_listing_id) then
    raise exception 'A reviewed fully executed wet-ink OTP is required before conversion.' using errcode = '22023';
  end if;

  -- Reuse a buyer only through a durable source identity, never email or name.
  if not v_existing and v_buyer_id is null and (v_buyer_contact_id is not null or v_lead_id is not null) then
    select previous.buyer_id into v_buyer_id
    from public.transactions previous
    join public.buyers existing_buyer
      on existing_buyer.id = previous.buyer_id
      and existing_buyer.organisation_id = v_organisation_id
    where previous.organisation_id = v_organisation_id
      and previous.buyer_id is not null
      and ((v_buyer_contact_id is not null and previous.buyer_contact_id = v_buyer_contact_id)
        or (v_lead_id is not null and previous.originating_buyer_lead_id = v_lead_id))
    order by previous.created_at desc
    limit 1;
  end if;
  if not v_existing and v_buyer_id is null then
    insert into public.buyers (organisation_id, name, phone, email)
    values (v_organisation_id, v_buyer_name, v_buyer_phone, v_buyer_email)
    returning id into v_buyer_id;
  end if;

  if not v_existing then
    insert into public.transactions (
      organisation_id, buyer_id, buyer_name, seller_name, seller_email,
      transaction_reference, transaction_type,
      property_type, property_tenure, property_address_line_1, suburb, city,
      province, property_description, sales_price, purchase_price, finance_type,
      cash_amount, bond_amount, deposit_amount, purchaser_type, seller_type,
      seller_has_existing_bond, existing_bond, cancellation_required, vat_treatment,
      routing_profile_version, routing_profile_json, stage, current_main_stage,
      next_action, comment, onboarding_status, assigned_agent, assigned_agent_email,
      assigned_agent_id, owner_user_id, is_active, lifecycle_state, listing_id,
      originating_lead_id, originating_buyer_lead_id, originating_seller_lead_id, accepted_offer_id,
      buyer_contact_id, seller_contact_id, otp_packet_id, mandate_packet_id,
      commission_snapshot_id, gross_commission_percentage, gross_commission_amount,
      agent_split_percentage_snapshot, agency_split_percentage_snapshot,
      agent_commission_amount, agency_commission_amount, creation_idempotency_key, creation_mode,
      created_at, updated_at
    ) values (
      v_organisation_id, v_buyer_id, v_buyer_name, v_seller_name, v_seller_email,
      nullif(trim(v_payload->>'transaction_reference'), ''),
      nullif(trim(v_payload->>'transaction_type'), ''),
      nullif(trim(v_payload->>'property_type'), ''),
      nullif(trim(v_payload->>'property_tenure'), ''),
      nullif(trim(v_payload->>'property_address_line_1'), ''),
      nullif(trim(v_payload->>'suburb'), ''), nullif(trim(v_payload->>'city'), ''),
      nullif(trim(v_payload->>'province'), ''), nullif(trim(v_payload->>'property_description'), ''),
      case when v_offer_id is not null then v_offer_amount else nullif(trim(v_payload->>'sales_price'), '')::numeric end,
      case when v_offer_id is not null then v_offer_amount else nullif(trim(v_payload->>'purchase_price'), '')::numeric end,
      nullif(trim(v_payload->>'finance_type'), ''),
      case when v_offer_id is not null then coalesce(v_offer_cash, 0) else nullif(trim(v_payload->>'cash_amount'), '')::numeric end,
      case when v_offer_id is not null then coalesce(v_offer_bond, 0) else nullif(trim(v_payload->>'bond_amount'), '')::numeric end,
      case when v_offer_id is not null then coalesce(v_offer_deposit, 0) else nullif(trim(v_payload->>'deposit_amount'), '')::numeric end,
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
      v_listing_id, v_lead_id, v_lead_id, v_seller_lead_id, v_offer_id,
      v_buyer_contact_id, v_seller_contact_id,
      nullif(trim(v_payload->>'otp_packet_id'), '')::uuid,
      nullif(trim(v_payload->>'mandate_packet_id'), '')::uuid,
      nullif(trim(v_payload->>'commission_snapshot_id'), '')::uuid,
      nullif(trim(v_payload->>'gross_commission_percentage'), '')::numeric,
      nullif(trim(v_payload->>'gross_commission_amount'), '')::numeric,
      nullif(trim(v_payload->>'agent_split_percentage_snapshot'), '')::numeric,
      nullif(trim(v_payload->>'agency_split_percentage_snapshot'), '')::numeric,
      nullif(trim(v_payload->>'agent_commission_amount'), '')::numeric,
      nullif(trim(v_payload->>'agency_commission_amount'), '')::numeric,
      v_idempotency_key, v_creation_mode, now(), now()
    )
    on conflict (organisation_id, creation_idempotency_key)
      where creation_idempotency_key is not null
      do update set updated_at = excluded.updated_at
    returning * into v_transaction;
  end if;

  if v_existing and v_seller_lead_id is not null and v_transaction.originating_seller_lead_id is null then
    update public.transactions
    set originating_seller_lead_id = v_seller_lead_id
    where id = v_transaction.id
    returning * into v_transaction;
  end if;

  if v_lead_id is not null then
    update public.leads
    set converted_transaction_id = v_transaction.id,
      converted_at = coalesce(converted_at, now()),
      current_stage = case when v_creation_mode = 'signed_otp_capture' then current_stage else 'Onboarding' end,
      stage = case when v_creation_mode = 'signed_otp_capture' then stage else 'Onboarding' end,
      status = case when v_creation_mode = 'signed_otp_capture' then status else 'Onboarding' end,
      updated_at = now()
    where organisation_id = v_organisation_id and lead_id = v_lead_id;
  end if;

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
$function$;

-- Retain the existing callable surface and its authenticated scope checks.
revoke all on function public.bridge_create_mvp_transaction(jsonb) from public,anon;

grant execute on function public.bridge_create_mvp_transaction(jsonb) to authenticated,service_role;

-- Link only within the authenticated document audience. A replacement is new
-- evidence and must not inherit approval from its previous version.
CREATE OR REPLACE FUNCTION public.bridge_link_document_to_canonical_requirement(p_document_id uuid, p_requirement_instance_id uuid, p_actor_role text DEFAULT NULL::text, p_actor_user_id uuid DEFAULT NULL::uuid, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_auth_user_id uuid := auth.uid();
  v_document public.documents%rowtype;
  v_requirement public.document_requirement_instances%rowtype;
  v_definition public.document_definitions%rowtype;
  v_actor_role text := lower(trim(coalesce(p_actor_role, '')));
  v_profile_role text;
  v_is_internal boolean := false;
  v_previous_status text;
  v_next_status text;
  v_legacy_document_keys text[];
begin
  if v_auth_user_id is null then
    raise exception 'Authentication is required to link a document to a canonical requirement.'
      using errcode = '28000';
  end if;

  if p_actor_user_id is not null and p_actor_user_id <> v_auth_user_id then
    raise exception 'Actor user does not match the authenticated user.'
      using errcode = '42501';
  end if;

  select *
    into v_document
  from public.documents
  where id = p_document_id;

  if not found then
    raise exception 'Document % was not found.', p_document_id
      using errcode = 'P0002';
  end if;

  select *
    into v_requirement
  from public.document_requirement_instances
  where id = p_requirement_instance_id for update;

  if not found then
    raise exception 'Canonical requirement % was not found.', p_requirement_instance_id
      using errcode = 'P0002';
  end if;

  if not coalesce(document_security.can_upload(v_document.transaction_id),false)
    or not coalesce(document_security.can_read(v_document),false) then
    raise exception 'This document is not available for upload in your transaction.' using errcode='42501';
  end if;
  if not exists(select 1 from storage.objects where bucket_id=coalesce(v_document.file_bucket,'documents')
    and name=v_document.file_path and (metadata->>'size')::bigint>0) then
    raise exception 'The saved file is unavailable. Reopen the file or upload a replacement.' using errcode='P0002';
  end if;

  if coalesce(v_requirement.applicability_override,'')='removed' or v_requirement.status in ('waived','not_applicable') then
    raise exception 'Restore this document requirement before uploading a replacement.' using errcode='22023';
  end if;

  if v_document.transaction_id is distinct from v_requirement.transaction_id then
    raise exception 'Document transaction does not match canonical requirement transaction.'
      using errcode = '42501';
  end if;

  if v_document.canonical_requirement_instance_id is not null
     and v_document.canonical_requirement_instance_id <> p_requirement_instance_id then
    raise exception 'Document is already linked to a different canonical requirement.'
      using errcode = '23505';
  end if;

  select role
    into v_profile_role
  from public.profiles
  where id = v_auth_user_id;

  v_profile_role := lower(trim(coalesce(v_profile_role, '')));
  if v_actor_role = 'attorney' then
    v_actor_role := 'transferring_attorney';
  elsif v_actor_role = 'client' then
    v_actor_role := 'buyer';
  end if;

  v_is_internal :=
    coalesce(v_profile_role, '') in ('agent', 'agency_admin', 'developer', 'attorney', 'transferring_attorney', 'bond_attorney', 'cancellation_attorney', 'bond_originator', 'admin', 'internal_admin')
    or exists (
      select 1
      from public.attorney_firm_members afm
      where afm.user_id = v_auth_user_id
        and coalesce(afm.status, '') = 'active'
    )
    or exists (
      select 1
      from public.organisation_users ou
      where ou.user_id = v_auth_user_id
        and coalesce(ou.status, '') = 'active'
        and lower(coalesce(ou.app_role, ou.role, '')) in ('agent', 'agency_admin', 'developer', 'attorney', 'admin', 'internal_admin')
    );

  if not v_is_internal
     and not (coalesce(v_requirement.uploadable_by_roles, '{}'::text[]) @> array[v_actor_role]::text[]) then
    raise exception 'Authenticated user cannot upload against this canonical requirement.'
      using errcode = '42501';
  end if;

  select *
    into v_definition
  from public.document_definitions
  where key = v_requirement.document_definition_key;

  v_previous_status := coalesce(v_requirement.status, 'pending');
  v_next_status := case when coalesce(v_definition.review_required, false) then 'under_review' else 'uploaded' end;
  v_legacy_document_keys := array_remove(array[
    v_requirement.document_definition_key,
    case v_requirement.document_definition_key
      when 'signed_otp' then 'otp'
      when 'generated_otp' then 'generated_otp'
      when 'grant_letter' then 'grant_signed'
      when 'seller_id_document' then 'id_document'
      when 'buyer_id_document' then 'id_document'
      when 'seller_proof_of_address' then 'proof_of_address'
      when 'buyer_proof_of_address' then 'proof_of_address'
      when 'signed_transfer_documents' then 'signed_transfer_pack'
      when 'settlement_figure' then 'settlement_figures'
      else null
    end
  ], null);

  if v_previous_status in ('waived', 'not_applicable') or (v_previous_status in ('approved', 'completed') and v_requirement.satisfied_by_document_id = p_document_id) then
    v_next_status := v_previous_status;
  end if;

  update public.documents
  set canonical_requirement_instance_id = p_requirement_instance_id
  where id = p_document_id;

  update public.document_requirement_instances
  set status = v_next_status,
      satisfied_by_document_id = p_document_id,
      rejection_reason = null,
      source_system = 'internal_browser_upload',
      updated_at = now()
  where id = p_requirement_instance_id;

  update public.transaction_required_documents
  set is_uploaded = true,
      uploaded_document_id = p_document_id,
      canonical_requirement_instance_id = coalesce(canonical_requirement_instance_id, p_requirement_instance_id),
      status = case
        when v_next_status = 'under_review' then 'under_review'
        when v_next_status in ('approved', 'completed') then 'approved'
        else 'uploaded'
      end,
      uploaded_at = coalesce(uploaded_at, now()),
      updated_at = now()
  where transaction_id = v_requirement.transaction_id
    and (
      canonical_requirement_instance_id = p_requirement_instance_id
    );

  insert into public.document_requirement_events (
    requirement_instance_id,
    event_type,
    actor_role,
    actor_user_id,
    message,
    metadata_json
  )
  values (
    p_requirement_instance_id,
    'uploaded',
    nullif(v_actor_role, ''),
    v_auth_user_id,
    'Browser upload linked to canonical requirement.',
    coalesce(p_metadata, '{}'::jsonb)
      || jsonb_build_object(
        'document_id', p_document_id,
        'previous_status', v_previous_status,
        'new_status', v_next_status,
        'source', 'internal_browser_upload'
      )
  );

  return jsonb_build_object(
    'ok', true,
    'documentId', p_document_id,
    'requirementInstanceId', p_requirement_instance_id,
    'previousStatus', v_previous_status,
    'newStatus', v_next_status
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.bridge_link_document_to_canonical_requirement_by_key(p_document_id uuid, p_transaction_id uuid, p_document_key text, p_actor_role text DEFAULT NULL::text, p_actor_user_id uuid DEFAULT NULL::uuid, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_auth_user_id uuid := auth.uid();
  v_document public.documents%rowtype;
  v_normalized_key text;
  v_canonical_key text;
  v_requirement_id uuid;
  v_match_count integer := 0;
begin
  if v_auth_user_id is null then
    raise exception 'Authentication is required to link a document to a canonical requirement.'
      using errcode = '28000';
  end if;

  if p_actor_user_id is not null and p_actor_user_id <> v_auth_user_id then
    raise exception 'Actor user does not match the authenticated user.'
      using errcode = '42501';
  end if;

  select *
    into v_document
  from public.documents
  where id = p_document_id;

  if not found then
    raise exception 'Document % was not found.', p_document_id
      using errcode = 'P0002';
  end if;

  if not coalesce(document_security.can_upload(v_document.transaction_id),false)
    or not coalesce(document_security.can_read(v_document),false) then
    raise exception 'This document is not available for upload in your transaction.' using errcode='42501';
  end if;
  if not exists(select 1 from storage.objects where bucket_id=coalesce(v_document.file_bucket,'documents')
    and name=v_document.file_path and (metadata->>'size')::bigint>0) then
    raise exception 'The saved file is unavailable. Reopen the file or upload a replacement.' using errcode='P0002';
  end if;

  if v_document.transaction_id is distinct from p_transaction_id then
    raise exception 'Document transaction does not match canonical upload transaction.'
      using errcode = '42501';
  end if;

  v_normalized_key := lower(trim(regexp_replace(coalesce(p_document_key, ''), '[^a-zA-Z0-9]+', '_', 'g')));
  v_normalized_key := trim(both '_' from v_normalized_key);

  v_canonical_key := case v_normalized_key
    when 'otp' then 'signed_otp'
    when 'otp_signed' then 'signed_otp'
    when 'mandate_signature' then 'signed_mandate'
    when 'seller_id' then 'seller_id_document'
    when 'buyer_id' then 'buyer_id_document'
    when 'grant_signed' then 'grant_letter'
    when 'settlement_figures' then 'settlement_figure'
    when 'signed_transfer_pack' then 'signed_transfer_documents'
    when 'transfer_document_pack' then 'signed_transfer_documents'
    when 'instruction_otp_documents' then 'signed_otp'
    when 'signing_documents' then 'signed_transfer_documents'
    when 'drafting_documents' then 'transfer_documents'
    when 'buyer_fica_compliance' then 'buyer_id_document'
    when 'seller_fica_compliance' then 'seller_id_document'
    when 'clearance_documents' then 'rates_clearance_certificate'
    when 'lodgement_documents' then 'lodgement_confirmation'
    when 'registration_close_out_documents' then 'registration_confirmation'
    else v_normalized_key
  end;

  if v_canonical_key = '' then
    return jsonb_build_object('ok', false, 'reason', 'missing_document_key');
  end if;

  if v_document.canonical_requirement_instance_id is not null then
    if not exists(select 1 from public.document_requirement_instances where id=v_document.canonical_requirement_instance_id
      and transaction_id=p_transaction_id and document_definition_key=v_canonical_key
      and satisfied_by_document_id=p_document_id
      and coalesce(applicability_override,'')<>'removed' and status not in ('waived','not_applicable')) then
      return jsonb_build_object('ok',false,'reason','document_not_current_evidence');
    end if;
    return jsonb_build_object(
      'ok',true,'documentId',p_document_id,'requirementInstanceId',v_document.canonical_requirement_instance_id,
      'newStatus',(select status from public.document_requirement_instances where id=v_document.canonical_requirement_instance_id),
      'matchReason','already_linked'
    );
  end if;

  select count(*), min(id::text)::uuid
    into v_match_count, v_requirement_id
  from public.document_requirement_instances
  where transaction_id = p_transaction_id
    and document_definition_key = v_canonical_key
    and coalesce(status, '') not in ('not_applicable','waived')
    and coalesce(applicability_override,'') <> 'removed';

  if v_match_count = 0 then
    return jsonb_build_object(
      'ok', false,
      'reason', 'no_matching_canonical_requirement',
      'documentKey', v_normalized_key,
      'canonicalKey', v_canonical_key
    );
  end if;

  if v_match_count > 1 then
    return jsonb_build_object(
      'ok', false,
      'reason', 'ambiguous_canonical_requirement',
      'documentKey', v_normalized_key,
      'canonicalKey', v_canonical_key,
      'matchCount', v_match_count
    );
  end if;

  return public.bridge_link_document_to_canonical_requirement(
    p_document_id,
    v_requirement_id,
    p_actor_role,
    p_actor_user_id,
    coalesce(p_metadata, '{}'::jsonb)
      || jsonb_build_object(
        'match_reason', 'document_key_rpc',
        'document_key', v_normalized_key,
        'canonical_key', v_canonical_key
      )
  );
end;
$function$;

revoke all on function public.bridge_link_document_to_canonical_requirement(uuid,uuid,text,uuid,jsonb) from public,anon;

revoke all on function public.bridge_link_document_to_canonical_requirement_by_key(uuid,uuid,text,text,uuid,jsonb) from public,anon;

grant execute on function public.bridge_link_document_to_canonical_requirement(uuid,uuid,text,uuid,jsonb) to authenticated,service_role;

grant execute on function public.bridge_link_document_to_canonical_requirement_by_key(uuid,uuid,text,text,uuid,jsonb) to authenticated,service_role;

commit;
