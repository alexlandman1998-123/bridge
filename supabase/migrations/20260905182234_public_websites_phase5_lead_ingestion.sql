begin;

alter table public.website_lead_submissions
  add column if not exists contact_id uuid references public.contacts(contact_id) on delete set null,
  add column if not exists request_fingerprint text,
  add column if not exists consent_json jsonb not null default '{}'::jsonb,
  add column if not exists routing_json jsonb not null default '{}'::jsonb,
  add column if not exists notification_status text not null default 'pending',
  add column if not exists notification_event_id uuid references public.notification_events(id) on delete set null,
  add column if not exists fallback_notification_event_id uuid references public.notification_events(id) on delete set null,
  add column if not exists updated_at timestamptz not null default now();

alter table public.website_lead_submissions
  drop constraint if exists website_lead_submissions_status_check,
  drop constraint if exists website_lead_submissions_notification_status_check,
  drop constraint if exists website_lead_submissions_consent_object_check,
  drop constraint if exists website_lead_submissions_routing_object_check,
  add constraint website_lead_submissions_status_check
    check (status in ('received', 'routed', 'duplicate', 'blocked', 'failed')),
  add constraint website_lead_submissions_notification_status_check
    check (notification_status in ('pending', 'sent', 'fallback_sent', 'failed', 'skipped')),
  add constraint website_lead_submissions_consent_object_check
    check (jsonb_typeof(consent_json) = 'object'),
  add constraint website_lead_submissions_routing_object_check
    check (jsonb_typeof(routing_json) = 'object'),
  add constraint website_lead_submissions_fingerprint_check
    check (request_fingerprint is null or request_fingerprint ~ '^[a-f0-9]{64}$');

create index if not exists website_lead_submissions_fingerprint_created_idx
  on public.website_lead_submissions (website_site_id, request_fingerprint, created_at desc)
  where request_fingerprint is not null;

drop trigger if exists trg_website_lead_submissions_updated_at on public.website_lead_submissions;
create trigger trg_website_lead_submissions_updated_at
before update on public.website_lead_submissions
for each row execute function public.set_updated_at_timestamp();

insert into public.notification_automation_definitions (
  automation_key, display_name, category, trigger_type, recipient_role,
  channels, implementation_status, default_enabled, dedupe_strategy,
  reminder_policy, metadata_json
)
values (
  'website_lead_received', 'Website lead received', 'notification', 'system_event', 'agent',
  array['email']::text[], 'active', true, 'website_submission_recipient_once',
  '{}'::jsonb, '{"phase":"public_websites_phase5","source":"agency_website"}'::jsonb
)
on conflict (automation_key) do update
set display_name = excluded.display_name,
    category = excluded.category,
    trigger_type = excluded.trigger_type,
    recipient_role = excluded.recipient_role,
    channels = excluded.channels,
    implementation_status = excluded.implementation_status,
    default_enabled = excluded.default_enabled,
    dedupe_strategy = excluded.dedupe_strategy,
    metadata_json = excluded.metadata_json,
    updated_at = now();

create or replace function public.website_capture_lead_submission(
  p_hostname text,
  p_submission_type text,
  p_listing_id uuid,
  p_page_id uuid,
  p_name text,
  p_email text,
  p_phone text,
  p_message text,
  p_privacy_accepted boolean,
  p_marketing_consent boolean,
  p_idempotency_key text,
  p_request_fingerprint text,
  p_attribution jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_hostname text := pg_catalog.lower(trim(coalesce(p_hostname, '')));
  v_type text := pg_catalog.lower(trim(coalesce(p_submission_type, '')));
  v_name text := pg_catalog.left(trim(coalesce(p_name, '')), 160);
  v_email text := nullif(pg_catalog.lower(pg_catalog.left(trim(coalesce(p_email, '')), 254)), '');
  v_phone text := nullif(pg_catalog.left(trim(coalesce(p_phone, '')), 64), '');
  v_phone_digits text;
  v_message text := nullif(pg_catalog.left(trim(coalesce(p_message, '')), 4000), '');
  v_key text := trim(coalesce(p_idempotency_key, ''));
  v_fingerprint text := nullif(pg_catalog.lower(trim(coalesce(p_request_fingerprint, ''))), '');
  v_attribution jsonb;
  v_site public.website_sites%rowtype;
  v_existing public.website_lead_submissions%rowtype;
  v_receipt_id uuid;
  v_contact_id uuid;
  v_lead_id uuid;
  v_page public.website_pages%rowtype;
  v_listing public.private_listings%rowtype;
  v_publication public.listing_publication_data%rowtype;
  v_first_name text;
  v_last_name text;
  v_assignee_id uuid;
  v_assignee_email text;
  v_assignee_name text;
  v_assignee_branch_id uuid;
  v_manager_id uuid;
  v_manager_email text;
  v_manager_name text;
  v_recipient_id uuid;
  v_recipient_email text;
  v_recipient_name text;
  v_recipient_role text;
  v_event_kind text;
  v_event_id uuid;
  v_routing jsonb;
  v_payload jsonb;
  v_campaign_code text;
  v_property_label text;
begin
  v_hostname := pg_catalog.regexp_replace(v_hostname, ':\d+$', '');
  v_hostname := pg_catalog.regexp_replace(v_hostname, '\.$', '');
  v_phone_digits := nullif(pg_catalog.regexp_replace(coalesce(v_phone, ''), '[^0-9]+', '', 'g'), '');

  if v_type not in ('property_enquiry', 'general_enquiry', 'valuation_request', 'campaign_enquiry') then
    raise exception 'Unsupported enquiry type.' using errcode = '22023';
  end if;
  if pg_catalog.char_length(v_name) < 2 then
    raise exception 'Name is required.' using errcode = '22023';
  end if;
  if v_email is null and v_phone_digits is null then
    raise exception 'Email or phone is required.' using errcode = '22023';
  end if;
  if v_email is not null and v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Email is invalid.' using errcode = '22023';
  end if;
  if v_phone_digits is not null and pg_catalog.char_length(v_phone_digits) < 7 then
    raise exception 'Phone is invalid.' using errcode = '22023';
  end if;
  if p_privacy_accepted is not true then
    raise exception 'Privacy consent is required.' using errcode = '22023';
  end if;
  if v_key !~ '^[A-Za-z0-9._:-]{16,128}$' then
    raise exception 'Idempotency key is invalid.' using errcode = '22023';
  end if;
  if v_fingerprint is not null and v_fingerprint !~ '^[a-f0-9]{64}$' then
    raise exception 'Request fingerprint is invalid.' using errcode = '22023';
  end if;

  select site.* into v_site
  from public.website_domains domain
  join public.website_sites site on site.id = domain.website_site_id
  where pg_catalog.lower(domain.hostname) = v_hostname
    and domain.status = 'active'
    and site.status = 'published'
  order by domain.is_primary desc, domain.created_at
  limit 1;

  if v_site.id is null then
    raise exception 'Published website not found.' using errcode = 'P0002';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_site.id::text || ':' || v_key, 0)
  );

  select submission.* into v_existing
  from public.website_lead_submissions submission
  where submission.website_site_id = v_site.id
    and submission.idempotency_key = v_key;

  if v_existing.id is not null then
    return pg_catalog.jsonb_build_object(
      'accepted', v_existing.status = 'routed',
      'duplicate', true,
      'rateLimited', v_existing.status = 'blocked',
      'receiptId', v_existing.id,
      'leadId', v_existing.lead_id,
      'notificationEventId', v_existing.notification_event_id
    ) || coalesce(v_existing.routing_json, '{}'::jsonb);
  end if;

  v_attribution := pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
    'pagePath', nullif(pg_catalog.left(coalesce(p_attribution ->> 'pagePath', ''), 2048), ''),
    'referrer', nullif(pg_catalog.left(coalesce(p_attribution ->> 'referrer', ''), 2048), ''),
    'utmSource', nullif(pg_catalog.left(coalesce(p_attribution ->> 'utmSource', ''), 160), ''),
    'utmMedium', nullif(pg_catalog.left(coalesce(p_attribution ->> 'utmMedium', ''), 160), ''),
    'utmCampaign', nullif(pg_catalog.left(coalesce(p_attribution ->> 'utmCampaign', ''), 160), ''),
    'utmTerm', nullif(pg_catalog.left(coalesce(p_attribution ->> 'utmTerm', ''), 160), ''),
    'utmContent', nullif(pg_catalog.left(coalesce(p_attribution ->> 'utmContent', ''), 160), ''),
    'userAgent', nullif(pg_catalog.left(coalesce(p_attribution ->> 'userAgent', ''), 512), '')
  ));

  if v_fingerprint is not null and (
    select pg_catalog.count(*)
    from public.website_lead_submissions recent
    where recent.website_site_id = v_site.id
      and recent.request_fingerprint = v_fingerprint
      and recent.created_at >= v_now - interval '10 minutes'
  ) >= 5 then
    insert into public.website_lead_submissions (
      website_site_id, organisation_id, listing_id, page_id, submission_type,
      idempotency_key, payload_json, attribution_json, request_fingerprint,
      consent_json, routing_json, status, failure_reason, notification_status
    ) values (
      v_site.id, v_site.organisation_id, null, null, v_type,
      v_key, pg_catalog.jsonb_build_object('name', v_name), v_attribution, v_fingerprint,
      pg_catalog.jsonb_build_object('privacyAccepted', true, 'marketingConsent', p_marketing_consent is true, 'acceptedAt', v_now),
      pg_catalog.jsonb_build_object('reason', 'rate_limit'), 'blocked', 'Submission rate exceeded.', 'skipped'
    ) returning id into v_receipt_id;
    return pg_catalog.jsonb_build_object('accepted', false, 'duplicate', false, 'rateLimited', true, 'receiptId', v_receipt_id);
  end if;

  if v_type = 'property_enquiry' then
    if p_listing_id is null or p_page_id is not null then
      raise exception 'A property enquiry must identify one listing.' using errcode = '22023';
    end if;

    select listing.* into v_listing
    from public.website_listing_publications channel
    join public.private_listings listing on listing.id = channel.listing_id
    join public.listing_publication_data publication on publication.listing_id = listing.id
    where channel.website_site_id = v_site.id
      and channel.listing_id = p_listing_id
      and channel.status = 'published'
      and listing.organisation_id = v_site.organisation_id
      and publication.status = 'Published';

    if v_listing.id is null then
      raise exception 'Published website listing not found.' using errcode = 'P0002';
    end if;
    select publication.* into v_publication
    from public.listing_publication_data publication
    where publication.listing_id = v_listing.id;
    v_property_label := coalesce(nullif(trim(v_publication.title), ''), 'Property enquiry');
  else
    if p_listing_id is not null or p_page_id is null then
      raise exception 'A page enquiry must identify one page.' using errcode = '22023';
    end if;

    select page.* into v_page
    from public.website_pages page
    join public.website_site_revisions revision on revision.id = page.revision_id
    where page.id = p_page_id
      and page.website_site_id = v_site.id
      and revision.website_site_id = v_site.id
      and revision.status = 'published';

    if v_page.id is null then
      raise exception 'Published website page not found.' using errcode = 'P0002';
    end if;
    if (v_type = 'campaign_enquiry' and v_page.page_kind <> 'campaign')
      or (v_type = 'valuation_request' and v_page.page_kind <> 'valuation')
      or (v_type = 'general_enquiry' and v_page.page_kind not in ('home', 'about', 'contact')) then
      raise exception 'Enquiry type does not match the published page.' using errcode = '22023';
    end if;
    if v_page.page_kind = 'campaign' then
      v_campaign_code := pg_catalog.left(v_page.slug, 80);
    end if;
  end if;

  if v_listing.assigned_agent_id is not null then
    select member.user_id,
           pg_catalog.lower(trim(member.email)),
           nullif(trim(pg_catalog.concat_ws(' ', member.first_name, member.last_name)), ''),
           member.branch_id
    into v_assignee_id, v_assignee_email, v_assignee_name, v_assignee_branch_id
    from public.organisation_users member
    where member.organisation_id = v_site.organisation_id
      and member.user_id = v_listing.assigned_agent_id
      and member.status = 'active'
      and member.role in ('agent', 'branch_manager', 'admin', 'principal', 'super_admin')
    order by member.updated_at desc
    limit 1;
  end if;

  select member.user_id,
         pg_catalog.lower(trim(member.email)),
         nullif(trim(pg_catalog.concat_ws(' ', member.first_name, member.last_name)), '')
  into v_manager_id, v_manager_email, v_manager_name
  from public.organisation_users member
  where member.organisation_id = v_site.organisation_id
    and member.status = 'active'
    and member.user_id is not null
    and nullif(trim(member.email), '') is not null
    and member.role in ('principal', 'admin', 'branch_manager', 'super_admin')
  order by case member.role when 'principal' then 0 when 'admin' then 1 when 'branch_manager' then 2 else 3 end,
           member.is_primary_owner desc,
           member.updated_at desc
  limit 1;

  if v_assignee_id is not null and v_assignee_email is not null then
    v_recipient_id := v_assignee_id;
    v_recipient_email := v_assignee_email;
    v_recipient_name := v_assignee_name;
    v_recipient_role := 'agent';
    v_event_kind := 'new_enquiry_assigned_agent';
  else
    v_recipient_id := v_manager_id;
    v_recipient_email := v_manager_email;
    v_recipient_name := v_manager_name;
    v_recipient_role := 'manager';
    v_event_kind := 'new_enquiry_unassigned_manager';
  end if;

  v_routing := pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
    'assignedUserId', v_assignee_id,
    'assignedEmail', v_assignee_email,
    'assignedName', v_assignee_name,
    'recipientUserId', v_recipient_id,
    'recipientEmail', v_recipient_email,
    'recipientName', v_recipient_name,
    'recipientRole', v_recipient_role,
    'eventKind', v_event_kind,
    'fallbackUserId', case when v_assignee_id is not null then v_manager_id else null end,
    'fallbackEmail', case when v_assignee_id is not null and v_manager_email is distinct from v_assignee_email then v_manager_email else null end,
    'fallbackName', case when v_assignee_id is not null and v_manager_email is distinct from v_assignee_email then v_manager_name else null end
  ));
  v_payload := pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
    'name', v_name, 'email', v_email, 'phone', v_phone, 'message', v_message,
    'privacyAccepted', true, 'marketingConsent', p_marketing_consent is true,
    'pageId', p_page_id, 'listingId', p_listing_id
  ));

  insert into public.website_lead_submissions (
    website_site_id, organisation_id, listing_id, page_id, submission_type,
    idempotency_key, payload_json, attribution_json, request_fingerprint,
    consent_json, routing_json, status, notification_status
  ) values (
    v_site.id, v_site.organisation_id, p_listing_id, p_page_id, v_type,
    v_key, v_payload, v_attribution, v_fingerprint,
    pg_catalog.jsonb_build_object('privacyAccepted', true, 'marketingConsent', p_marketing_consent is true, 'acceptedAt', v_now),
    v_routing, 'received', case when v_recipient_email is null then 'skipped' else 'pending' end
  ) returning id into v_receipt_id;

  v_first_name := pg_catalog.split_part(v_name, ' ', 1);
  v_last_name := nullif(trim(pg_catalog.substr(v_name, pg_catalog.char_length(v_first_name) + 1)), '');

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_site.organisation_id::text || ':' || coalesce(v_email, '') || ':' || coalesce(v_phone_digits, ''), 0)
  );

  select contact.contact_id into v_contact_id
  from public.contacts contact
  where contact.organisation_id = v_site.organisation_id
    and ((v_email is not null and pg_catalog.lower(trim(contact.email)) = v_email)
      or (v_phone_digits is not null and pg_catalog.regexp_replace(coalesce(contact.phone, ''), '[^0-9]+', '', 'g') = v_phone_digits))
  order by case when v_email is not null and pg_catalog.lower(trim(contact.email)) = v_email then 0 else 1 end,
           contact.updated_at desc nulls last, contact.created_at desc
  limit 1;

  if v_contact_id is null then
    insert into public.contacts (
      organisation_id, assigned_agent_id, first_name, last_name, email, phone, contact_type, notes
    ) values (
      v_site.organisation_id, v_assignee_id, v_first_name, v_last_name, v_email, v_phone,
      case when v_type = 'valuation_request' then 'seller' else 'buyer' end, v_message
    ) returning contact_id into v_contact_id;
  else
    update public.contacts
    set email = coalesce(email, v_email),
        phone = coalesce(phone, v_phone),
        assigned_agent_id = coalesce(assigned_agent_id, v_assignee_id),
        updated_at = v_now
    where contact_id = v_contact_id;
  end if;

  insert into public.leads (
    organisation_id, branch_id, assigned_agent_id, assigned_user_id, assigned_agent_email,
    contact_id, lead_domain, lead_category, lead_direction, lead_source, source_channel,
    campaign_code, stage, status, priority, ownership_status, assigned_at, sla_due_at,
    listing_id, enquired_listing_id, enquired_property_title, enquired_property_address,
    enquired_property_price, source_reference_id, raw_enquiry_payload, notes
  ) values (
    v_site.organisation_id, v_assignee_branch_id, v_assignee_id, v_assignee_id, v_assignee_email,
    v_contact_id, 'agency', case when v_type = 'valuation_request' then 'seller' else 'buyer' end,
    'Inbound', 'Website', 'website', v_campaign_code, 'New Lead', 'New Lead', 'High',
    case when v_assignee_id is null then 'awaiting_assignment' else 'assigned' end,
    case when v_assignee_id is null then null else v_now end, v_now + interval '15 minutes',
    p_listing_id, p_listing_id, v_publication.title, v_publication.address,
    v_publication.asking_price, v_key,
    v_payload || pg_catalog.jsonb_build_object('attribution', v_attribution, 'websiteSubmissionId', v_receipt_id),
    v_message
  ) returning lead_id into v_lead_id;

  insert into public.lead_activities (
    organisation_id, lead_id, agent_id, activity_type, activity_note, activity_date, outcome
  ) values (
    v_site.organisation_id, v_lead_id, v_assignee_id, 'Lead Created',
    'Agency website enquiry received', v_now, 'New'
  );

  if v_recipient_email is not null then
    insert into public.notification_events (
      automation_key, organisation_id, branch_id, assigned_user_id, lead_id, listing_id,
      event_key, category, trigger_type, channel, status, recipient_email, recipient_role,
      subject, message_preview, source, dedupe_key, payload_json, metadata_json,
      prepared_at, queued_at
    ) values (
      'website_lead_received', v_site.organisation_id, v_assignee_branch_id, v_recipient_id, v_lead_id, p_listing_id,
      v_event_kind, 'notification', 'system_event', 'email', 'queued', v_recipient_email, v_recipient_role,
      case when v_event_kind = 'new_enquiry_assigned_agent' then 'New enquiry assigned to you' else 'New enquiry needs assignment' end,
      v_name || ' submitted an enquiry through the agency website.', 'agency_website',
      'website-lead:' || v_receipt_id::text || ':primary',
      pg_catalog.jsonb_build_object('eventKind', v_event_kind, 'recipientName', v_recipient_name, 'leadName', v_name,
        'leadEmail', v_email, 'leadPhone', v_phone, 'leadSource', 'Website', 'leadCategory', case when v_type = 'valuation_request' then 'seller' else 'buyer' end,
        'leadStatus', 'New Lead', 'propertyLabel', v_property_label),
      pg_catalog.jsonb_build_object('websiteSubmissionId', v_receipt_id, 'fallbackEmail', v_routing ->> 'fallbackEmail'),
      v_now, v_now
    ) returning id into v_event_id;
  end if;

  update public.website_lead_submissions
  set contact_id = v_contact_id,
      lead_id = v_lead_id,
      notification_event_id = v_event_id,
      status = 'routed',
      routed_at = v_now
  where id = v_receipt_id;

  return pg_catalog.jsonb_build_object(
    'accepted', true, 'duplicate', false, 'rateLimited', false,
    'receiptId', v_receipt_id, 'leadId', v_lead_id,
    'notificationEventId', v_event_id,
    'organisationId', v_site.organisation_id,
    'propertyLabel', v_property_label,
    'leadName', v_name, 'leadEmail', v_email, 'leadPhone', v_phone,
    'leadCategory', case when v_type = 'valuation_request' then 'seller' else 'buyer' end
  ) || v_routing;
end;
$$;

create or replace function public.website_complete_lead_notification(
  p_receipt_id uuid,
  p_notification_event_id uuid,
  p_delivery_status text,
  p_provider_message_id text default null,
  p_error_message text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_receipt public.website_lead_submissions%rowtype;
  v_status text := pg_catalog.lower(trim(coalesce(p_delivery_status, '')));
  v_is_fallback boolean;
begin
  if v_status not in ('sent', 'failed', 'skipped') then
    raise exception 'Unsupported delivery status.' using errcode = '22023';
  end if;

  select submission.* into v_receipt
  from public.website_lead_submissions submission
  where submission.id = p_receipt_id
  for update;

  v_is_fallback := v_receipt.fallback_notification_event_id = p_notification_event_id;
  if v_receipt.id is null or (v_receipt.notification_event_id is distinct from p_notification_event_id and not v_is_fallback) then
    raise exception 'Notification does not belong to the website submission.' using errcode = '42501';
  end if;

  update public.notification_events
  set status = v_status,
      provider = case when v_status = 'sent' then 'resend' else provider end,
      provider_message_id = nullif(pg_catalog.left(coalesce(p_provider_message_id, ''), 500), ''),
      error_message = nullif(pg_catalog.left(coalesce(p_error_message, ''), 1000), ''),
      sent_at = case when v_status = 'sent' then pg_catalog.clock_timestamp() else sent_at end,
      failed_at = case when v_status = 'failed' then pg_catalog.clock_timestamp() else failed_at end,
      updated_at = pg_catalog.clock_timestamp()
  where id = p_notification_event_id;

  update public.website_lead_submissions
  set notification_status = case
        when v_status = 'sent' and v_is_fallback then 'fallback_sent'
        when v_status = 'sent' then 'sent'
        when v_status = 'skipped' then 'skipped'
        else 'failed'
      end,
      failure_reason = case when v_status = 'failed' then nullif(pg_catalog.left(coalesce(p_error_message, ''), 500), '') else failure_reason end
  where id = p_receipt_id;

  return pg_catalog.jsonb_build_object('recorded', true, 'fallback', v_is_fallback, 'status', v_status);
end;
$$;

create or replace function public.website_prepare_lead_notification_fallback(
  p_receipt_id uuid,
  p_error_message text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_receipt public.website_lead_submissions%rowtype;
  v_email text;
  v_name text;
  v_user_id uuid;
  v_event_id uuid;
  v_primary public.notification_events%rowtype;
begin
  select submission.* into v_receipt
  from public.website_lead_submissions submission
  where submission.id = p_receipt_id
  for update;

  if v_receipt.id is null then
    raise exception 'Website submission not found.' using errcode = 'P0002';
  end if;
  if v_receipt.fallback_notification_event_id is not null then
    select event.* into v_primary from public.notification_events event where event.id = v_receipt.fallback_notification_event_id;
    return pg_catalog.jsonb_build_object('available', true, 'notificationEventId', v_primary.id,
      'recipientEmail', v_primary.recipient_email, 'recipientName', v_receipt.routing_json ->> 'fallbackName',
      'eventKind', 'new_enquiry_unassigned_manager');
  end if;

  update public.notification_events
  set status = 'failed', error_message = nullif(pg_catalog.left(coalesce(p_error_message, ''), 1000), ''),
      failed_at = pg_catalog.clock_timestamp(), updated_at = pg_catalog.clock_timestamp()
  where id = v_receipt.notification_event_id;

  v_email := nullif(pg_catalog.lower(trim(v_receipt.routing_json ->> 'fallbackEmail')), '');
  v_name := nullif(trim(v_receipt.routing_json ->> 'fallbackName'), '');
  v_user_id := nullif(v_receipt.routing_json ->> 'fallbackUserId', '')::uuid;
  if v_email is null then
    update public.website_lead_submissions
    set notification_status = 'failed', failure_reason = nullif(pg_catalog.left(coalesce(p_error_message, ''), 500), '')
    where id = v_receipt.id;
    return pg_catalog.jsonb_build_object('available', false);
  end if;

  select event.* into v_primary from public.notification_events event where event.id = v_receipt.notification_event_id;
  insert into public.notification_events (
    automation_key, organisation_id, branch_id, assigned_user_id, lead_id, listing_id,
    event_key, category, trigger_type, channel, status, recipient_email, recipient_role,
    subject, message_preview, source, dedupe_key, payload_json, metadata_json,
    prepared_at, queued_at
  ) values (
    'website_lead_received', v_receipt.organisation_id, v_primary.branch_id, v_user_id, v_receipt.lead_id, v_receipt.listing_id,
    'new_enquiry_unassigned_manager', 'notification', 'system_event', 'email', 'queued', v_email, 'manager',
    'New enquiry needs attention', 'An assigned-agent website notification failed and needs manager follow-up.',
    'agency_website', 'website-lead:' || v_receipt.id::text || ':fallback',
    coalesce(v_primary.payload_json, '{}'::jsonb) || pg_catalog.jsonb_build_object('eventKind', 'new_enquiry_unassigned_manager', 'recipientName', v_name),
    pg_catalog.jsonb_build_object('websiteSubmissionId', v_receipt.id, 'fallbackForEventId', v_receipt.notification_event_id),
    pg_catalog.clock_timestamp(), pg_catalog.clock_timestamp()
  ) returning id into v_event_id;

  update public.website_lead_submissions
  set fallback_notification_event_id = v_event_id,
      notification_status = 'pending',
      failure_reason = nullif(pg_catalog.left(coalesce(p_error_message, ''), 500), '')
  where id = v_receipt.id;

  return pg_catalog.jsonb_build_object('available', true, 'notificationEventId', v_event_id,
    'recipientEmail', v_email, 'recipientName', v_name, 'eventKind', 'new_enquiry_unassigned_manager');
end;
$$;

revoke all on table public.website_lead_submissions from public, anon, authenticated;
grant select, insert, update, delete on table public.website_lead_submissions to service_role;

revoke all on function public.website_capture_lead_submission(text,text,uuid,uuid,text,text,text,text,boolean,boolean,text,text,jsonb)
  from public, anon, authenticated;
revoke all on function public.website_complete_lead_notification(uuid,uuid,text,text,text)
  from public, anon, authenticated;
revoke all on function public.website_prepare_lead_notification_fallback(uuid,text)
  from public, anon, authenticated;
grant execute on function public.website_capture_lead_submission(text,text,uuid,uuid,text,text,text,text,boolean,boolean,text,text,jsonb)
  to service_role;
grant execute on function public.website_complete_lead_notification(uuid,uuid,text,text,text)
  to service_role;
grant execute on function public.website_prepare_lead_notification_fallback(uuid,text)
  to service_role;

comment on function public.website_capture_lead_submission(text,text,uuid,uuid,text,text,text,text,boolean,boolean,text,text,jsonb) is
  'Service-role-only, tenant-resolving and atomic website-to-CRM lead ingestion command.';
comment on column public.website_lead_submissions.request_fingerprint is
  'HMAC-SHA256 abuse-control fingerprint. Raw visitor IP addresses are never stored.';
comment on column public.website_lead_submissions.routing_json is
  'Immutable routing decision and manager fallback data captured with the CRM lead.';

commit;
