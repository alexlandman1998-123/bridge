begin;

insert into public.notification_automation_definitions (
  automation_key, display_name, category, trigger_type, recipient_role,
  channels, implementation_status, default_enabled, dedupe_strategy,
  reminder_policy, metadata_json
) values
  ('offer_viewed_by_seller', 'Offer viewed by seller', 'notification', 'system_event', 'agent', array['email']::text[], 'active', true, 'offer_seller_review_agent', '{}'::jsonb, '{"phase":"phase_5_client_seller_offer_portal_events"}'::jsonb),
  ('offer_not_reviewed_reminder', 'Offer not reviewed reminder', 'reminder', 'scheduled_reminder', 'seller', array['email']::text[], 'active', true, 'offer_seller_review_seller_daily', '{"cadenceDays":[2],"stopWhen":"offer_seller_review_completed","quietHours":{"enabled":true,"timezone":"Africa/Johannesburg","startHour":18,"endHour":8},"escalation":{"enabled":true,"afterDay":3,"recipientRole":"agent","label":"Escalate offers that sellers have not reviewed."}}'::jsonb, '{"phase":"phase_5_client_seller_offer_portal_events"}'::jsonb),
  ('offer_review_overdue_escalation', 'Offer review overdue escalation', 'reminder', 'scheduled_reminder', 'agent', array['email']::text[], 'active', true, 'offer_seller_review_agent_daily', '{"cadenceDays":[3],"stopWhen":"offer_seller_review_completed","quietHours":{"enabled":true,"timezone":"Africa/Johannesburg","startHour":18,"endHour":8}}'::jsonb, '{"phase":"phase_5_client_seller_offer_portal_events"}'::jsonb),
  ('seller_mandate_viewed_unsigned_reminder', 'Seller mandate viewed but unsigned reminder', 'reminder', 'scheduled_reminder', 'seller', array['email']::text[], 'active', true, 'seller_mandate_unsigned_seller_daily', '{"cadenceDays":[1,3],"stopWhen":"seller_mandate_signed","quietHours":{"enabled":true,"timezone":"Africa/Johannesburg","startHour":18,"endHour":8},"escalation":{"enabled":true,"afterDay":3,"recipientRole":"agent","label":"Escalate unsigned seller mandates after portal access."}}'::jsonb, '{"phase":"phase_5_client_seller_offer_portal_events"}'::jsonb),
  ('seller_mandate_signing_overdue_escalation', 'Seller mandate signing overdue escalation', 'reminder', 'scheduled_reminder', 'agent', array['email']::text[], 'active', true, 'seller_mandate_unsigned_agent_daily', '{"cadenceDays":[3],"stopWhen":"seller_mandate_signed","quietHours":{"enabled":true,"timezone":"Africa/Johannesburg","startHour":18,"endHour":8}}'::jsonb, '{"phase":"phase_5_client_seller_offer_portal_events"}'::jsonb),
  ('buyer_onboarding_opened', 'Buyer onboarding opened', 'notification', 'system_event', 'agent', array['email']::text[], 'active', true, 'buyer_onboarding_opened_agent', '{}'::jsonb, '{"phase":"phase_5_client_seller_offer_portal_events"}'::jsonb),
  ('buyer_onboarding_started_not_submitted_reminder', 'Buyer onboarding started but not submitted reminder', 'reminder', 'scheduled_reminder', 'buyer', array['email']::text[], 'active', true, 'buyer_onboarding_started_buyer_daily', '{"cadenceDays":[1],"stopWhen":"buyer_onboarding_submitted","quietHours":{"enabled":true,"timezone":"Africa/Johannesburg","startHour":18,"endHour":8},"escalation":{"enabled":true,"afterDay":2,"recipientRole":"agent","label":"Escalate buyer onboarding that was started but not submitted."}}'::jsonb, '{"phase":"phase_5_client_seller_offer_portal_events"}'::jsonb),
  ('buyer_onboarding_overdue_escalation', 'Buyer onboarding overdue escalation', 'reminder', 'scheduled_reminder', 'agent', array['email']::text[], 'active', true, 'buyer_onboarding_started_agent_daily', '{"cadenceDays":[2],"stopWhen":"buyer_onboarding_submitted","quietHours":{"enabled":true,"timezone":"Africa/Johannesburg","startHour":18,"endHour":8}}'::jsonb, '{"phase":"phase_5_client_seller_offer_portal_events"}'::jsonb),
  ('buyer_onboarding_submitted_confirmation', 'Buyer onboarding submitted confirmation', 'notification', 'system_event', 'buyer', array['email']::text[], 'active', true, 'buyer_onboarding_submission_buyer', '{}'::jsonb, '{"phase":"phase_5_client_seller_offer_portal_events"}'::jsonb),
  ('client_portal_message_received', 'Client portal message received', 'notification', 'system_event', 'assigned_user', array['email']::text[], 'active', true, 'client_portal_message_owner', '{}'::jsonb, '{"phase":"phase_5_client_seller_offer_portal_events","sourceContract":"call bridge_queue_client_seller_portal_event_phase5 from portal message creation paths"}'::jsonb),
  ('client_portal_document_uploaded', 'Client portal document uploaded', 'notification', 'system_event', 'assigned_user', array['email']::text[], 'active', true, 'client_portal_document_owner', '{}'::jsonb, '{"phase":"phase_5_client_seller_offer_portal_events"}'::jsonb),
  ('client_portal_document_rejected', 'Client portal document rejected', 'notification', 'system_event', 'client', array['email']::text[], 'active', true, 'client_portal_document_client', '{}'::jsonb, '{"phase":"phase_5_client_seller_offer_portal_events"}'::jsonb)
on conflict (automation_key) do update set
  display_name = excluded.display_name,
  category = excluded.category,
  trigger_type = excluded.trigger_type,
  recipient_role = excluded.recipient_role,
  channels = excluded.channels,
  implementation_status = excluded.implementation_status,
  default_enabled = excluded.default_enabled,
  dedupe_strategy = excluded.dedupe_strategy,
  reminder_policy = excluded.reminder_policy,
  metadata_json = coalesce(public.notification_automation_definitions.metadata_json, '{}'::jsonb) || excluded.metadata_json,
  updated_at = now();

alter table public.notification_events
  add column if not exists recipient_user_id uuid references auth.users(id) on delete set null,
  add column if not exists recipient_address text,
  add column if not exists idempotency_key text,
  add column if not exists dispatch_attempt_count integer not null default 0,
  add column if not exists max_dispatch_attempts integer not null default 5,
  add column if not exists last_dispatch_attempt_at timestamptz,
  add column if not exists next_dispatch_attempt_at timestamptz,
  add column if not exists last_dispatch_error text,
  add column if not exists resend_of_event_id uuid references public.notification_events(id) on delete set null;

alter table public.notification_events
  drop constraint if exists notification_events_status_check;
alter table public.notification_events
  add constraint notification_events_status_check
  check (status in ('prepared', 'queued', 'processing', 'sent', 'delivered', 'failed', 'skipped'));

create unique index if not exists notification_events_client_seller_portal_dedupe_idx
  on public.notification_events (organisation_id, dedupe_key)
  where automation_key in (
    'offer_viewed_by_seller',
    'offer_not_reviewed_reminder',
    'offer_review_overdue_escalation',
    'seller_mandate_viewed_unsigned_reminder',
    'seller_mandate_signing_overdue_escalation',
    'buyer_onboarding_opened',
    'buyer_onboarding_started_not_submitted_reminder',
    'buyer_onboarding_overdue_escalation',
    'buyer_onboarding_submitted_confirmation',
    'client_portal_message_received',
    'client_portal_document_uploaded',
    'client_portal_document_rejected'
  )
  and dedupe_key is not null;

create index if not exists notification_events_client_seller_portal_dispatch_idx
  on public.notification_events (next_dispatch_attempt_at, queued_at, created_at)
  where automation_key in (
    'offer_viewed_by_seller',
    'offer_not_reviewed_reminder',
    'offer_review_overdue_escalation',
    'seller_mandate_viewed_unsigned_reminder',
    'seller_mandate_signing_overdue_escalation',
    'buyer_onboarding_opened',
    'buyer_onboarding_started_not_submitted_reminder',
    'buyer_onboarding_overdue_escalation',
    'buyer_onboarding_submitted_confirmation',
    'client_portal_message_received',
    'client_portal_document_uploaded',
    'client_portal_document_rejected'
  )
  and channel = 'email'
  and status in ('queued', 'failed');

create or replace function public.bridge_client_seller_phase5_profile_contact(p_user_id uuid)
returns table(user_id uuid, email text, name text)
language sql
stable
set search_path = ''
as $$
  select
    profile.id,
    lower(nullif(trim(profile.email), '')) as email,
    nullif(trim(coalesce(profile.full_name, profile.email)), '') as name
  from public.profiles profile
  where profile.id = p_user_id
  limit 1
$$;

create or replace function public.bridge_client_seller_phase5_contact_label(p_contact_id uuid)
returns table(email text, name text)
language sql
stable
set search_path = ''
as $$
  select
    lower(nullif(trim(to_jsonb(contact)->>'email'), '')) as email,
    nullif(trim(coalesce(
      nullif(concat_ws(' ', nullif(to_jsonb(contact)->>'first_name', ''), nullif(to_jsonb(contact)->>'last_name', '')), ''),
      nullif(to_jsonb(contact)->>'full_name', ''),
      nullif(to_jsonb(contact)->>'name', ''),
      nullif(to_jsonb(contact)->>'email', '')
    )), '') as name
  from public.contacts contact
  where contact.contact_id = p_contact_id
  limit 1
$$;

create or replace function public.bridge_client_seller_phase5_listing_label(p_listing_id uuid)
returns text
language sql
stable
set search_path = ''
as $$
  select coalesce(
    nullif(to_jsonb(listing)->>'property_title', ''),
    nullif(to_jsonb(listing)->>'title', ''),
    nullif(concat_ws(', ',
      nullif(to_jsonb(listing)->>'street_address', ''),
      nullif(to_jsonb(listing)->>'suburb', ''),
      nullif(to_jsonb(listing)->>'city', '')
    ), ''),
    nullif(to_jsonb(listing)->>'address', ''),
    ''
  )
  from public.private_listings listing
  where listing.id = p_listing_id
  limit 1
$$;

create or replace function public.bridge_queue_client_seller_portal_event_phase5(
  p_automation_key text,
  p_organisation_id uuid,
  p_recipient_email text,
  p_subject text,
  p_message text,
  p_dedupe_key text,
  p_payload jsonb default '{}'::jsonb,
  p_recipient_role text default 'assigned_user',
  p_recipient_user_id uuid default null,
  p_transaction_id uuid default null,
  p_listing_id uuid default null,
  p_offer_id uuid default null,
  p_source text default 'client_seller_portal'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event_id uuid;
  v_category text := 'notification';
  v_trigger_type text := 'system_event';
begin
  if p_organisation_id is null
    or nullif(trim(coalesce(p_recipient_email, '')), '') is null
    or nullif(trim(coalesce(p_automation_key, '')), '') is null then
    return null;
  end if;

  if p_automation_key in (
    'offer_not_reviewed_reminder',
    'offer_review_overdue_escalation',
    'seller_mandate_viewed_unsigned_reminder',
    'seller_mandate_signing_overdue_escalation',
    'buyer_onboarding_started_not_submitted_reminder',
    'buyer_onboarding_overdue_escalation'
  ) then
    v_category := 'reminder';
    v_trigger_type := 'scheduled_reminder';
  end if;

  if not exists (
    select 1
    from public.notification_automation_definitions definition
    where definition.automation_key = p_automation_key
      and definition.implementation_status = 'active'
      and definition.default_enabled = true
  ) then
    return null;
  end if;

  insert into public.notification_events (
    automation_key, organisation_id, transaction_id, listing_id, offer_id,
    recipient_user_id, event_key, category, trigger_type, channel, status,
    recipient_email, recipient_address, recipient_role, subject, message_preview,
    provider, source, dedupe_key, idempotency_key, payload_json, metadata_json,
    queued_at, next_dispatch_attempt_at
  ) values (
    p_automation_key, p_organisation_id, p_transaction_id, p_listing_id, p_offer_id,
    p_recipient_user_id, p_automation_key, v_category, v_trigger_type, 'email', 'queued',
    lower(trim(p_recipient_email)), lower(trim(p_recipient_email)),
    nullif(trim(coalesce(p_recipient_role, 'assigned_user')), ''),
    nullif(trim(coalesce(p_subject, '')), ''),
    left(trim(coalesce(p_message, '')), 320), 'resend',
    coalesce(nullif(trim(p_source), ''), 'client_seller_portal'),
    nullif(trim(p_dedupe_key), ''),
    nullif(trim(p_dedupe_key), ''),
    jsonb_strip_nulls(coalesce(p_payload, '{}'::jsonb) || jsonb_build_object(
      'organisationId', p_organisation_id,
      'transactionId', p_transaction_id,
      'listingId', p_listing_id,
      'offerId', p_offer_id
    )),
    jsonb_build_object(
      'phase', 'phase_5_client_seller_offer_portal_events',
      'sendEmailType', 'client_seller_portal_dispatch'
    ),
    now(), now()
  )
  on conflict (organisation_id, dedupe_key)
    where automation_key in (
      'offer_viewed_by_seller',
      'offer_not_reviewed_reminder',
      'offer_review_overdue_escalation',
      'seller_mandate_viewed_unsigned_reminder',
      'seller_mandate_signing_overdue_escalation',
      'buyer_onboarding_opened',
      'buyer_onboarding_started_not_submitted_reminder',
      'buyer_onboarding_overdue_escalation',
      'buyer_onboarding_submitted_confirmation',
      'client_portal_message_received',
      'client_portal_document_uploaded',
      'client_portal_document_rejected'
    )
    and dedupe_key is not null
  do nothing
  returning id into v_event_id;

  return v_event_id;
end;
$$;

create or replace function public.bridge_handle_offer_seller_review_notifications_phase5()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_offer public.offers%rowtype;
  v_agent record;
  v_seller record;
  v_property_label text;
  v_offer_reference text;
begin
  if not (
    (new.viewed_at is not null and (tg_op = 'INSERT' or old.viewed_at is distinct from new.viewed_at))
    or (new.status = 'viewed' and (tg_op = 'INSERT' or old.status is distinct from new.status))
  ) then
    return new;
  end if;

  select * into v_offer from public.offers where id = new.offer_id limit 1;
  if v_offer.id is null then
    return new;
  end if;

  select * into v_agent
  from public.bridge_client_seller_phase5_profile_contact(coalesce(new.agent_id, v_offer.agent_id))
  limit 1;
  select * into v_seller
  from public.bridge_client_seller_phase5_contact_label(coalesce(new.seller_contact_id, v_offer.seller_contact_id))
  limit 1;
  v_property_label := public.bridge_client_seller_phase5_listing_label(coalesce(new.listing_id, v_offer.listing_id));
  v_offer_reference := coalesce('Offer ' || trim(to_char(v_offer.offer_amount, 'FM999G999G999G990D00')), v_offer.id::text);

  perform public.bridge_queue_client_seller_portal_event_phase5(
    'offer_viewed_by_seller',
    new.organisation_id,
    v_agent.email,
    'Seller viewed an offer',
    coalesce(v_seller.name, 'The seller') || ' viewed ' || v_offer_reference || coalesce(' for ' || nullif(v_property_label, ''), '') || '.',
    'offer-viewed-by-seller:' || new.id::text,
    jsonb_strip_nulls(jsonb_build_object(
      'offerReference', v_offer_reference,
      'propertyLabel', v_property_label,
      'sellerName', v_seller.name,
      'sellerEmail', v_seller.email,
      'agentName', v_agent.name,
      'agentEmail', v_agent.email,
      'portalLabel', 'Seller Offer Review'
    )),
    'agent',
    v_agent.user_id,
    v_offer.transaction_id,
    coalesce(new.listing_id, v_offer.listing_id),
    new.offer_id,
    'offer_seller_review_sessions'
  );

  return new;
end;
$$;

drop trigger if exists trg_offer_seller_review_notifications_phase5
  on public.offer_seller_review_sessions;
create trigger trg_offer_seller_review_notifications_phase5
after insert or update on public.offer_seller_review_sessions
for each row execute function public.bridge_handle_offer_seller_review_notifications_phase5();

create or replace function public.bridge_handle_buyer_onboarding_notifications_phase5()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_transaction public.transactions%rowtype;
  v_agent record;
  v_buyer record;
  v_property_label text;
  v_reference text;
begin
  select * into v_transaction
  from public.transactions
  where id = new.transaction_id
  limit 1;
  if v_transaction.id is null then
    return new;
  end if;

  select * into v_agent
  from public.bridge_client_seller_phase5_profile_contact(coalesce(v_transaction.owner_user_id, v_transaction.assigned_user_id, v_transaction.assigned_agent_id))
  limit 1;
  select * into v_buyer
  from public.bridge_client_seller_phase5_contact_label(v_transaction.buyer_contact_id)
  limit 1;
  v_property_label := coalesce(
    public.bridge_client_seller_phase5_listing_label(v_transaction.listing_id),
    nullif(to_jsonb(v_transaction)->>'property_title', ''),
    nullif(to_jsonb(v_transaction)->>'listing_title', ''),
    ''
  );
  v_reference := coalesce(
    nullif(to_jsonb(v_transaction)->>'transaction_reference', ''),
    nullif(to_jsonb(v_transaction)->>'matter_number', ''),
    v_transaction.id::text
  );

  if new.status = 'In Progress' and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    perform public.bridge_queue_client_seller_portal_event_phase5(
      'buyer_onboarding_opened',
      v_transaction.organisation_id,
      v_agent.email,
      'Buyer opened onboarding',
      coalesce(v_buyer.name, 'The buyer') || ' opened onboarding for ' || v_reference || '.',
      'buyer-onboarding-opened:' || new.id::text,
      jsonb_strip_nulls(jsonb_build_object(
        'transactionReference', v_reference,
        'propertyLabel', v_property_label,
        'buyerName', v_buyer.name,
        'buyerEmail', v_buyer.email,
        'agentName', v_agent.name,
        'agentEmail', v_agent.email,
        'portalLabel', 'Buyer Onboarding'
      )),
      'agent',
      v_agent.user_id,
      v_transaction.id,
      v_transaction.listing_id,
      null,
      'transaction_onboarding'
    );
  end if;

  if new.submitted_at is not null and (tg_op = 'INSERT' or old.submitted_at is distinct from new.submitted_at or old.status is distinct from new.status) then
    perform public.bridge_queue_client_seller_portal_event_phase5(
      'buyer_onboarding_submitted_confirmation',
      v_transaction.organisation_id,
      v_buyer.email,
      'Your onboarding has been submitted',
      'Your onboarding for ' || v_reference || ' has been submitted.',
      'buyer-onboarding-submitted-confirmation:' || new.id::text,
      jsonb_strip_nulls(jsonb_build_object(
        'transactionReference', v_reference,
        'propertyLabel', v_property_label,
        'buyerName', v_buyer.name,
        'buyerEmail', v_buyer.email,
        'agentName', v_agent.name,
        'agentEmail', v_agent.email,
        'portalLabel', 'Buyer Onboarding'
      )),
      'buyer',
      null,
      v_transaction.id,
      v_transaction.listing_id,
      null,
      'transaction_onboarding'
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_buyer_onboarding_notifications_phase5
  on public.transaction_onboarding;
create trigger trg_buyer_onboarding_notifications_phase5
after insert or update on public.transaction_onboarding
for each row execute function public.bridge_handle_buyer_onboarding_notifications_phase5();

create or replace function public.bridge_handle_private_listing_document_notifications_phase5()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_listing public.private_listings%rowtype;
  v_requirement public.private_listing_document_requirements%rowtype;
  v_agent record;
  v_seller_email text;
  v_seller_name text;
  v_property_label text;
  v_document_title text;
begin
  if tg_op = 'UPDATE' and old.status is not distinct from new.status and old.file_url is not distinct from new.file_url and old.storage_path is not distinct from new.storage_path then
    return new;
  end if;

  select * into v_listing
  from public.private_listings
  where id = new.private_listing_id
  limit 1;
  if v_listing.id is null then
    return new;
  end if;

  select * into v_requirement
  from public.private_listing_document_requirements
  where id = new.requirement_id
  limit 1;
  select * into v_agent
  from public.bridge_client_seller_phase5_profile_contact(v_listing.assigned_agent_id)
  limit 1;
  select
    lower(nullif(trim(coalesce(onboarding.form_data->>'email', onboarding.form_data->>'sellerEmail')), '')),
    nullif(trim(coalesce(onboarding.form_data->>'fullName', onboarding.form_data->>'sellerName', onboarding.form_data->>'name')), '')
    into v_seller_email, v_seller_name
  from public.private_listing_seller_onboarding onboarding
  where onboarding.private_listing_id = new.private_listing_id
  order by onboarding.updated_at desc nulls last, onboarding.created_at desc
  limit 1;

  v_property_label := public.bridge_client_seller_phase5_listing_label(new.private_listing_id);
  v_document_title := coalesce(nullif(new.document_name, ''), nullif(v_requirement.requirement_name, ''), nullif(new.document_type, ''), 'Client document');

  if new.status in ('uploaded', 'under_review') and (tg_op = 'INSERT' or old.status is distinct from new.status or old.file_url is distinct from new.file_url or old.storage_path is distinct from new.storage_path) then
    perform public.bridge_queue_client_seller_portal_event_phase5(
      'client_portal_document_uploaded',
      v_listing.organisation_id,
      v_agent.email,
      'Client uploaded a document',
      v_document_title || coalesce(' was uploaded for ' || nullif(v_property_label, ''), ' was uploaded.'),
      'client-portal-document-uploaded:' || new.id::text || ':' || coalesce(new.updated_at, new.uploaded_at, now())::text,
      jsonb_strip_nulls(jsonb_build_object(
        'propertyLabel', v_property_label,
        'sellerName', v_seller_name,
        'sellerEmail', v_seller_email,
        'agentName', v_agent.name,
        'agentEmail', v_agent.email,
        'portalLabel', 'Seller Portal',
        'documentTitle', v_document_title,
        'documentStatus', new.status
      )),
      'assigned_user',
      v_agent.user_id,
      null,
      new.private_listing_id,
      null,
      'private_listing_documents'
    );
  elsif new.status = 'rejected' and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    perform public.bridge_queue_client_seller_portal_event_phase5(
      'client_portal_document_rejected',
      v_listing.organisation_id,
      v_seller_email,
      'Document reupload required',
      v_document_title || ' needs to be uploaded again.',
      'client-portal-document-rejected:' || new.id::text || ':' || coalesce(new.updated_at, now())::text,
      jsonb_strip_nulls(jsonb_build_object(
        'propertyLabel', v_property_label,
        'sellerName', v_seller_name,
        'sellerEmail', v_seller_email,
        'agentName', v_agent.name,
        'agentEmail', v_agent.email,
        'portalLabel', 'Seller Portal',
        'documentTitle', v_document_title,
        'documentStatus', new.status,
        'nextAction', 'Upload a corrected copy in the seller portal.'
      )),
      'seller',
      null,
      null,
      new.private_listing_id,
      null,
      'private_listing_documents'
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_private_listing_document_notifications_phase5
  on public.private_listing_documents;
create trigger trg_private_listing_document_notifications_phase5
after insert or update on public.private_listing_documents
for each row execute function public.bridge_handle_private_listing_document_notifications_phase5();

create or replace function public.bridge_queue_client_seller_portal_due_notifications_phase5(
  p_limit integer default 100,
  p_now timestamptz default now(),
  p_dry_run boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_considered integer := 0;
  v_queued integer := 0;
  v_event_id uuid;
  v_offer record;
  v_onboarding record;
begin
  for v_offer in
    select
      session.id as session_id,
      session.organisation_id,
      session.offer_id,
      session.listing_id,
      session.sent_at,
      offer.transaction_id,
      offer.offer_amount,
      seller.email as seller_email,
      seller.name as seller_name,
      agent.email as agent_email,
      agent.name as agent_name,
      agent.user_id as agent_user_id,
      public.bridge_client_seller_phase5_listing_label(coalesce(session.listing_id, offer.listing_id)) as property_label
    from public.offer_seller_review_sessions session
    join public.offers offer on offer.id = session.offer_id
    left join lateral public.bridge_client_seller_phase5_contact_label(coalesce(session.seller_contact_id, offer.seller_contact_id)) seller on true
    left join lateral public.bridge_client_seller_phase5_profile_contact(coalesce(session.agent_id, offer.agent_id)) agent on true
    where session.status in ('sent', 'viewed')
      and session.sent_at is not null
      and session.accepted_at is null
      and session.rejected_at is null
      and session.countered_at is null
    order by session.sent_at asc
    limit greatest(1, least(coalesce(p_limit, 100), 500))
  loop
    v_considered := v_considered + 1;
    if p_dry_run then
      continue;
    end if;

    if v_offer.sent_at <= p_now - interval '2 days' then
      v_event_id := public.bridge_queue_client_seller_portal_event_phase5(
        'offer_not_reviewed_reminder',
        v_offer.organisation_id,
        v_offer.seller_email,
        'Offer awaiting your review',
        'The offer for ' || coalesce(nullif(v_offer.property_label, ''), 'the property') || ' is still awaiting your review.',
        'offer-not-reviewed-reminder:' || v_offer.session_id::text || ':' || to_char(p_now, 'YYYY-MM-DD'),
        jsonb_strip_nulls(jsonb_build_object(
          'offerReference', 'Offer ' || trim(to_char(v_offer.offer_amount, 'FM999G999G999G990D00')),
          'propertyLabel', v_offer.property_label,
          'sellerName', v_offer.seller_name,
          'sellerEmail', v_offer.seller_email,
          'agentName', v_offer.agent_name,
          'agentEmail', v_offer.agent_email,
          'portalLabel', 'Seller Offer Review',
          'nextAction', 'Review and respond to the offer.'
        )),
        'seller',
        null,
        v_offer.transaction_id,
        v_offer.listing_id,
        v_offer.offer_id,
        'offer_seller_review_due_scan'
      );
      if v_event_id is not null then v_queued := v_queued + 1; end if;
    end if;

    if v_offer.sent_at <= p_now - interval '3 days' then
      v_event_id := public.bridge_queue_client_seller_portal_event_phase5(
        'offer_review_overdue_escalation',
        v_offer.organisation_id,
        v_offer.agent_email,
        'Offer review needs attention',
        'The seller has not reviewed the offer for ' || coalesce(nullif(v_offer.property_label, ''), 'the property') || ' within the expected SLA.',
        'offer-review-overdue-escalation:' || v_offer.session_id::text || ':' || to_char(p_now, 'YYYY-MM-DD'),
        jsonb_strip_nulls(jsonb_build_object(
          'offerReference', 'Offer ' || trim(to_char(v_offer.offer_amount, 'FM999G999G999G990D00')),
          'propertyLabel', v_offer.property_label,
          'sellerName', v_offer.seller_name,
          'sellerEmail', v_offer.seller_email,
          'agentName', v_offer.agent_name,
          'agentEmail', v_offer.agent_email,
          'portalLabel', 'Seller Offer Review',
          'nextAction', 'Follow up with the seller.'
        )),
        'agent',
        v_offer.agent_user_id,
        v_offer.transaction_id,
        v_offer.listing_id,
        v_offer.offer_id,
        'offer_seller_review_due_scan'
      );
      if v_event_id is not null then v_queued := v_queued + 1; end if;
    end if;
  end loop;

  for v_onboarding in
    select
      onboarding.id,
      onboarding.private_listing_id,
      onboarding.seller_portal_last_login_at,
      listing.organisation_id,
      public.bridge_client_seller_phase5_listing_label(onboarding.private_listing_id) as property_label,
      lower(nullif(trim(coalesce(onboarding.form_data->>'email', onboarding.form_data->>'sellerEmail')), '')) as seller_email,
      nullif(trim(coalesce(onboarding.form_data->>'fullName', onboarding.form_data->>'sellerName', onboarding.form_data->>'name')), '') as seller_name,
      agent.email as agent_email,
      agent.name as agent_name,
      agent.user_id as agent_user_id
    from public.private_listing_seller_onboarding onboarding
    join public.private_listings listing on listing.id = onboarding.private_listing_id
    left join lateral public.bridge_client_seller_phase5_profile_contact(listing.assigned_agent_id) agent on true
    where onboarding.seller_portal_last_login_at is not null
      and onboarding.submitted_at is null
    order by onboarding.seller_portal_last_login_at asc
    limit greatest(1, least(coalesce(p_limit, 100), 500))
  loop
    v_considered := v_considered + 1;
    if p_dry_run then
      continue;
    end if;

    if v_onboarding.seller_portal_last_login_at <= p_now - interval '1 day' then
      v_event_id := public.bridge_queue_client_seller_portal_event_phase5(
        'seller_mandate_viewed_unsigned_reminder',
        v_onboarding.organisation_id,
        v_onboarding.seller_email,
        'Seller mandate awaiting signature',
        'The seller mandate for ' || coalesce(nullif(v_onboarding.property_label, ''), 'the property') || ' is still awaiting signature.',
        'seller-mandate-viewed-unsigned-reminder:' || v_onboarding.id::text || ':' || to_char(p_now, 'YYYY-MM-DD'),
        jsonb_strip_nulls(jsonb_build_object(
          'propertyLabel', v_onboarding.property_label,
          'sellerName', v_onboarding.seller_name,
          'sellerEmail', v_onboarding.seller_email,
          'agentName', v_onboarding.agent_name,
          'agentEmail', v_onboarding.agent_email,
          'portalLabel', 'Seller Portal',
          'nextAction', 'Complete the seller mandate signature.'
        )),
        'seller',
        null,
        null,
        v_onboarding.private_listing_id,
        null,
        'seller_mandate_due_scan'
      );
      if v_event_id is not null then v_queued := v_queued + 1; end if;
    end if;

    if v_onboarding.seller_portal_last_login_at <= p_now - interval '3 days' then
      v_event_id := public.bridge_queue_client_seller_portal_event_phase5(
        'seller_mandate_signing_overdue_escalation',
        v_onboarding.organisation_id,
        v_onboarding.agent_email,
        'Seller mandate signing needs attention',
        'The seller mandate for ' || coalesce(nullif(v_onboarding.property_label, ''), 'the property') || ' is overdue for signature.',
        'seller-mandate-signing-overdue-escalation:' || v_onboarding.id::text || ':' || to_char(p_now, 'YYYY-MM-DD'),
        jsonb_strip_nulls(jsonb_build_object(
          'propertyLabel', v_onboarding.property_label,
          'sellerName', v_onboarding.seller_name,
          'sellerEmail', v_onboarding.seller_email,
          'agentName', v_onboarding.agent_name,
          'agentEmail', v_onboarding.agent_email,
          'portalLabel', 'Seller Portal',
          'nextAction', 'Follow up with the seller.'
        )),
        'agent',
        v_onboarding.agent_user_id,
        null,
        v_onboarding.private_listing_id,
        null,
        'seller_mandate_due_scan'
      );
      if v_event_id is not null then v_queued := v_queued + 1; end if;
    end if;
  end loop;

  for v_onboarding in
    select
      onboarding.id,
      onboarding.transaction_id,
      onboarding.updated_at,
      tx.organisation_id,
      tx.listing_id,
      coalesce(nullif(to_jsonb(tx)->>'transaction_reference', ''), nullif(to_jsonb(tx)->>'matter_number', ''), tx.id::text) as transaction_reference,
      coalesce(public.bridge_client_seller_phase5_listing_label(tx.listing_id), nullif(to_jsonb(tx)->>'property_title', ''), nullif(to_jsonb(tx)->>'listing_title', '')) as property_label,
      buyer.email as buyer_email,
      buyer.name as buyer_name,
      agent.email as agent_email,
      agent.name as agent_name,
      agent.user_id as agent_user_id
    from public.transaction_onboarding onboarding
    join public.transactions tx on tx.id = onboarding.transaction_id
    left join lateral public.bridge_client_seller_phase5_contact_label(tx.buyer_contact_id) buyer on true
    left join lateral public.bridge_client_seller_phase5_profile_contact(coalesce(tx.owner_user_id, tx.assigned_user_id, tx.assigned_agent_id)) agent on true
    where onboarding.status = 'In Progress'
      and onboarding.submitted_at is null
      and onboarding.updated_at <= p_now - interval '1 day'
    order by onboarding.updated_at asc
    limit greatest(1, least(coalesce(p_limit, 100), 500))
  loop
    v_considered := v_considered + 1;
    if p_dry_run then
      continue;
    end if;

    v_event_id := public.bridge_queue_client_seller_portal_event_phase5(
      'buyer_onboarding_started_not_submitted_reminder',
      v_onboarding.organisation_id,
      v_onboarding.buyer_email,
      'Buyer onboarding awaiting submission',
      'Your onboarding for ' || v_onboarding.transaction_reference || ' has been started but not submitted.',
      'buyer-onboarding-started-not-submitted-reminder:' || v_onboarding.id::text || ':' || to_char(p_now, 'YYYY-MM-DD'),
      jsonb_strip_nulls(jsonb_build_object(
        'transactionReference', v_onboarding.transaction_reference,
        'propertyLabel', v_onboarding.property_label,
        'buyerName', v_onboarding.buyer_name,
        'buyerEmail', v_onboarding.buyer_email,
        'agentName', v_onboarding.agent_name,
        'agentEmail', v_onboarding.agent_email,
        'portalLabel', 'Buyer Onboarding',
        'nextAction', 'Complete and submit onboarding.'
      )),
      'buyer',
      null,
      v_onboarding.transaction_id,
      v_onboarding.listing_id,
      null,
      'buyer_onboarding_due_scan'
    );
    if v_event_id is not null then v_queued := v_queued + 1; end if;

    if v_onboarding.updated_at <= p_now - interval '2 days' then
      v_event_id := public.bridge_queue_client_seller_portal_event_phase5(
        'buyer_onboarding_overdue_escalation',
        v_onboarding.organisation_id,
        v_onboarding.agent_email,
        'Buyer onboarding needs attention',
        'Buyer onboarding for ' || v_onboarding.transaction_reference || ' is overdue and needs follow-up.',
        'buyer-onboarding-overdue-escalation:' || v_onboarding.id::text || ':' || to_char(p_now, 'YYYY-MM-DD'),
        jsonb_strip_nulls(jsonb_build_object(
          'transactionReference', v_onboarding.transaction_reference,
          'propertyLabel', v_onboarding.property_label,
          'buyerName', v_onboarding.buyer_name,
          'buyerEmail', v_onboarding.buyer_email,
          'agentName', v_onboarding.agent_name,
          'agentEmail', v_onboarding.agent_email,
          'portalLabel', 'Buyer Onboarding',
          'nextAction', 'Follow up with the buyer.'
        )),
        'agent',
        v_onboarding.agent_user_id,
        v_onboarding.transaction_id,
        v_onboarding.listing_id,
        null,
        'buyer_onboarding_due_scan'
      );
      if v_event_id is not null then v_queued := v_queued + 1; end if;
    end if;
  end loop;

  return jsonb_build_object(
    'success', true,
    'phase', 'phase_5_client_seller_offer_portal_events',
    'considered', v_considered,
    'queued', v_queued,
    'dryRun', p_dry_run
  );
end;
$$;

create or replace function public.bridge_claim_client_seller_portal_notifications_phase5(
  p_transaction_id uuid default null,
  p_event_id uuid default null,
  p_limit integer default 25
)
returns setof public.notification_events
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  with claimable as (
    select event.id
    from public.notification_events event
    where event.automation_key in (
        'offer_viewed_by_seller',
        'offer_not_reviewed_reminder',
        'offer_review_overdue_escalation',
        'seller_mandate_viewed_unsigned_reminder',
        'seller_mandate_signing_overdue_escalation',
        'buyer_onboarding_opened',
        'buyer_onboarding_started_not_submitted_reminder',
        'buyer_onboarding_overdue_escalation',
        'buyer_onboarding_submitted_confirmation',
        'client_portal_message_received',
        'client_portal_document_uploaded',
        'client_portal_document_rejected'
      )
      and event.channel = 'email'
      and event.status in ('queued', 'failed')
      and coalesce(event.dispatch_attempt_count, 0) < coalesce(event.max_dispatch_attempts, 5)
      and coalesce(event.next_dispatch_attempt_at, now()) <= now()
      and (p_transaction_id is null or event.transaction_id = p_transaction_id)
      and (p_event_id is null or event.id = p_event_id)
    order by event.queued_at asc nulls last, event.created_at asc
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 25), 100))
  )
  update public.notification_events event
  set status = 'processing',
      dispatch_attempt_count = coalesce(event.dispatch_attempt_count, 0) + 1,
      last_dispatch_attempt_at = now(),
      last_dispatch_error = null
  from claimable
  where event.id = claimable.id
  returning event.*;
end;
$$;

revoke all on function public.bridge_queue_client_seller_portal_event_phase5(text, uuid, text, text, text, text, jsonb, text, uuid, uuid, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.bridge_queue_client_seller_portal_due_notifications_phase5(integer, timestamptz, boolean) from public, anon, authenticated;
revoke all on function public.bridge_claim_client_seller_portal_notifications_phase5(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.bridge_queue_client_seller_portal_event_phase5(text, uuid, text, text, text, text, jsonb, text, uuid, uuid, uuid, uuid, text) to authenticated, service_role;
grant execute on function public.bridge_queue_client_seller_portal_due_notifications_phase5(integer, timestamptz, boolean) to service_role;
grant execute on function public.bridge_claim_client_seller_portal_notifications_phase5(uuid, uuid, integer) to service_role;

comment on function public.bridge_queue_client_seller_portal_event_phase5(text, uuid, text, text, text, text, jsonb, text, uuid, uuid, uuid, uuid, text) is
  'Phase 5 queues branded client, seller, offer and portal notification email events. Use this from portal message creation paths.';
comment on function public.bridge_queue_client_seller_portal_due_notifications_phase5(integer, timestamptz, boolean) is
  'Phase 5 queues due offer review, seller mandate and buyer onboarding follow-up email events.';
comment on function public.bridge_claim_client_seller_portal_notifications_phase5(uuid, uuid, integer) is
  'Phase 5 claims queued client/seller/offer/portal notification_events for the send-email dispatcher.';

notify pgrst, 'reload schema';
commit;
