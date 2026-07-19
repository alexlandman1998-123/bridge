-- Phase 1: seller acceptance is an MVP transaction entry point, not a second
-- transaction-creation implementation. Keep this forward-only: earlier seller
-- portal migrations may already be present in a linked Supabase ledger.

create or replace function public.bridge_submit_seller_offer_decision(
  p_token text,
  p_decision text,
  p_notes text default null,
  p_counter_terms jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text := nullif(trim(coalesce(p_token, '')), '');
  v_decision text := lower(nullif(trim(coalesce(p_decision, '')), ''));
  v_notes text := nullif(trim(coalesce(p_notes, '')), '');
  v_counter_terms jsonb := case when jsonb_typeof(p_counter_terms) = 'object' then p_counter_terms else '{}'::jsonb end;
  v_session public.offer_seller_review_sessions%rowtype;
  v_offer public.offers%rowtype;
  v_listing jsonb := '{}'::jsonb;
  v_buyer jsonb := '{}'::jsonb;
  v_seller jsonb := '{}'::jsonb;
  v_actor_id uuid;
  v_transaction_id uuid;
  v_atomic jsonb;
  v_transaction_type text;
  v_finance_type text;
  v_property_tenure text;
  v_buyer_entity_type text;
  v_seller_entity_type text;
  v_buyer_name text;
  v_buyer_email text;
  v_buyer_phone text;
  v_property_title text;
  v_property_address text;
  v_suburb text;
  v_city text;
  v_province text;
  v_participant_bootstrap jsonb;
  v_document_bootstrap jsonb;
  v_workflow_bootstrap jsonb;
begin
  if v_token is null then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if v_decision not in ('accepted', 'rejected', 'countered') then return jsonb_build_object('ok', false, 'reason', 'invalid_decision'); end if;

  select * into v_session
  from public.offer_seller_review_sessions
  where token = v_token
  for update;

  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if v_session.status in ('accepted', 'rejected', 'countered') then return jsonb_build_object('ok', false, 'reason', 'already_decided', 'status', v_session.status); end if;
  if v_session.status = 'revoked' then return jsonb_build_object('ok', false, 'reason', 'revoked'); end if;
  if v_session.expires_at is not null and v_session.expires_at < now() then
    update public.offer_seller_review_sessions set status = 'expired' where id = v_session.id;
    return jsonb_build_object('ok', false, 'reason', 'expired');
  end if;

  select * into v_offer from public.offers where id = v_session.offer_id limit 1;
  if not found then return jsonb_build_object('ok', false, 'reason', 'offer_not_found'); end if;

  if v_decision <> 'accepted' then
    update public.offer_seller_review_sessions
       set status = v_decision,
           decision_notes = v_notes,
           viewed_at = coalesce(viewed_at, now()),
           rejected_at = case when v_decision = 'rejected' then now() else rejected_at end,
           countered_at = case when v_decision = 'countered' then now() else countered_at end,
           metadata_json = coalesce(metadata_json, '{}'::jsonb) || jsonb_build_object('sellerDecision', v_decision, 'sellerDecisionAt', now(), 'counterTerms', v_counter_terms)
     where id = v_session.id;
    update public.offers
       set status = v_decision,
           rejected_at = case when v_decision = 'rejected' then now() else rejected_at end,
           countered_at = case when v_decision = 'countered' then now() else countered_at end,
           conditions_json = coalesce(conditions_json, '{}'::jsonb) || jsonb_build_object('sellerDecision', v_decision, 'sellerDecisionNotes', v_notes, 'sellerCounterTerms', v_counter_terms)
     where id = v_offer.id;
    if v_offer.buyer_lead_id is not null then
      update public.leads
         set current_stage = case when v_decision = 'rejected' then 'Lost' else 'Negotiating' end,
             stage = case when v_decision = 'rejected' then 'Lost' else 'Negotiating' end,
             status = case when v_decision = 'rejected' then 'Lost' else 'Negotiating' end,
             updated_at = now()
       where organisation_id = v_offer.organisation_id and lead_id = v_offer.buyer_lead_id;
    end if;
    return jsonb_build_object('ok', true, 'reason', '', 'decision', v_decision, 'transactionId', null);
  end if;

  select coalesce(to_jsonb(private_listings), '{}'::jsonb) into v_listing
  from public.private_listings where id = coalesce(v_session.listing_id, v_offer.listing_id) limit 1;
  if v_offer.buyer_contact_id is not null then
    select coalesce(to_jsonb(contacts), '{}'::jsonb) into v_buyer from public.contacts where contact_id = v_offer.buyer_contact_id limit 1;
  end if;
  if coalesce(v_session.seller_contact_id, v_offer.seller_contact_id) is not null then
    select coalesce(to_jsonb(contacts), '{}'::jsonb) into v_seller from public.contacts where contact_id = coalesce(v_session.seller_contact_id, v_offer.seller_contact_id) limit 1;
  end if;

  v_actor_id := coalesce(v_session.agent_id, v_offer.agent_id);
  if v_actor_id is null then
    raise exception 'An assigned agent is required before an MVP seller acceptance can create a transaction.' using errcode = '22023';
  end if;

  v_transaction_type := lower(coalesce(nullif(v_offer.conditions_json->>'transactionType', ''), nullif(v_listing->>'transaction_type', ''), 'private_sale'));
  if v_transaction_type in ('private', 'private_property', 'sale') then v_transaction_type := 'private_sale'; end if;
  if v_transaction_type in ('development', 'developer_sale', 'off_plan') then v_transaction_type := 'development_sale'; end if;
  v_finance_type := lower(coalesce(nullif(v_offer.finance_type, ''), nullif(v_offer.conditions_json->>'financeType', ''), ''));
  if v_finance_type in ('combination', 'cash_and_bond', 'cash_bond') then v_finance_type := 'hybrid'; end if;
  v_property_tenure := lower(coalesce(nullif(v_offer.conditions_json->>'propertyTenure', ''), nullif(v_listing->>'property_tenure', ''), nullif(v_listing->'property_details'->>'propertyTenure', ''), ''));
  if v_property_tenure like '%sectional%' then v_property_tenure := 'sectional_title'; end if;
  if v_property_tenure like '%estate%' or v_property_tenure like '%hoa%' then v_property_tenure := 'estate_hoa'; end if;
  if v_property_tenure in ('full_title', 'fulltitle') then v_property_tenure := 'freehold'; end if;
  v_buyer_entity_type := lower(coalesce(nullif(v_offer.conditions_json->>'buyerEntityType', ''), nullif(v_offer.conditions_json->>'buyerType', ''), nullif(v_offer.conditions_json->>'purchaserType', ''), 'individual'));
  if v_buyer_entity_type in ('pty', 'pty_ltd', 'business', 'corporate') then v_buyer_entity_type := 'company'; end if;
  v_seller_entity_type := lower(coalesce(nullif(v_offer.conditions_json->>'sellerEntityType', ''), nullif(v_seller->>'entity_type', ''), nullif(v_listing->>'seller_type', ''), 'individual'));
  if v_seller_entity_type in ('pty', 'pty_ltd', 'business', 'corporate') then v_seller_entity_type := 'company'; end if;
  if v_seller_entity_type in ('developer', 'development') then v_seller_entity_type := 'developer'; end if;

  v_buyer_name := coalesce(nullif(trim(v_offer.conditions_json->>'buyerName'), ''), nullif(trim(v_buyer->>'full_name'), ''), nullif(trim(v_buyer->>'name'), ''), 'Buyer pending');
  v_buyer_email := lower(nullif(trim(coalesce(v_offer.conditions_json->>'buyerEmail', v_buyer->>'email', '')), ''));
  v_buyer_phone := nullif(trim(coalesce(v_offer.conditions_json->>'buyerPhone', v_buyer->>'phone', '')), '');
  v_property_title := coalesce(nullif(trim(v_listing->>'listing_title'), ''), nullif(trim(v_listing->>'title'), ''), 'Listing');
  v_property_address := coalesce(nullif(trim(v_listing->>'property_address'), ''), nullif(trim(v_listing->>'address'), ''), nullif(trim(v_listing->'property_details'->>'address'), ''), v_property_title);
  v_suburb := nullif(trim(coalesce(v_listing->>'suburb', v_listing->'property_details'->>'suburb', '')), '');
  v_city := nullif(trim(coalesce(v_listing->>'city', v_listing->'property_details'->>'city', '')), '');
  v_province := nullif(trim(coalesce(v_listing->>'province', v_listing->'property_details'->>'province', '')), '');

  v_participant_bootstrap := jsonb_build_object(
    'version', 'arch9_mvp_seller_acceptance_v1',
    'requirements', jsonb_build_array(
      jsonb_build_object('roleKey', 'buyer', 'roleType', 'buyer', 'transactionRole', 'buyer', 'requiredBy', 'onboarding', 'requiredAtCreation', true, 'label', 'Buyer'),
      jsonb_build_object('roleKey', 'seller', 'roleType', 'seller', 'transactionRole', 'seller', 'requiredBy', 'onboarding', 'requiredAtCreation', true, 'label', 'Seller/developer representative'),
      jsonb_build_object('roleKey', 'agent', 'roleType', 'agent', 'transactionRole', 'agent', 'requiredBy', 'creation', 'requiredAtCreation', true, 'label', 'Assigned agent'),
      jsonb_build_object('roleKey', 'bond_originator', 'roleType', 'bond_originator', 'transactionRole', 'bond_originator', 'requiredBy', 'finance', 'requiredAtCreation', false, 'label', 'Bond originator'),
      jsonb_build_object('roleKey', 'transfer_attorney', 'roleType', 'attorney', 'legalRole', 'transfer', 'transactionRole', 'transfer_attorney', 'requiredBy', 'transfer', 'requiredAtCreation', false, 'label', 'Transfer attorney')
    ),
    'participants', jsonb_build_array(
      jsonb_build_object('roleKey', 'buyer', 'roleType', 'buyer', 'transactionRole', 'buyer', 'name', v_buyer_name, 'email', v_buyer_email),
      jsonb_build_object('roleKey', 'seller', 'roleType', case when v_seller_entity_type = 'developer' then 'developer' else 'seller' end, 'transactionRole', case when v_seller_entity_type = 'developer' then 'developer_contact' else 'seller' end, 'name', coalesce(v_seller->>'full_name', v_seller->>'name', 'Seller pending'), 'email', lower(nullif(trim(v_seller->>'email'), ''))),
      jsonb_build_object('roleKey', 'agent', 'roleType', 'agent', 'transactionRole', 'agent', 'userId', v_actor_id)
    )
  );
  v_document_bootstrap := jsonb_build_object(
    'version', 'arch9_mvp_seller_acceptance_v1',
    'requirements', jsonb_build_array(
      jsonb_build_object('key', 'buyer_identity', 'label', 'Buyer identity and onboarding', 'required', true, 'groupKey', 'onboarding', 'requiredFromRole', 'buyer'),
      jsonb_build_object('key', 'seller_identity', 'label', 'Seller/developer onboarding', 'required', true, 'groupKey', 'onboarding', 'requiredFromRole', 'seller'),
      jsonb_build_object('key', 'proof_of_funds', 'label', 'Proof of funds', 'required', v_finance_type in ('cash', 'hybrid'), 'groupKey', 'finance', 'requiredFromRole', 'buyer'),
      jsonb_build_object('key', 'bond_preapproval', 'label', 'Bond pre-approval or application evidence', 'required', v_finance_type in ('bond', 'hybrid'), 'groupKey', 'finance', 'requiredFromRole', 'bond_originator')
    )
  );
  v_workflow_bootstrap := jsonb_build_object(
    'version', 'arch9_mvp_seller_acceptance_v1',
    'lanes', jsonb_build_array(
      jsonb_build_object('laneType', 'onboarding', 'currentStage', 'setup', 'status', 'active', 'blocked', false, 'ownerRole', 'agent'),
      jsonb_build_object('laneType', 'finance', 'currentStage', 'not_started', 'status', 'not_started', 'blocked', false, 'ownerRole', 'bond_originator'),
      jsonb_build_object('laneType', 'transfer', 'currentStage', 'not_started', 'status', 'not_started', 'blocked', false, 'ownerRole', 'transfer_attorney')
    )
  );

  -- bridge_create_mvp_transaction requires an active organisation member. The
  -- seller token is first validated above, then this local setting represents
  -- the assigned internal agent for this one database transaction only.
  perform set_config('request.jwt.claim.sub', v_actor_id::text, true);
  v_atomic := public.bridge_create_mvp_transaction(jsonb_build_object(
    'organisation_id', v_offer.organisation_id,
    'originating_lead_id', v_offer.buyer_lead_id,
    'listing_id', coalesce(v_session.listing_id, v_offer.listing_id),
    'accepted_offer_id', v_offer.id,
    'creation_idempotency_key', 'mvp_tx_' || replace(v_offer.organisation_id::text, '-', '') || '_offer_' || replace(v_offer.id::text, '-', ''),
    'routing_profile_json', jsonb_build_object('transactionType', v_transaction_type, 'financeType', v_finance_type, 'propertyTenure', v_property_tenure, 'buyerEntityType', v_buyer_entity_type, 'sellerEntityType', v_seller_entity_type, 'launchScope', jsonb_build_object('supported', true)),
    'routing_profile_version', 'transaction_routing_profile_v1',
    'transaction_reference', 'BR-' || upper(right(replace(v_offer.id::text, '-', ''), 8)),
    'transaction_type', v_transaction_type,
    'property_tenure', v_property_tenure,
    'property_address_line_1', v_property_address,
    'suburb', v_suburb,
    'city', v_city,
    'province', v_province,
    'property_description', v_property_title,
    'sales_price', v_offer.offer_amount,
    'purchase_price', v_offer.offer_amount,
    'finance_type', v_finance_type,
    'cash_amount', v_offer.cash_component,
    'bond_amount', v_offer.bond_component,
    'deposit_amount', v_offer.deposit_amount,
    'purchaser_type', v_buyer_entity_type,
    'seller_type', v_seller_entity_type,
    'stage', 'Buyer Onboarding Pending',
    'current_main_stage', 'OTP',
    'next_action', 'Complete onboarding and prepare OTP',
    'onboarding_status', 'awaiting_client_onboarding',
    'assigned_agent_id', v_actor_id,
    'owner_user_id', v_actor_id,
    'buyer_contact_id', v_offer.buyer_contact_id,
    'seller_contact_id', coalesce(v_session.seller_contact_id, v_offer.seller_contact_id),
    'buyer_name', v_buyer_name,
    'buyer_email', v_buyer_email,
    'buyer_phone', v_buyer_phone,
    'participant_bootstrap', v_participant_bootstrap,
    'document_bootstrap', v_document_bootstrap,
    'workflow_bootstrap', v_workflow_bootstrap
  ));
  v_transaction_id := nullif(v_atomic->'transaction'->>'id', '')::uuid;
  if v_transaction_id is null then raise exception 'Canonical MVP transaction creation did not return a transaction id.'; end if;

  update public.offer_seller_review_sessions
     set status = 'accepted', decision_notes = v_notes, viewed_at = coalesce(viewed_at, now()), accepted_at = coalesce(accepted_at, now()),
         metadata_json = coalesce(metadata_json, '{}'::jsonb) || jsonb_build_object('sellerDecision', 'accepted', 'sellerDecisionAt', now(), 'transactionId', v_transaction_id, 'creationPath', 'bridge_create_mvp_transaction')
   where id = v_session.id;
  update public.offers
     set status = 'converted_to_transaction', accepted_at = coalesce(accepted_at, now()), converted_to_transaction_at = coalesce(converted_to_transaction_at, now()), transaction_id = v_transaction_id,
         conditions_json = coalesce(conditions_json, '{}'::jsonb) || jsonb_build_object('sellerDecision', 'accepted', 'sellerDecisionNotes', v_notes, 'transactionId', v_transaction_id, 'creationPath', 'bridge_create_mvp_transaction')
   where id = v_offer.id;
  update public.leads
     set current_stage = 'Onboarding', stage = 'Onboarding', status = 'Onboarding', converted_transaction_id = v_transaction_id, converted_at = coalesce(converted_at, now()), updated_at = now()
   where organisation_id = v_offer.organisation_id and lead_id = v_offer.buyer_lead_id;

  return jsonb_build_object('ok', true, 'reason', '', 'decision', 'accepted', 'transactionId', v_transaction_id, 'creationPath', 'bridge_create_mvp_transaction', 'existing', coalesce((v_atomic->>'existing')::boolean, false));
end;
$$;

grant execute on function public.bridge_submit_seller_offer_decision(text, text, text, jsonb) to anon, authenticated;
