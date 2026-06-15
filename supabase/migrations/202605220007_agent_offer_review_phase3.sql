create or replace function public.bridge_get_seller_offer_review_session(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text := nullif(trim(coalesce(p_token, '')), '');
  v_session public.offer_seller_review_sessions%rowtype;
  v_offer public.offers%rowtype;
  v_listing jsonb := '{}'::jsonb;
  v_seller jsonb := '{}'::jsonb;
  v_buyer jsonb := '{}'::jsonb;
  v_agent jsonb := '{}'::jsonb;
begin
  if v_token is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  select *
    into v_session
  from public.offer_seller_review_sessions
  where token = v_token
  limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  if v_session.status in ('revoked') then
    return jsonb_build_object('ok', false, 'reason', 'revoked');
  end if;

  if v_session.expires_at is not null and v_session.expires_at < now() then
    update public.offer_seller_review_sessions
       set status = 'expired'
     where id = v_session.id
     returning * into v_session;

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

  if v_session.status in ('draft', 'sent') then
    update public.offer_seller_review_sessions
       set status = 'viewed',
           viewed_at = coalesce(viewed_at, now())
     where id = v_session.id
     returning * into v_session;
  end if;

  if v_offer.status = 'sent_to_seller' then
    update public.offers
       set status = 'seller_viewed',
           seller_viewed_at = coalesce(seller_viewed_at, now())
     where id = v_offer.id
     returning * into v_offer;
  end if;

  select coalesce(to_jsonb(private_listings), '{}'::jsonb)
    into v_listing
  from public.private_listings
  where id = coalesce(v_session.listing_id, v_offer.listing_id)
  limit 1;

  if v_offer.seller_contact_id is not null or v_session.seller_contact_id is not null then
    select coalesce(to_jsonb(contacts), '{}'::jsonb)
      into v_seller
    from public.contacts
    where contact_id = coalesce(v_session.seller_contact_id, v_offer.seller_contact_id)
    limit 1;
  end if;

  if v_offer.buyer_contact_id is not null then
    select coalesce(to_jsonb(contacts), '{}'::jsonb)
      into v_buyer
    from public.contacts
    where contact_id = v_offer.buyer_contact_id
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
    'session', jsonb_build_object(
      'id', v_session.id,
      'organisationId', v_session.organisation_id,
      'offerId', v_session.offer_id,
      'sellerLeadId', v_session.seller_lead_id,
      'sellerContactId', v_session.seller_contact_id,
      'listingId', v_session.listing_id,
      'agentId', v_session.agent_id,
      'token', v_session.token,
      'status', v_session.status,
      'sentAt', v_session.sent_at,
      'viewedAt', v_session.viewed_at,
      'acceptedAt', v_session.accepted_at,
      'rejectedAt', v_session.rejected_at,
      'counteredAt', v_session.countered_at,
      'expiresAt', v_session.expires_at,
      'decisionNotes', v_session.decision_notes,
      'metadata', v_session.metadata_json
    ),
    'offer', jsonb_build_object(
      'id', v_offer.id,
      'organisationId', v_offer.organisation_id,
      'buyerLeadId', v_offer.buyer_lead_id,
      'buyerContactId', v_offer.buyer_contact_id,
      'listingId', v_offer.listing_id,
      'sellerLeadId', v_offer.seller_lead_id,
      'sellerContactId', v_offer.seller_contact_id,
      'agentId', v_offer.agent_id,
      'viewingAppointmentId', v_offer.viewing_appointment_id,
      'status', v_offer.status,
      'offerAmount', v_offer.offer_amount,
      'depositAmount', v_offer.deposit_amount,
      'financeType', v_offer.finance_type,
      'cashComponent', v_offer.cash_component,
      'bondComponent', v_offer.bond_component,
      'conditionsJson', v_offer.conditions_json,
      'expiryDate', v_offer.expiry_date,
      'submittedAt', v_offer.submitted_at,
      'buyerSubmittedAt', v_offer.buyer_submitted_at,
      'sentToSellerAt', v_offer.sent_to_seller_at,
      'sellerViewedAt', v_offer.seller_viewed_at,
      'acceptedAt', v_offer.accepted_at,
      'rejectedAt', v_offer.rejected_at,
      'transactionId', v_offer.transaction_id,
      'createdAt', v_offer.created_at,
      'updatedAt', v_offer.updated_at
    ),
    'listing', coalesce(v_listing, '{}'::jsonb),
    'seller', coalesce(v_seller, '{}'::jsonb),
    'buyer', coalesce(v_buyer, '{}'::jsonb),
    'agent', coalesce(v_agent, '{}'::jsonb)
  );
end;
$$;
grant execute on function public.bridge_get_seller_offer_review_session(text) to anon, authenticated;
