create or replace function public.bridge_submit_seller_offer_decision(
  p_token text,
  p_decision text,
  p_notes text default null
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
  v_session public.offer_seller_review_sessions%rowtype;
  v_offer public.offers%rowtype;
  v_next_offer_status text;
  v_stage text;
  v_activity_type text;
  v_activity_note text;
  v_listing jsonb := '{}'::jsonb;
  v_buyer jsonb := '{}'::jsonb;
  v_seller jsonb := '{}'::jsonb;
  v_agent jsonb := '{}'::jsonb;
  v_transaction_id uuid := null;
  v_new_transaction_id uuid := null;
  v_buyer_id uuid := null;
  v_buyer_name text := '';
  v_buyer_email text := '';
  v_buyer_phone text := '';
  v_agent_name text := '';
  v_agent_email text := '';
  v_property_title text := '';
  v_property_address text := '';
  v_suburb text := '';
  v_city text := '';
  v_province text := '';
  v_finance_type text := 'cash';
  v_purchaser_type text := 'individual';
  v_onboarding_token text := '';
  v_prefill jsonb := '{}'::jsonb;
  v_client_intake_preference text := 'digital_portal';
  v_client_intake_label text := 'Digital Portal';
  v_onboarding_status text := 'awaiting_client_onboarding';
  v_next_action_text text := 'Send buyer onboarding and prepare OTP intake';
begin
  if v_token is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  if v_decision not in ('accepted', 'rejected', 'countered') then
    return jsonb_build_object('ok', false, 'reason', 'invalid_decision');
  end if;

  select *
    into v_session
  from public.offer_seller_review_sessions
  where token = v_token
  limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  if v_session.status in ('accepted', 'rejected', 'countered') then
    return jsonb_build_object('ok', false, 'reason', 'already_decided', 'status', v_session.status);
  end if;

  if v_session.status = 'revoked' then
    return jsonb_build_object('ok', false, 'reason', 'revoked');
  end if;

  if v_session.expires_at is not null and v_session.expires_at < now() then
    update public.offer_seller_review_sessions
       set status = 'expired'
     where id = v_session.id;
    return jsonb_build_object('ok', false, 'reason', 'expired');
  end if;

  select *
    into v_offer
  from public.offers
  where id = v_session.offer_id
  limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'offer_not_found');
  end if;

  select coalesce(to_jsonb(private_listings), '{}'::jsonb)
    into v_listing
  from public.private_listings
  where id = coalesce(v_session.listing_id, v_offer.listing_id)
  limit 1;

  if v_offer.buyer_contact_id is not null then
    select coalesce(to_jsonb(contacts), '{}'::jsonb)
      into v_buyer
    from public.contacts
    where contact_id = v_offer.buyer_contact_id
    limit 1;
  end if;

  if v_offer.seller_contact_id is not null or v_session.seller_contact_id is not null then
    select coalesce(to_jsonb(contacts), '{}'::jsonb)
      into v_seller
    from public.contacts
    where contact_id = coalesce(v_session.seller_contact_id, v_offer.seller_contact_id)
    limit 1;
  end if;

  if v_offer.agent_id is not null or v_session.agent_id is not null then
    select coalesce(to_jsonb(profiles), '{}'::jsonb)
      into v_agent
    from public.profiles
    where id = coalesce(v_session.agent_id, v_offer.agent_id)
    limit 1;
  end if;

  update public.offer_seller_review_sessions
     set status = v_decision,
         decision_notes = v_notes,
         viewed_at = coalesce(viewed_at, now()),
         accepted_at = case when v_decision = 'accepted' then coalesce(accepted_at, now()) else accepted_at end,
         rejected_at = case when v_decision = 'rejected' then coalesce(rejected_at, now()) else rejected_at end,
         countered_at = case when v_decision = 'countered' then coalesce(countered_at, now()) else countered_at end
   where id = v_session.id
   returning * into v_session;

  if v_decision = 'accepted' then
    v_buyer_name := nullif(trim(coalesce(
      v_offer.conditions_json->>'buyerName',
      v_offer.conditions_json->>'fullName',
      v_buyer->>'full_name',
      v_buyer->>'display_name',
      v_buyer->>'name',
      ''
    )), '');
    v_buyer_email := lower(nullif(trim(coalesce(
      v_offer.conditions_json->>'buyerEmail',
      v_offer.conditions_json->>'email',
      v_buyer->>'email',
      ''
    )), ''));
    v_buyer_phone := nullif(trim(coalesce(
      v_offer.conditions_json->>'buyerPhone',
      v_offer.conditions_json->>'phone',
      v_buyer->>'phone',
      v_buyer->>'phone_number',
      ''
    )), '');
    v_agent_name := nullif(trim(coalesce(
      v_agent->>'full_name',
      v_agent->>'name',
      concat_ws(' ', v_agent->>'first_name', v_agent->>'last_name'),
      ''
    )), '');
    v_agent_email := lower(nullif(trim(coalesce(v_agent->>'email', '')), ''));
    v_property_title := nullif(trim(coalesce(
      v_listing->>'listing_title',
      v_listing->>'title',
      v_listing->'marketing'->>'title',
      v_listing->'property_details'->>'title',
      'Listing'
    )), '');
    v_property_address := nullif(trim(coalesce(
      v_listing->>'property_address',
      v_listing->>'address',
      v_listing->'property_details'->>'address',
      v_listing->'property_details'->>'addressLine1',
      v_property_title
    )), '');
    v_suburb := nullif(trim(coalesce(v_listing->>'suburb', v_listing->'property_details'->>'suburb', '')), '');
    v_city := nullif(trim(coalesce(v_listing->>'city', v_listing->'property_details'->>'city', '')), '');
    v_province := nullif(trim(coalesce(v_listing->>'province', v_listing->'property_details'->>'province', '')), '');
    v_finance_type := lower(nullif(trim(coalesce(v_offer.finance_type, v_offer.conditions_json->>'financeType', 'cash')), ''));
    if v_finance_type = 'hybrid' then
      v_finance_type := 'combination';
    elsif v_finance_type not in ('cash', 'bond', 'combination') then
      v_finance_type := 'cash';
    end if;
    v_purchaser_type := lower(replace(nullif(trim(coalesce(
      v_offer.conditions_json->>'buyerType',
      v_offer.conditions_json->>'purchaserType',
      'individual'
    )), ''), ' ', '_'));
    if v_purchaser_type in ('pty', 'pty_ltd', 'business') then
      v_purchaser_type := 'company';
    elsif v_purchaser_type not in ('individual', 'married_anc', 'married_coc', 'company', 'trust', 'foreign_purchaser') then
      v_purchaser_type := 'individual';
    end if;

    v_client_intake_preference := lower(replace(nullif(trim(coalesce(
      v_offer.conditions_json->>'clientIntakePreference',
      v_offer.conditions_json->>'deliveryMode',
      'digital_portal'
    )), ''), ' ', '_'));

    if v_client_intake_preference in ('agent', 'assisted', 'agent_assisted', 'assisted_capture') then
      v_client_intake_preference := 'agent_assisted';
      v_client_intake_label := 'Agent Assisted';
      v_onboarding_status := 'agent_assisted_pending';
      v_next_action_text := 'Capture buyer onboarding with the client and prepare OTP intake';
    elsif v_client_intake_preference in ('hardcopy', 'hard_copy', 'paper', 'printed') then
      v_client_intake_preference := 'hard_copy';
      v_client_intake_label := 'Hard Copy';
      v_onboarding_status := 'hard_copy_pending';
      v_next_action_text := 'Prepare hard-copy onboarding pack and capture OTP intake manually';
    else
      v_client_intake_preference := 'digital_portal';
      v_client_intake_label := 'Digital Portal';
      v_onboarding_status := 'awaiting_client_onboarding';
      v_next_action_text := 'Send buyer onboarding and prepare OTP intake';
    end if;

    if v_offer.transaction_id is not null then
      v_transaction_id := v_offer.transaction_id;
    end if;

    if v_transaction_id is null then
      select id
        into v_transaction_id
      from public.transactions
      where accepted_offer_id = v_offer.id
      order by created_at desc
      limit 1;
    end if;

    if v_transaction_id is null and v_offer.buyer_lead_id is not null then
      select id
        into v_transaction_id
      from public.transactions
      where organisation_id = v_offer.organisation_id
        and originating_buyer_lead_id = v_offer.buyer_lead_id
      order by created_at desc
      limit 1;
    end if;

    if v_buyer_email is not null then
      select id
        into v_buyer_id
      from public.buyers
      where lower(email) = v_buyer_email
      order by id
      limit 1;
    end if;

    if v_buyer_id is null then
      insert into public.buyers (name, phone, email)
      values (coalesce(v_buyer_name, 'Buyer'), v_buyer_phone, v_buyer_email)
      returning id into v_buyer_id;
    else
      update public.buyers
         set name = coalesce(nullif(name, ''), coalesce(v_buyer_name, name)),
             phone = coalesce(nullif(phone, ''), v_buyer_phone),
             email = coalesce(nullif(email, ''), v_buyer_email)
       where id = v_buyer_id;
    end if;

    if v_transaction_id is null then
      v_new_transaction_id := gen_random_uuid();
      insert into public.transactions (
        id,
        organisation_id,
        buyer_id,
        transaction_reference,
        transaction_type,
        property_address_line_1,
        suburb,
        city,
        province,
        property_description,
        sales_price,
        purchase_price,
        finance_type,
        cash_amount,
        bond_amount,
        deposit_amount,
        purchaser_type,
        stage,
        current_main_stage,
        next_action,
        comment,
        assigned_agent,
        assigned_agent_email,
        assigned_agent_id,
        owner_user_id,
        is_active,
        lifecycle_state,
        listing_id,
        originating_lead_id,
        originating_buyer_lead_id,
        accepted_offer_id,
        buyer_contact_id,
        seller_contact_id,
        onboarding_status,
        created_at,
        updated_at
      )
      values (
        v_new_transaction_id,
        v_offer.organisation_id,
        v_buyer_id,
        'BR-' || upper(right(replace(v_new_transaction_id::text, '-', ''), 8)),
        'private_property',
        v_property_address,
        v_suburb,
        v_city,
        v_province,
        v_property_title,
        v_offer.offer_amount,
        v_offer.offer_amount,
        v_finance_type,
        v_offer.cash_component,
        v_offer.bond_component,
        v_offer.deposit_amount,
        v_purchaser_type,
        'Buyer Onboarding Pending',
        'OTP',
        v_next_action_text,
        'Transaction created automatically from seller-accepted buyer offer. Client intake mode: ' || v_client_intake_label || '.',
        v_agent_name,
        v_agent_email,
        coalesce(v_session.agent_id, v_offer.agent_id),
        coalesce(v_session.agent_id, v_offer.agent_id),
        true,
        'active',
        coalesce(v_session.listing_id, v_offer.listing_id),
        v_offer.buyer_lead_id,
        v_offer.buyer_lead_id,
        v_offer.id,
        v_offer.buyer_contact_id,
        coalesce(v_session.seller_contact_id, v_offer.seller_contact_id),
        v_onboarding_status,
        now(),
        now()
      )
      returning id into v_transaction_id;
    end if;

    if to_regclass('public.transaction_onboarding') is not null and v_transaction_id is not null then
      v_onboarding_token := 'onb_' || replace(gen_random_uuid()::text, '-', '');
      insert into public.transaction_onboarding (
        transaction_id,
        token,
        purchaser_type,
        status,
        is_active,
        created_at,
        updated_at
      )
      values (
        v_transaction_id,
        v_onboarding_token,
        v_purchaser_type,
        'Not Started',
        true,
        now(),
        now()
      )
      on conflict (transaction_id) do update
        set purchaser_type = coalesce(public.transaction_onboarding.purchaser_type, excluded.purchaser_type),
            is_active = true,
            updated_at = now();
    end if;

    if to_regclass('public.onboarding_form_data') is not null and v_transaction_id is not null then
      v_prefill := jsonb_strip_nulls(jsonb_build_object(
        'purchaser_type', v_purchaser_type,
        'first_name', split_part(coalesce(v_buyer_name, ''), ' ', 1),
        'last_name', nullif(trim(substr(coalesce(v_buyer_name, ''), length(split_part(coalesce(v_buyer_name, ''), ' ', 1)) + 1)), ''),
        'email', v_buyer_email,
        'phone', v_buyer_phone,
        'purchase_finance_type', v_finance_type,
        'purchase_price', v_offer.offer_amount,
        'cash_amount', v_offer.cash_component,
        'bond_amount', v_offer.bond_component,
        'deposit_amount', v_offer.deposit_amount,
        'occupation_date', v_offer.conditions_json->>'occupationDate',
        'occupational_rent', case when lower(coalesce(v_offer.conditions_json->>'occupationalRent', '')) in ('true', 'yes', '1') then 'yes' else null end,
        'special_conditions', coalesce(v_offer.conditions_json->>'specialConditions', v_offer.conditions_json->>'suspensiveConditions'),
        'subject_to_sale', case when lower(coalesce(v_offer.conditions_json->>'subjectToSale', '')) in ('true', 'yes', '1') then 'yes' else null end,
        'subject_sale_property', v_offer.conditions_json->>'subjectSaleProperty',
        'subject_sale_timeline', v_offer.conditions_json->>'subjectSaleTimeline',
        'bridge_client_intake_preference', v_client_intake_preference,
        'bridge_client_intake_label', v_client_intake_label,
        'bridge_agent_assisted_onboarding', case when v_client_intake_preference = 'agent_assisted' then 'yes' else null end,
        'bridge_hard_copy_preferred', case when v_client_intake_preference = 'hard_copy' then 'yes' else null end,
        'bridge_prefill_source', 'accepted_offer',
        'bridge_prefilled_at', now()
      ));

      insert into public.onboarding_form_data (
        transaction_id,
        purchaser_type,
        form_data,
        created_at,
        updated_at
      )
      values (
        v_transaction_id,
        v_purchaser_type,
        v_prefill,
        now(),
        now()
      )
      on conflict (transaction_id) do update
        set purchaser_type = coalesce(public.onboarding_form_data.purchaser_type, excluded.purchaser_type),
            form_data = excluded.form_data || public.onboarding_form_data.form_data,
            updated_at = now();
    end if;
  end if;

  v_next_offer_status := case
    when v_decision = 'accepted' and v_transaction_id is not null then 'converted_to_transaction'
    else v_decision
  end;

  update public.offers
     set status = v_next_offer_status,
         accepted_at = case when v_decision = 'accepted' then coalesce(accepted_at, now()) else accepted_at end,
         rejected_at = case when v_decision = 'rejected' then coalesce(rejected_at, now()) else rejected_at end,
         countered_at = case when v_decision = 'countered' then coalesce(countered_at, now()) else countered_at end,
         converted_to_transaction_at = case when v_next_offer_status = 'converted_to_transaction' then coalesce(converted_to_transaction_at, now()) else converted_to_transaction_at end,
         transaction_id = coalesce(v_transaction_id, transaction_id),
         conditions_json = coalesce(conditions_json, '{}'::jsonb) ||
           jsonb_build_object(
             'sellerDecision', v_decision,
             'sellerDecisionNotes', v_notes,
             'sellerDecisionAt', now(),
             'sellerReviewSessionId', v_session.id,
             'transactionId', v_transaction_id,
             'clientIntakePreference', v_client_intake_preference
           )
   where id = v_offer.id
   returning * into v_offer;

  if v_offer.buyer_lead_id is not null then
    if v_decision = 'accepted' then
      v_stage := case when v_transaction_id is not null then 'Onboarding' else 'Offer Accepted' end;
      v_activity_type := case when v_transaction_id is not null then 'Transaction Created' else 'Offer Accepted' end;
      v_activity_note := case
        when v_transaction_id is not null
          then 'Seller accepted the buyer offer. Bridge created the transaction and opened onboarding / OTP preparation.'
        else 'Seller accepted the buyer offer from the seller offer review portal. Transaction creation and buyer onboarding can now proceed.'
      end;
    elsif v_decision = 'countered' then
      v_stage := 'Negotiating';
      v_activity_type := 'Offer Countered';
      v_activity_note := 'Seller requested a counter-offer or changes from the seller offer review portal.';
    else
      v_stage := 'Lost';
      v_activity_type := 'Offer Rejected';
      v_activity_note := 'Seller rejected the buyer offer from the seller offer review portal.';
    end if;

    update public.leads
       set current_stage = v_stage,
           stage = v_stage,
           status = v_stage,
           converted_transaction_id = case when v_transaction_id is not null then v_transaction_id else converted_transaction_id end,
           converted_at = case when v_transaction_id is not null then coalesce(converted_at, now()) else converted_at end,
           updated_at = now()
     where organisation_id = v_offer.organisation_id
       and lead_id = v_offer.buyer_lead_id;

    if to_regclass('public.lead_activities') is not null then
      insert into public.lead_activities (
        organisation_id,
        lead_id,
        agent_id,
        activity_type,
        activity_note,
        outcome,
        activity_date
      )
      values (
        v_offer.organisation_id,
        v_offer.buyer_lead_id,
        v_offer.agent_id,
        v_activity_type,
        v_activity_note || case when v_notes is not null then ' Seller note: ' || v_notes else '' end,
        v_stage,
        now()
      );
    end if;
  end if;

  return jsonb_build_object(
    'ok', true,
    'reason', '',
    'decision', v_decision,
    'transactionId', v_transaction_id,
    'session', jsonb_build_object(
      'id', v_session.id,
      'token', v_session.token,
      'status', v_session.status,
      'decisionNotes', v_session.decision_notes,
      'acceptedAt', v_session.accepted_at,
      'rejectedAt', v_session.rejected_at,
      'counteredAt', v_session.countered_at
    ),
    'offer', jsonb_build_object(
      'id', v_offer.id,
      'organisationId', v_offer.organisation_id,
      'buyerLeadId', v_offer.buyer_lead_id,
      'buyerContactId', v_offer.buyer_contact_id,
      'listingId', v_offer.listing_id,
      'agentId', v_offer.agent_id,
      'status', v_offer.status,
      'offerAmount', v_offer.offer_amount,
      'depositAmount', v_offer.deposit_amount,
      'financeType', v_offer.finance_type,
      'cashComponent', v_offer.cash_component,
      'bondComponent', v_offer.bond_component,
      'conditionsJson', v_offer.conditions_json,
      'expiryDate', v_offer.expiry_date,
      'submittedAt', v_offer.submitted_at,
      'acceptedAt', v_offer.accepted_at,
      'rejectedAt', v_offer.rejected_at,
      'counteredAt', v_offer.countered_at,
      'convertedToTransactionAt', v_offer.converted_to_transaction_at,
      'transactionId', v_offer.transaction_id
    ),
    'listing', coalesce(v_listing, '{}'::jsonb),
    'buyer', coalesce(v_buyer, '{}'::jsonb),
    'seller', coalesce(v_seller, '{}'::jsonb),
    'agent', coalesce(v_agent, '{}'::jsonb)
  );
end;
$$;

grant execute on function public.bridge_submit_seller_offer_decision(text, text, text) to anon, authenticated;
