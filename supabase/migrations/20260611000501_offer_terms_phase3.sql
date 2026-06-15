create or replace function public.bridge_submit_offer_portal_offer(
  p_token text,
  p_listing_id uuid,
  p_submission jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.offer_portal_sessions%rowtype;
  v_viewed_listing public.appointment_viewed_listings%rowtype;
  v_offer public.offers%rowtype;
  v_expiry date;
  v_finance_type text;
  v_purchaser_type text;
  v_subject_to_sale boolean := lower(coalesce(p_submission->>'subjectToSale', 'false')) in ('true', 'yes', '1');
  v_occupational_rent boolean := lower(coalesce(p_submission->>'occupationalRent', 'false')) in ('true', 'yes', '1');
  v_offer_amount numeric := public.bridge_jsonb_money(p_submission->>'offerAmount');
  v_deposit_amount numeric := public.bridge_jsonb_money(p_submission->>'depositAmount');
  v_bond_amount numeric := public.bridge_jsonb_money(p_submission->>'bondAmount');
  v_cash_amount numeric := public.bridge_jsonb_money(p_submission->>'cashContribution');
begin
  select *
    into v_session
  from public.offer_portal_sessions
  where token = nullif(trim(coalesce(p_token, '')), '')
  limit 1;

  if v_session.id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  if v_session.status in ('revoked', 'closed') then
    return jsonb_build_object('ok', false, 'reason', v_session.status);
  end if;

  if v_session.status = 'expired' or (v_session.expires_at is not null and v_session.expires_at < now()) then
    update public.offer_portal_sessions
      set status = 'expired'
    where id = v_session.id
      and status <> 'expired';
    return jsonb_build_object('ok', false, 'reason', 'expired');
  end if;

  select *
    into v_viewed_listing
  from public.appointment_viewed_listings
  where organisation_id = v_session.organisation_id
    and appointment_id = v_session.appointment_id
    and listing_id = p_listing_id
  limit 1;

  if v_viewed_listing.id is null then
    return jsonb_build_object('ok', false, 'reason', 'listing_not_in_session');
  end if;

  if coalesce(v_offer_amount, 0) <= 0 then
    return jsonb_build_object('ok', false, 'reason', 'offer_amount_required');
  end if;

  if coalesce(nullif(trim(p_submission->>'fullName'), ''), '') = ''
    or coalesce(nullif(trim(p_submission->>'email'), ''), '') = ''
    or coalesce(nullif(trim(p_submission->>'phone'), ''), '') = '' then
    return jsonb_build_object('ok', false, 'reason', 'buyer_details_required');
  end if;

  v_purchaser_type := lower(replace(trim(coalesce(p_submission->>'purchaserType', p_submission->>'buyerType', 'individual')), ' ', '_'));
  if v_purchaser_type in ('pty', 'pty_ltd', 'business') then
    v_purchaser_type := 'company';
  elsif v_purchaser_type in ('foreign', 'foreign_buyer') then
    v_purchaser_type := 'foreign_purchaser';
  elsif v_purchaser_type not in ('individual', 'married_anc', 'married_coc', 'married_anc_accrual', 'company', 'trust', 'foreign_purchaser') then
    v_purchaser_type := 'individual';
  end if;

  v_finance_type := lower(trim(coalesce(p_submission->>'financeType', 'cash')));
  if v_finance_type = 'hybrid' then
    v_finance_type := 'combination';
  elsif v_finance_type not in ('cash', 'bond', 'combination', 'developer') then
    if v_finance_type like '%bond%' and v_finance_type like '%cash%' then
      v_finance_type := 'combination';
    elsif v_finance_type like '%bond%' then
      v_finance_type := 'bond';
    else
      v_finance_type := 'cash';
    end if;
  end if;

  if nullif(trim(coalesce(p_submission->>'depositAmount', '')), '') is null
    or nullif(trim(coalesce(p_submission->>'depositDueDate', '')), '') is null then
    return jsonb_build_object('ok', false, 'reason', 'deposit_terms_required');
  end if;

  if nullif(trim(coalesce(p_submission->>'occupationDate', '')), '') is null then
    return jsonb_build_object('ok', false, 'reason', 'occupation_terms_required');
  end if;

  if coalesce(p_submission->>'expiryDate', '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    or coalesce(p_submission->>'expiryTime', '') !~ '^[0-9]{2}:[0-9]{2}$' then
    return jsonb_build_object('ok', false, 'reason', 'expiry_terms_required');
  end if;

  if v_finance_type in ('bond', 'combination')
    and nullif(trim(coalesce(p_submission->>'bondApprovalDeadline', '')), '') is null then
    return jsonb_build_object('ok', false, 'reason', 'finance_terms_required');
  end if;

  if v_finance_type = 'bond' and coalesce(v_bond_amount, 0) <= 0 then
    return jsonb_build_object('ok', false, 'reason', 'finance_terms_required');
  end if;

  if v_finance_type = 'combination' and (coalesce(v_bond_amount, 0) <= 0 or coalesce(v_cash_amount, 0) <= 0) then
    return jsonb_build_object('ok', false, 'reason', 'finance_terms_required');
  end if;

  if v_finance_type = 'cash'
    and nullif(trim(coalesce(p_submission->>'proofOfFundsUrl', p_submission->>'proofOfFundsReference', '')), '') is null then
    return jsonb_build_object('ok', false, 'reason', 'proof_of_funds_required');
  end if;

  if v_finance_type = 'bond'
    and nullif(trim(coalesce(p_submission->>'preApprovalReference', p_submission->>'proofOfFundsReference', '')), '') is null then
    return jsonb_build_object('ok', false, 'reason', 'finance_terms_required');
  end if;

  if v_subject_to_sale and (
    nullif(trim(coalesce(p_submission->>'subjectSaleProperty', '')), '') is null
    or nullif(trim(coalesce(p_submission->>'subjectSaleTimeline', '')), '') is null
  ) then
    return jsonb_build_object('ok', false, 'reason', 'subject_sale_details_required');
  end if;

  if v_occupational_rent and nullif(trim(coalesce(p_submission->>'occupationalRentAmount', '')), '') is null then
    return jsonb_build_object('ok', false, 'reason', 'occupation_terms_required');
  end if;

  if v_purchaser_type in ('company', 'trust')
    and nullif(trim(coalesce(p_submission->>'purchaserEntityName', '')), '') is null then
    return jsonb_build_object('ok', false, 'reason', 'purchaser_structure_required');
  end if;

  v_expiry := (p_submission->>'expiryDate')::date;

  insert into public.offers (
    organisation_id,
    offer_token,
    buyer_lead_id,
    buyer_contact_id,
    listing_id,
    agent_id,
    viewing_appointment_id,
    status,
    offer_amount,
    deposit_amount,
    finance_type,
    cash_component,
    bond_component,
    conditions_json,
    expiry_date,
    buyer_submitted_at,
    submitted_at
  )
  values (
    v_session.organisation_id,
    'offer-' || replace(gen_random_uuid()::text, '-', ''),
    v_session.buyer_lead_id,
    v_session.buyer_contact_id,
    p_listing_id,
    v_session.agent_id,
    v_session.appointment_id,
    'submitted',
    v_offer_amount,
    v_deposit_amount,
    v_finance_type,
    v_cash_amount,
    v_bond_amount,
    coalesce(p_submission, '{}'::jsonb) || jsonb_build_object(
      'source', 'post_viewing_offer_portal',
      'offerPortalSessionId', v_session.id,
      'viewedListingId', v_viewed_listing.id,
      'selectedListingId', p_listing_id,
      'agentReviewRequired', true,
      'buyerSubmittedAt', now(),
      'buyerType', v_purchaser_type,
      'purchaserType', v_purchaser_type,
      'financeType', v_finance_type,
      'depositDueDate', p_submission->>'depositDueDate',
      'bondApprovalDeadline', p_submission->>'bondApprovalDeadline',
      'proofOfFundsReference', p_submission->>'proofOfFundsReference',
      'preApprovalReference', p_submission->>'preApprovalReference',
      'occupationDate', p_submission->>'occupationDate',
      'occupationalRent', v_occupational_rent,
      'occupationalRentPayable', v_occupational_rent,
      'occupationalRentAmount', p_submission->>'occupationalRentAmount',
      'subjectToSale', v_subject_to_sale,
      'expiryTime', p_submission->>'expiryTime'
    ),
    v_expiry,
    now(),
    now()
  )
  returning *
  into v_offer;

  if v_session.buyer_lead_id is not null then
    update public.leads
      set current_stage = 'Offer Submitted',
          stage = 'Offer Submitted',
          status = 'Offer Submitted',
          updated_at = now()
    where organisation_id = v_session.organisation_id
      and lead_id = v_session.buyer_lead_id;

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
        v_session.organisation_id,
        v_session.buyer_lead_id,
        v_session.agent_id,
        'Offer Submitted',
        'Buyer submitted a structured offer from the post-viewing offer portal. Agent review is required before sending to the seller.',
        'Offer Submitted',
        now()
      );
    end if;
  end if;

  update public.offer_portal_sessions
    set status = 'submitted',
        submitted_at = coalesce(submitted_at, now()),
        viewed_at = coalesce(viewed_at, now())
  where id = v_session.id;

  return jsonb_build_object(
    'ok', true,
    'reason', '',
    'offer', jsonb_build_object(
      'id', v_offer.id,
      'offerToken', v_offer.offer_token,
      'organisationId', v_offer.organisation_id,
      'buyerLeadId', v_offer.buyer_lead_id,
      'buyerContactId', v_offer.buyer_contact_id,
      'listingId', v_offer.listing_id,
      'agentId', v_offer.agent_id,
      'viewingAppointmentId', v_offer.viewing_appointment_id,
      'status', v_offer.status,
      'offerAmount', v_offer.offer_amount,
      'depositAmount', v_offer.deposit_amount,
      'financeType', v_offer.finance_type,
      'cashComponent', v_offer.cash_component,
      'bondComponent', v_offer.bond_component,
      'conditions', v_offer.conditions_json,
      'expiryDate', v_offer.expiry_date,
      'buyerSubmittedAt', v_offer.buyer_submitted_at,
      'submittedAt', v_offer.submitted_at,
      'createdAt', v_offer.created_at,
      'updatedAt', v_offer.updated_at
    )
  );
end;
$$;

grant execute on function public.bridge_submit_offer_portal_offer(text, uuid, jsonb) to anon, authenticated;
