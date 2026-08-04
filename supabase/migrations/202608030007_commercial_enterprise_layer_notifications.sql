begin;

insert into public.notification_automation_definitions (
  automation_key, display_name, category, trigger_type, recipient_role,
  channels, implementation_status, default_enabled, dedupe_strategy,
  reminder_policy, metadata_json
) values
  ('agency_public_intake_received', 'Agency public intake received', 'notification', 'system_event', 'agent', array['email']::text[], 'active', true, 'commercial_enterprise_event_recipient', '{}'::jsonb, '{"phase":"phase_8_commercial_enterprise_layer"}'::jsonb),
  ('commercial_access_requested', 'Commercial access requested', 'notification', 'system_event', 'principal', array['email']::text[], 'active', true, 'commercial_enterprise_event_recipient', '{}'::jsonb, '{"phase":"phase_8_commercial_enterprise_layer"}'::jsonb),
  ('commercial_access_decision', 'Commercial access decision', 'notification', 'system_event', 'requester', array['email']::text[], 'active', true, 'commercial_enterprise_event_recipient', '{}'::jsonb, '{"phase":"phase_8_commercial_enterprise_layer"}'::jsonb),
  ('commercial_broker_assigned', 'Commercial broker assigned', 'notification', 'system_event', 'commercial_broker', array['email']::text[], 'active', true, 'commercial_enterprise_event_recipient', '{}'::jsonb, '{"phase":"phase_8_commercial_enterprise_layer"}'::jsonb),
  ('commercial_canvassing_prospect_created', 'Commercial canvassing prospect created', 'notification', 'system_event', 'commercial_broker', array['email']::text[], 'active', true, 'commercial_enterprise_event_recipient', '{}'::jsonb, '{"phase":"phase_8_commercial_enterprise_layer"}'::jsonb),
  ('commercial_requirement_created', 'Commercial requirement created', 'notification', 'system_event', 'commercial_broker', array['email']::text[], 'active', true, 'commercial_enterprise_event_recipient', '{}'::jsonb, '{"phase":"phase_8_commercial_enterprise_layer"}'::jsonb),
  ('commercial_requirement_stage_changed', 'Commercial requirement stage changed', 'notification', 'system_event', 'commercial_broker', array['email']::text[], 'active', true, 'commercial_enterprise_event_recipient', '{}'::jsonb, '{"phase":"phase_8_commercial_enterprise_layer"}'::jsonb),
  ('commercial_deal_created', 'Commercial deal created', 'notification', 'system_event', 'commercial_broker', array['email']::text[], 'active', true, 'commercial_enterprise_event_recipient', '{}'::jsonb, '{"phase":"phase_8_commercial_enterprise_layer"}'::jsonb),
  ('commercial_deal_stage_changed', 'Commercial deal stage changed', 'notification', 'system_event', 'commercial_broker', array['email']::text[], 'active', true, 'commercial_enterprise_event_recipient', '{}'::jsonb, '{"phase":"phase_8_commercial_enterprise_layer"}'::jsonb),
  ('commercial_viewing_scheduled', 'Commercial viewing scheduled', 'notification', 'system_event', 'commercial_broker', array['email']::text[], 'active', true, 'commercial_enterprise_event_recipient', '{}'::jsonb, '{"phase":"phase_8_commercial_enterprise_layer"}'::jsonb),
  ('commercial_viewing_status_changed', 'Commercial viewing status changed', 'notification', 'system_event', 'commercial_broker', array['email']::text[], 'active', true, 'commercial_enterprise_event_recipient', '{}'::jsonb, '{"phase":"phase_8_commercial_enterprise_layer"}'::jsonb),
  ('commercial_document_request_created', 'Commercial document request created', 'notification', 'system_event', 'commercial_broker', array['email']::text[], 'active', true, 'commercial_enterprise_event_recipient', '{}'::jsonb, '{"phase":"phase_8_commercial_enterprise_layer"}'::jsonb),
  ('commercial_document_uploaded', 'Commercial document uploaded', 'notification', 'system_event', 'commercial_broker', array['email']::text[], 'active', true, 'commercial_enterprise_event_recipient', '{}'::jsonb, '{"phase":"phase_8_commercial_enterprise_layer"}'::jsonb),
  ('commercial_heads_of_terms_status_changed', 'Commercial heads of terms status changed', 'notification', 'system_event', 'commercial_broker', array['email']::text[], 'active', true, 'commercial_enterprise_event_recipient', '{}'::jsonb, '{"phase":"phase_8_commercial_enterprise_layer"}'::jsonb),
  ('commercial_transaction_status_changed', 'Commercial transaction status changed', 'notification', 'system_event', 'commercial_broker', array['email']::text[], 'active', true, 'commercial_enterprise_event_recipient', '{}'::jsonb, '{"phase":"phase_8_commercial_enterprise_layer"}'::jsonb),
  ('enterprise_member_scope_changed', 'Enterprise member scope changed', 'notification', 'system_event', 'member', array['email']::text[], 'active', true, 'commercial_enterprise_event_recipient', '{}'::jsonb, '{"phase":"phase_8_commercial_enterprise_layer"}'::jsonb),
  ('enterprise_branch_team_assignment_changed', 'Enterprise branch or team assignment changed', 'notification', 'system_event', 'member', array['email']::text[], 'active', true, 'commercial_enterprise_event_recipient', '{}'::jsonb, '{"phase":"phase_8_commercial_enterprise_layer"}'::jsonb)
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

create or replace function public.bridge_commercial_enterprise_keys_phase8()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array[
    'agency_public_intake_received',
    'commercial_access_requested',
    'commercial_access_decision',
    'commercial_broker_assigned',
    'commercial_canvassing_prospect_created',
    'commercial_requirement_created',
    'commercial_requirement_stage_changed',
    'commercial_deal_created',
    'commercial_deal_stage_changed',
    'commercial_viewing_scheduled',
    'commercial_viewing_status_changed',
    'commercial_document_request_created',
    'commercial_document_uploaded',
    'commercial_heads_of_terms_status_changed',
    'commercial_transaction_status_changed',
    'enterprise_member_scope_changed',
    'enterprise_branch_team_assignment_changed'
  ]::text[]
$$;

create unique index if not exists notification_events_commercial_enterprise_dedupe_idx
  on public.notification_events (organisation_id, dedupe_key)
  where automation_key in (
    'agency_public_intake_received',
    'commercial_access_requested',
    'commercial_access_decision',
    'commercial_broker_assigned',
    'commercial_canvassing_prospect_created',
    'commercial_requirement_created',
    'commercial_requirement_stage_changed',
    'commercial_deal_created',
    'commercial_deal_stage_changed',
    'commercial_viewing_scheduled',
    'commercial_viewing_status_changed',
    'commercial_document_request_created',
    'commercial_document_uploaded',
    'commercial_heads_of_terms_status_changed',
    'commercial_transaction_status_changed',
    'enterprise_member_scope_changed',
    'enterprise_branch_team_assignment_changed'
  )
  and dedupe_key is not null;

create index if not exists notification_events_commercial_enterprise_dispatch_idx
  on public.notification_events (next_dispatch_attempt_at, queued_at, created_at)
  where automation_key in (
    'agency_public_intake_received',
    'commercial_access_requested',
    'commercial_access_decision',
    'commercial_broker_assigned',
    'commercial_canvassing_prospect_created',
    'commercial_requirement_created',
    'commercial_requirement_stage_changed',
    'commercial_deal_created',
    'commercial_deal_stage_changed',
    'commercial_viewing_scheduled',
    'commercial_viewing_status_changed',
    'commercial_document_request_created',
    'commercial_document_uploaded',
    'commercial_heads_of_terms_status_changed',
    'commercial_transaction_status_changed',
    'enterprise_member_scope_changed',
    'enterprise_branch_team_assignment_changed'
  )
  and channel = 'email'
  and status in ('queued', 'failed');

create or replace function public.bridge_commercial_enterprise_profile_phase8(p_user_id uuid)
returns table(email text, name text)
language sql
stable
set search_path = ''
as $$
  select
    lower(nullif(trim(profile.email), '')) as email,
    nullif(trim(coalesce(profile.full_name, profile.email)), '') as name
  from public.profiles profile
  where profile.id = p_user_id
  limit 1
$$;

create or replace function public.bridge_commercial_enterprise_entity_label_phase8(p_row jsonb, p_fallback text default 'commercial record')
returns text
language sql
stable
set search_path = ''
as $$
  select coalesce(
    nullif(p_row->>'deal_name', ''),
    nullif(p_row->>'requirement_name', ''),
    nullif(p_row->>'transaction_name', ''),
    nullif(p_row->>'company_name', ''),
    nullif(p_row->>'property_name', ''),
    nullif(p_row->>'document_name', ''),
    nullif(p_row->>'name', ''),
    nullif(p_row->>'id', ''),
    p_fallback
  )
$$;

create or replace function public.bridge_queue_commercial_enterprise_event_phase8(
  p_automation_key text,
  p_organisation_id uuid,
  p_recipient_user_id uuid,
  p_recipient_email text,
  p_recipient_role text,
  p_subject text,
  p_message_preview text,
  p_payload jsonb default '{}'::jsonb,
  p_metadata jsonb default '{}'::jsonb,
  p_dedupe_key text default null,
  p_branch_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_id uuid;
  v_key text := lower(nullif(trim(coalesce(p_automation_key, '')), ''));
  v_email text := lower(nullif(trim(coalesce(p_recipient_email, '')), ''));
  v_dedupe_key text := nullif(trim(coalesce(p_dedupe_key, '')), '');
begin
  if v_key is null or not (v_key = any (public.bridge_commercial_enterprise_keys_phase8())) then
    raise exception 'Unsupported commercial/enterprise automation key: %', p_automation_key;
  end if;

  if p_organisation_id is null or v_email is null then
    return null;
  end if;

  if exists (
    select 1
    from public.notification_events event
    where event.organisation_id = p_organisation_id
      and event.automation_key = v_key
      and event.dedupe_key = v_dedupe_key
      and event.dedupe_key is not null
  ) then
    return null;
  end if;

  insert into public.notification_events (
    automation_key, organisation_id, branch_id, assigned_user_id, recipient_user_id,
    event_key, category, trigger_type, channel, status,
    recipient_email, recipient_address, recipient_role, subject, message_preview,
    source, dedupe_key, idempotency_key, payload_json, metadata_json,
    prepared_at, queued_at, next_dispatch_attempt_at
  ) values (
    v_key, p_organisation_id, p_branch_id, p_recipient_user_id, p_recipient_user_id,
    v_key, 'notification', 'system_event', 'email', 'queued',
    v_email, v_email, nullif(trim(coalesce(p_recipient_role, '')), ''),
    nullif(trim(coalesce(p_subject, '')), ''),
    nullif(trim(coalesce(p_message_preview, '')), ''),
    'commercial_enterprise_phase8',
    v_dedupe_key,
    coalesce(v_dedupe_key, gen_random_uuid()::text),
    coalesce(p_payload, '{}'::jsonb) || jsonb_build_object('type', v_key),
    coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object(
      'sendEmailType', 'commercial_enterprise_dispatch',
      'notificationFamily', 'commercial_enterprise',
      'phase', 'phase_8_commercial_enterprise_layer'
    ),
    now(), now(), now()
  )
  returning id into v_event_id;

  return v_event_id;
exception
  when unique_violation then
    return null;
end;
$$;

create or replace function public.bridge_queue_commercial_enterprise_for_user_phase8(
  p_automation_key text,
  p_organisation_id uuid,
  p_recipient_user_id uuid,
  p_recipient_role text,
  p_subject text,
  p_message_preview text,
  p_payload jsonb default '{}'::jsonb,
  p_metadata jsonb default '{}'::jsonb,
  p_dedupe_key text default null,
  p_branch_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile record;
begin
  if p_recipient_user_id is null then
    return null;
  end if;

  select * into v_profile
  from public.bridge_commercial_enterprise_profile_phase8(p_recipient_user_id);

  return public.bridge_queue_commercial_enterprise_event_phase8(
    p_automation_key,
    p_organisation_id,
    p_recipient_user_id,
    v_profile.email,
    p_recipient_role,
    p_subject,
    p_message_preview,
    coalesce(p_payload, '{}'::jsonb) || jsonb_build_object('recipientName', v_profile.name),
    p_metadata,
    p_dedupe_key,
    p_branch_id
  );
end;
$$;

create or replace function public.bridge_handle_agency_public_intake_notifications_phase8()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link public.agency_public_intake_links%rowtype;
  v_recipient_user_id uuid;
  v_entity_label text;
begin
  select * into v_link
  from public.agency_public_intake_links
  where id = new.intake_link_id
  limit 1;

  v_recipient_user_id := v_link.default_assigned_agent_id;
  v_entity_label := coalesce(nullif(new.contact_name, ''), nullif(new.contact_email, ''), 'public intake');

  perform public.bridge_queue_commercial_enterprise_for_user_phase8(
    'agency_public_intake_received',
    new.organisation_id,
    v_recipient_user_id,
    'agent',
    initcap(new.intent) || ' public intake received',
    'A new public intake has been received from ' || v_entity_label || '.',
    jsonb_build_object(
      'entityLabel', v_entity_label,
      'entityType', 'Public Intake',
      'status', new.status,
      'clientName', v_entity_label,
      'actionLink', '/leads',
      'leadId', new.lead_id,
      'submissionId', new.id
    ),
    jsonb_build_object('submissionId', new.id, 'intent', new.intent),
    'agency_public_intake_received:' || new.id::text || ':' || coalesce(v_recipient_user_id::text, 'unassigned'),
    null
  );
  return new;
end;
$$;

drop trigger if exists trg_agency_public_intake_notifications_phase8 on public.agency_public_intake_submissions;
create trigger trg_agency_public_intake_notifications_phase8
after insert on public.agency_public_intake_submissions
for each row execute function public.bridge_handle_agency_public_intake_notifications_phase8();

create or replace function public.bridge_handle_commercial_access_notifications_phase8()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reviewer record;
  v_profile record;
begin
  if tg_op = 'INSERT' and new.status = 'pending' then
    for v_reviewer in
      select distinct member.user_id
      from public.organisation_users member
      where member.organisation_id = new.organisation_id
        and member.user_id is not null
        and member.user_id <> new.requester_user_id
        and lower(coalesce(member.status, 'active')) not in ('deactivated', 'removed', 'revoked')
        and lower(coalesce(member.workspace_role, member.organisation_role, member.role, '')) in ('owner', 'principal', 'director', 'partner', 'admin', 'super_admin')
    loop
      perform public.bridge_queue_commercial_enterprise_for_user_phase8(
        'commercial_access_requested',
        new.organisation_id,
        v_reviewer.user_id,
        'principal',
        'Commercial access requested',
        coalesce(new.requester_name, new.requester_email, 'A workspace user') || ' requested Commercial workspace access.',
        jsonb_build_object(
          'entityLabel', 'Commercial access request',
          'entityType', 'Access Request',
          'status', new.status,
          'requesterName', new.requester_name,
          'requesterEmail', new.requester_email
        ),
        jsonb_build_object('requestId', new.id),
        'commercial_access_requested:' || new.id::text || ':' || v_reviewer.user_id::text,
        null
      );
    end loop;
  elsif tg_op = 'UPDATE' and old.status is distinct from new.status and new.status in ('approved', 'rejected') then
    select * into v_profile
    from public.bridge_commercial_enterprise_profile_phase8(new.requester_user_id);

    perform public.bridge_queue_commercial_enterprise_event_phase8(
      'commercial_access_decision',
      new.organisation_id,
      new.requester_user_id,
      coalesce(v_profile.email, new.requester_email),
      'requester',
      'Commercial access ' || new.status,
      'Your Commercial workspace access request was ' || new.status || '.',
      jsonb_build_object(
        'recipientName', coalesce(v_profile.name, new.requester_name),
        'entityLabel', 'Commercial access request',
        'entityType', 'Access Request',
        'status', new.status,
        'previousStatus', old.status,
        'requesterName', new.requester_name,
        'requesterEmail', new.requester_email
      ),
      jsonb_build_object('requestId', new.id),
      'commercial_access_decision:' || new.id::text || ':' || new.status,
      null
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_commercial_access_notifications_phase8 on public.commercial_access_requests;
create trigger trg_commercial_access_notifications_phase8
after insert or update on public.commercial_access_requests
for each row execute function public.bridge_handle_commercial_access_notifications_phase8();

create or replace function public.bridge_handle_commercial_canvassing_notifications_phase8()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.bridge_queue_commercial_enterprise_for_user_phase8(
    'commercial_canvassing_prospect_created',
    new.organisation_id,
    coalesce(new.assigned_broker_id, new.created_by),
    'commercial_broker',
    'Commercial canvassing prospect created',
    public.bridge_commercial_enterprise_entity_label_phase8(to_jsonb(new), 'Commercial prospect') || ' was added to canvassing.',
    jsonb_build_object(
      'entityLabel', public.bridge_commercial_enterprise_entity_label_phase8(to_jsonb(new), 'Commercial prospect'),
      'entityType', 'Commercial Canvassing Prospect',
      'status', new.status,
      'brokerName', new.assigned_broker_name,
      'brokerEmail', new.assigned_broker_email,
      'clientName', coalesce(new.company_name, new.contact_name),
      'nextAction', case when new.next_follow_up_date is not null then 'Follow up on ' || new.next_follow_up_date::text else null end
    ),
    jsonb_build_object('prospectId', new.id, 'prospectRole', new.prospect_role, 'dealType', new.deal_type),
    'commercial_canvassing_prospect_created:' || new.id::text || ':' || coalesce(coalesce(new.assigned_broker_id, new.created_by)::text, 'unassigned'),
    new.branch_id
  );
  return new;
end;
$$;

drop trigger if exists trg_commercial_canvassing_notifications_phase8 on public.commercial_canvassing_prospects;
create trigger trg_commercial_canvassing_notifications_phase8
after insert on public.commercial_canvassing_prospects
for each row execute function public.bridge_handle_commercial_canvassing_notifications_phase8();

create or replace function public.bridge_handle_commercial_requirement_notifications_phase8()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text;
  v_recipient uuid;
begin
  v_recipient := coalesce(new.broker_id, new.assigned_broker, new.created_by);
  if tg_op = 'INSERT' then
    v_key := 'commercial_requirement_created';
  elsif old.stage is distinct from new.stage or old.status is distinct from new.status then
    v_key := 'commercial_requirement_stage_changed';
  elsif coalesce(old.broker_id, old.assigned_broker) is distinct from coalesce(new.broker_id, new.assigned_broker) then
    v_key := 'commercial_broker_assigned';
  else
    return new;
  end if;

  perform public.bridge_queue_commercial_enterprise_for_user_phase8(
    v_key,
    new.organisation_id,
    v_recipient,
    'commercial_broker',
    initcap(replace(v_key, '_', ' ')),
    public.bridge_commercial_enterprise_entity_label_phase8(to_jsonb(new), 'Commercial requirement') || ' was updated.',
    jsonb_build_object(
      'entityLabel', public.bridge_commercial_enterprise_entity_label_phase8(to_jsonb(new), 'Commercial requirement'),
      'entityType', 'Commercial Requirement',
      'status', coalesce(new.stage, new.status),
      'previousStatus', case when tg_op = 'UPDATE' then coalesce(old.stage, old.status) else null end
    ),
    jsonb_build_object('requirementId', new.id),
    v_key || ':' || new.id::text || ':' || coalesce(new.stage, new.status, '') || ':' || coalesce(v_recipient::text, 'unassigned'),
    new.branch_id
  );
  return new;
end;
$$;

drop trigger if exists trg_commercial_requirement_notifications_phase8 on public.commercial_requirements;
create trigger trg_commercial_requirement_notifications_phase8
after insert or update on public.commercial_requirements
for each row execute function public.bridge_handle_commercial_requirement_notifications_phase8();

create or replace function public.bridge_handle_commercial_deal_notifications_phase8()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text;
  v_recipient uuid;
begin
  v_recipient := coalesce(new.broker_id, new.assigned_broker, new.created_by);
  if tg_op = 'INSERT' then
    v_key := 'commercial_deal_created';
  elsif old.stage is distinct from new.stage or old.status is distinct from new.status then
    v_key := 'commercial_deal_stage_changed';
  elsif coalesce(old.broker_id, old.assigned_broker) is distinct from coalesce(new.broker_id, new.assigned_broker) then
    v_key := 'commercial_broker_assigned';
  else
    return new;
  end if;

  perform public.bridge_queue_commercial_enterprise_for_user_phase8(
    v_key,
    new.organisation_id,
    v_recipient,
    'commercial_broker',
    initcap(replace(v_key, '_', ' ')),
    public.bridge_commercial_enterprise_entity_label_phase8(to_jsonb(new), 'Commercial deal') || ' was updated.',
    jsonb_build_object(
      'entityLabel', public.bridge_commercial_enterprise_entity_label_phase8(to_jsonb(new), 'Commercial deal'),
      'entityType', 'Commercial Deal',
      'status', coalesce(new.stage, new.status),
      'previousStatus', case when tg_op = 'UPDATE' then coalesce(old.stage, old.status) else null end,
      'amountLabel', nullif(new.deal_value::text, '')
    ),
    jsonb_build_object('dealId', new.id),
    v_key || ':' || new.id::text || ':' || coalesce(new.stage, new.status, '') || ':' || coalesce(v_recipient::text, 'unassigned'),
    new.branch_id
  );
  return new;
end;
$$;

drop trigger if exists trg_commercial_deal_notifications_phase8 on public.commercial_deals;
create trigger trg_commercial_deal_notifications_phase8
after insert or update on public.commercial_deals
for each row execute function public.bridge_handle_commercial_deal_notifications_phase8();

create or replace function public.bridge_handle_commercial_viewing_notifications_phase8()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text;
begin
  if tg_op = 'INSERT' then
    v_key := 'commercial_viewing_scheduled';
  elsif old.status is distinct from new.status then
    v_key := 'commercial_viewing_status_changed';
  else
    return new;
  end if;

  perform public.bridge_queue_commercial_enterprise_for_user_phase8(
    v_key,
    new.organisation_id,
    new.broker_id,
    'commercial_broker',
    initcap(replace(v_key, '_', ' ')),
    'Commercial viewing ' || coalesce(new.status::text, 'updated') || '.',
    jsonb_build_object(
      'entityLabel', new.id::text,
      'entityType', 'Commercial Viewing',
      'status', new.status::text,
      'previousStatus', case when tg_op = 'UPDATE' then old.status::text else null end
    ),
    jsonb_build_object('viewingId', new.id),
    v_key || ':' || new.id::text || ':' || new.status::text,
    new.branch_id
  );
  return new;
end;
$$;

drop trigger if exists trg_commercial_viewing_notifications_phase8 on public.commercial_viewings;
create trigger trg_commercial_viewing_notifications_phase8
after insert or update on public.commercial_viewings
for each row execute function public.bridge_handle_commercial_viewing_notifications_phase8();

create or replace function public.bridge_handle_commercial_document_notifications_phase8()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.bridge_queue_commercial_enterprise_for_user_phase8(
    'commercial_document_uploaded',
    new.organisation_id,
    coalesce(new.broker_id, new.uploaded_by, new.created_by),
    'commercial_broker',
    'Commercial document uploaded',
    new.document_name || ' was uploaded.',
    jsonb_build_object(
      'entityLabel', new.document_name,
      'entityType', 'Commercial Document',
      'status', new.status
    ),
    jsonb_build_object('documentId', new.id, 'entityType', new.entity_type, 'entityId', new.entity_id),
    'commercial_document_uploaded:' || new.id::text,
    new.branch_id
  );
  return new;
end;
$$;

drop trigger if exists trg_commercial_document_notifications_phase8 on public.commercial_documents;
create trigger trg_commercial_document_notifications_phase8
after insert on public.commercial_documents
for each row execute function public.bridge_handle_commercial_document_notifications_phase8();

create or replace function public.bridge_handle_commercial_document_request_notifications_phase8()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.bridge_queue_commercial_enterprise_for_user_phase8(
    'commercial_document_request_created',
    new.organisation_id,
    coalesce(new.broker_id, new.created_by),
    'commercial_broker',
    'Commercial document requested',
    new.document_name || ' was requested.',
    jsonb_build_object(
      'entityLabel', new.document_name,
      'entityType', 'Commercial Document Request',
      'status', new.status,
      'nextAction', 'Collect or upload the requested document.'
    ),
    jsonb_build_object('documentRequestId', new.id, 'entityType', new.entity_type, 'entityId', new.entity_id),
    'commercial_document_request_created:' || new.id::text,
    new.branch_id
  );
  return new;
end;
$$;

drop trigger if exists trg_commercial_document_request_notifications_phase8 on public.commercial_document_requests;
create trigger trg_commercial_document_request_notifications_phase8
after insert on public.commercial_document_requests
for each row execute function public.bridge_handle_commercial_document_request_notifications_phase8();

create or replace function public.bridge_handle_commercial_heads_of_terms_notifications_phase8()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deal public.commercial_deals%rowtype;
begin
  if tg_op = 'UPDATE' and old.status is not distinct from new.status then
    return new;
  end if;

  select * into v_deal from public.commercial_deals where id = new.deal_id limit 1;
  perform public.bridge_queue_commercial_enterprise_for_user_phase8(
    'commercial_heads_of_terms_status_changed',
    new.organisation_id,
    coalesce(new.broker_id, v_deal.broker_id, v_deal.assigned_broker, new.created_by),
    'commercial_broker',
    'Commercial heads of terms updated',
    'Heads of terms status changed to ' || new.status || '.',
    jsonb_build_object(
      'entityLabel', coalesce(v_deal.deal_name, new.id::text),
      'entityType', 'Heads Of Terms',
      'status', new.status,
      'previousStatus', case when tg_op = 'UPDATE' then old.status else null end
    ),
    jsonb_build_object('headsOfTermsId', new.id, 'dealId', new.deal_id),
    'commercial_heads_of_terms_status_changed:' || new.id::text || ':' || new.status,
    new.branch_id
  );
  return new;
end;
$$;

drop trigger if exists trg_commercial_heads_of_terms_notifications_phase8 on public.commercial_heads_of_terms;
create trigger trg_commercial_heads_of_terms_notifications_phase8
after insert or update on public.commercial_heads_of_terms
for each row execute function public.bridge_handle_commercial_heads_of_terms_notifications_phase8();

create or replace function public.bridge_handle_commercial_transaction_notifications_phase8()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and old.status is not distinct from new.status then
    return new;
  end if;

  perform public.bridge_queue_commercial_enterprise_for_user_phase8(
    'commercial_transaction_status_changed',
    new.organisation_id,
    new.broker_id,
    'commercial_broker',
    'Commercial transaction updated',
    new.transaction_name || ' moved to ' || new.status::text || '.',
    jsonb_build_object(
      'entityLabel', new.transaction_name,
      'entityType', 'Commercial Transaction',
      'status', new.status::text,
      'previousStatus', case when tg_op = 'UPDATE' then old.status::text else null end,
      'amountLabel', nullif(new.target_value::text, '')
    ),
    jsonb_build_object('commercialTransactionId', new.id),
    'commercial_transaction_status_changed:' || new.id::text || ':' || new.status::text,
    new.branch_id
  );
  return new;
end;
$$;

drop trigger if exists trg_commercial_transaction_notifications_phase8 on public.commercial_transactions;
create trigger trg_commercial_transaction_notifications_phase8
after insert or update on public.commercial_transactions
for each row execute function public.bridge_handle_commercial_transaction_notifications_phase8();

create or replace function public.bridge_handle_enterprise_member_notifications_phase8()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text;
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;

  if coalesce(old.primary_branch_id, old.branch_id) is distinct from coalesce(new.primary_branch_id, new.branch_id)
     or old.team_id is distinct from new.team_id then
    v_key := 'enterprise_branch_team_assignment_changed';
  elsif coalesce(old.workspace_role, old.organisation_role, old.role) is distinct from coalesce(new.workspace_role, new.organisation_role, new.role)
     or coalesce(old.module_context, '') is distinct from coalesce(new.module_context, '') then
    v_key := 'enterprise_member_scope_changed';
  else
    return new;
  end if;

  perform public.bridge_queue_commercial_enterprise_for_user_phase8(
    v_key,
    new.organisation_id,
    new.user_id,
    'member',
    initcap(replace(v_key, '_', ' ')),
    'Your enterprise workspace access or assignment was updated.',
    jsonb_build_object(
      'entityLabel', 'Workspace membership',
      'entityType', 'Enterprise Membership',
      'status', coalesce(new.workspace_role, new.organisation_role, new.role),
      'previousStatus', coalesce(old.workspace_role, old.organisation_role, old.role)
    ),
    jsonb_build_object('membershipId', new.id, 'moduleContext', new.module_context),
    v_key || ':' || new.id::text || ':' || extract(epoch from now())::bigint::text,
    coalesce(new.primary_branch_id, new.branch_id)
  );
  return new;
end;
$$;

drop trigger if exists trg_enterprise_member_notifications_phase8 on public.organisation_users;
create trigger trg_enterprise_member_notifications_phase8
after update on public.organisation_users
for each row execute function public.bridge_handle_enterprise_member_notifications_phase8();

create or replace function public.bridge_claim_commercial_enterprise_notifications_phase8(
  p_event_id uuid default null,
  p_limit integer default 25
)
returns setof public.notification_events
language sql
security definer
set search_path = public
as $$
  with candidates as (
    select event.id
    from public.notification_events event
    where event.automation_key = any (public.bridge_commercial_enterprise_keys_phase8())
      and event.channel = 'email'
      and event.status in ('queued', 'failed')
      and event.recipient_email is not null
      and (p_event_id is null or event.id = p_event_id)
      and (
        event.next_dispatch_attempt_at is null
        or event.next_dispatch_attempt_at <= now()
      )
      and coalesce(event.dispatch_attempt_count, 0) < coalesce(event.max_dispatch_attempts, 5)
    order by event.next_dispatch_attempt_at nulls first, event.queued_at nulls first, event.created_at
    limit greatest(1, least(coalesce(p_limit, 25), 100))
    for update skip locked
  ),
  updated as (
    update public.notification_events event
       set status = 'processing',
           dispatch_attempt_count = coalesce(event.dispatch_attempt_count, 0) + 1,
           last_dispatch_attempt_at = now(),
           updated_at = now()
      from candidates
     where event.id = candidates.id
    returning event.*
  )
  select * from updated
$$;

commit;
