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

  v_next_offer_status := v_decision;

  update public.offer_seller_review_sessions
     set status = v_decision,
         decision_notes = v_notes,
         viewed_at = coalesce(viewed_at, now()),
         accepted_at = case when v_decision = 'accepted' then coalesce(accepted_at, now()) else accepted_at end,
         rejected_at = case when v_decision = 'rejected' then coalesce(rejected_at, now()) else rejected_at end,
         countered_at = case when v_decision = 'countered' then coalesce(countered_at, now()) else countered_at end
   where id = v_session.id
   returning * into v_session;

  update public.offers
     set status = v_next_offer_status,
         accepted_at = case when v_next_offer_status = 'accepted' then coalesce(accepted_at, now()) else accepted_at end,
         rejected_at = case when v_next_offer_status = 'rejected' then coalesce(rejected_at, now()) else rejected_at end,
         countered_at = case when v_next_offer_status = 'countered' then coalesce(countered_at, now()) else countered_at end,
         conditions_json = coalesce(conditions_json, '{}'::jsonb) ||
           jsonb_build_object(
             'sellerDecision', v_decision,
             'sellerDecisionNotes', v_notes,
             'sellerDecisionAt', now(),
             'sellerReviewSessionId', v_session.id
           )
   where id = v_offer.id
   returning * into v_offer;

  if v_offer.buyer_lead_id is not null then
    if v_decision = 'accepted' then
      v_stage := 'Offer Accepted';
      v_activity_type := 'Offer Accepted';
      v_activity_note := 'Seller accepted the buyer offer from the seller offer review portal. Transaction creation and buyer onboarding can now proceed.';
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

  return jsonb_build_object(
    'ok', true,
    'reason', '',
    'decision', v_decision,
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
      'conditionsJson', v_offer.conditions_json,
      'expiryDate', v_offer.expiry_date,
      'submittedAt', v_offer.submitted_at,
      'acceptedAt', v_offer.accepted_at,
      'rejectedAt', v_offer.rejected_at,
      'counteredAt', v_offer.countered_at
    ),
    'listing', coalesce(v_listing, '{}'::jsonb),
    'buyer', coalesce(v_buyer, '{}'::jsonb),
    'seller', coalesce(v_seller, '{}'::jsonb),
    'agent', coalesce(v_agent, '{}'::jsonb)
  );
end;
$$;
grant execute on function public.bridge_submit_seller_offer_decision(text, text, text) to anon, authenticated;
