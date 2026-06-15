create table if not exists public.offer_portal_sessions (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  buyer_lead_id uuid references public.leads(lead_id) on delete set null,
  buyer_contact_id uuid references public.contacts(contact_id) on delete set null,
  appointment_id uuid references public.appointments(appointment_id) on delete cascade,
  agent_id uuid references public.profiles(id) on delete set null,
  token text not null unique,
  status text not null default 'active',
  expires_at timestamptz,
  sent_at timestamptz,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint offer_portal_sessions_status_check check (
    status in ('draft', 'active', 'sent', 'expired', 'closed', 'revoked')
  )
);
create index if not exists offer_portal_sessions_organisation_status_idx
  on public.offer_portal_sessions (organisation_id, status, updated_at desc);
create index if not exists offer_portal_sessions_appointment_idx
  on public.offer_portal_sessions (appointment_id, updated_at desc);
create index if not exists offer_portal_sessions_buyer_lead_idx
  on public.offer_portal_sessions (buyer_lead_id, updated_at desc);
create index if not exists offer_portal_sessions_token_idx
  on public.offer_portal_sessions (token);
drop trigger if exists offer_portal_sessions_set_updated_at on public.offer_portal_sessions;
create trigger offer_portal_sessions_set_updated_at
before update on public.offer_portal_sessions
for each row
execute function public.bridge_set_updated_at();
alter table if exists public.offer_portal_sessions enable row level security;
drop policy if exists offer_portal_sessions_org_members_select on public.offer_portal_sessions;
create policy offer_portal_sessions_org_members_select
  on public.offer_portal_sessions
  for select
  using (public.bridge_is_active_member(organisation_id));
drop policy if exists offer_portal_sessions_org_members_insert on public.offer_portal_sessions;
create policy offer_portal_sessions_org_members_insert
  on public.offer_portal_sessions
  for insert
  with check (public.bridge_is_active_member(organisation_id));
drop policy if exists offer_portal_sessions_org_members_update on public.offer_portal_sessions;
create policy offer_portal_sessions_org_members_update
  on public.offer_portal_sessions
  for update
  using (public.bridge_is_active_member(organisation_id))
  with check (public.bridge_is_active_member(organisation_id));
drop policy if exists offer_portal_sessions_org_members_delete on public.offer_portal_sessions;
create policy offer_portal_sessions_org_members_delete
  on public.offer_portal_sessions
  for delete
  using (public.bridge_is_active_member(organisation_id));
grant select, insert, update, delete on public.offer_portal_sessions to authenticated;
create or replace function public.bridge_jsonb_money(p_value text)
returns numeric
language sql
immutable
as $$
  select case
    when nullif(trim(coalesce(p_value, '')), '') is null then null
    when replace(trim(p_value), ',', '') ~ '^[0-9]+(\.[0-9]+)?$' then replace(trim(p_value), ',', '')::numeric
    else null
  end
$$;
create or replace function public.bridge_get_offer_portal_session(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.offer_portal_sessions%rowtype;
  v_properties jsonb := '[]'::jsonb;
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
    return jsonb_build_object('ok', false, 'reason', 'expired');
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'viewedListing', jsonb_build_object(
        'id', avl.id,
        'organisationId', avl.organisation_id,
        'appointmentId', avl.appointment_id,
        'leadId', avl.lead_id,
        'listingId', avl.listing_id,
        'agentId', avl.agent_id,
        'viewedAt', avl.viewed_at,
        'outcome', avl.outcome,
        'buyerFeedback', avl.buyer_feedback,
        'agentNotes', avl.agent_notes,
        'metadata', avl.metadata_json,
        'createdAt', avl.created_at,
        'updatedAt', avl.updated_at
      ),
      'listing', jsonb_build_object(
        'id', pl.id,
        'listingTitle', coalesce(to_jsonb(pl)->>'listing_title', to_jsonb(pl)->'marketing'->>'title', to_jsonb(pl)->'property_details'->>'title', 'Listing'),
        'propertyAddress', coalesce(to_jsonb(pl)->>'property_address', to_jsonb(pl)->'property_details'->>'address', to_jsonb(pl)->'property_details'->>'addressLine1', ''),
        'suburb', coalesce(to_jsonb(pl)->>'suburb', to_jsonb(pl)->'property_details'->>'suburb', ''),
        'city', coalesce(to_jsonb(pl)->>'city', to_jsonb(pl)->'property_details'->>'city', ''),
        'askingPrice', coalesce(to_jsonb(pl)->>'asking_price', to_jsonb(pl)->>'price', to_jsonb(pl)->'property_details'->>'askingPrice', ''),
        'raw', coalesce(to_jsonb(pl), '{}'::jsonb)
      ),
      'offers', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', o.id,
            'offerToken', o.offer_token,
            'status', o.status,
            'offerAmount', o.offer_amount,
            'depositAmount', o.deposit_amount,
            'financeType', o.finance_type,
            'submittedAt', o.submitted_at,
            'acceptedAt', o.accepted_at,
            'rejectedAt', o.rejected_at,
            'transactionId', o.transaction_id,
            'createdAt', o.created_at,
            'updatedAt', o.updated_at
          )
          order by o.updated_at desc
        )
        from public.offers o
        where o.organisation_id = v_session.organisation_id
          and o.listing_id = avl.listing_id
          and o.viewing_appointment_id = v_session.appointment_id
          and (
            v_session.buyer_lead_id is null
            or o.buyer_lead_id = v_session.buyer_lead_id
          )
      ), '[]'::jsonb)
    )
    order by avl.viewed_at desc nulls last, avl.updated_at desc
  ), '[]'::jsonb)
    into v_properties
  from public.appointment_viewed_listings avl
  left join public.private_listings pl
    on pl.id = avl.listing_id
  where avl.organisation_id = v_session.organisation_id
    and avl.appointment_id = v_session.appointment_id;

  return jsonb_build_object(
    'ok', true,
    'reason', '',
    'session', jsonb_build_object(
      'id', v_session.id,
      'token', v_session.token,
      'organisationId', v_session.organisation_id,
      'buyerLeadId', v_session.buyer_lead_id,
      'buyerContactId', v_session.buyer_contact_id,
      'appointmentId', v_session.appointment_id,
      'agentId', v_session.agent_id,
      'status', v_session.status,
      'expiresAt', v_session.expires_at,
      'sentAt', v_session.sent_at,
      'metadata', v_session.metadata_json,
      'createdAt', v_session.created_at,
      'updatedAt', v_session.updated_at
    ),
    'properties', v_properties
  );
end;
$$;
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

  if coalesce(public.bridge_jsonb_money(p_submission->>'offerAmount'), 0) <= 0 then
    return jsonb_build_object('ok', false, 'reason', 'offer_amount_required');
  end if;

  if coalesce(nullif(trim(p_submission->>'fullName'), ''), '') = ''
    or coalesce(nullif(trim(p_submission->>'email'), ''), '') = ''
    or coalesce(nullif(trim(p_submission->>'phone'), ''), '') = '' then
    return jsonb_build_object('ok', false, 'reason', 'buyer_details_required');
  end if;

  v_expiry := case
    when coalesce(p_submission->>'expiryDate', '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      then (p_submission->>'expiryDate')::date
    else null
  end;

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
    public.bridge_jsonb_money(p_submission->>'offerAmount'),
    public.bridge_jsonb_money(p_submission->>'depositAmount'),
    nullif(trim(p_submission->>'financeType'), ''),
    public.bridge_jsonb_money(p_submission->>'cashContribution'),
    public.bridge_jsonb_money(p_submission->>'bondAmount'),
    coalesce(p_submission, '{}'::jsonb) || jsonb_build_object(
      'source', 'post_viewing_offer_portal',
      'offerPortalSessionId', v_session.id,
      'viewedListingId', v_viewed_listing.id,
      'buyerSubmittedAt', now()
    ),
    v_expiry,
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
        'Buyer submitted an offer from the post-viewing offer portal.',
        'Offer Submitted',
        now()
      );
    end if;
  end if;

  update public.offer_portal_sessions
    set status = case when status = 'active' then 'sent' else status end
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
      'submittedAt', v_offer.submitted_at,
      'createdAt', v_offer.created_at,
      'updatedAt', v_offer.updated_at
    )
  );
end;
$$;
grant execute on function public.bridge_get_offer_portal_session(text) to anon, authenticated;
grant execute on function public.bridge_submit_offer_portal_offer(text, uuid, jsonb) to anon, authenticated;
notify pgrst, 'reload schema';
