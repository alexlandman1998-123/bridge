begin;

alter table if exists public.private_listing_document_requirements
  add column if not exists reminder_count integer not null default 0,
  add column if not exists last_reminder_at timestamptz,
  add column if not exists next_reminder_at timestamptz,
  add column if not exists escalated_at timestamptz,
  add column if not exists follow_up_stopped_at timestamptz,
  add column if not exists follow_up_stop_reason text;

insert into public.notification_automation_definitions (
  automation_key, display_name, category, trigger_type, recipient_role,
  channels, implementation_status, default_enabled, dedupe_strategy,
  reminder_policy, metadata_json
)
values
  (
    'seller_document_requested', 'Seller document requested', 'notification', 'system_event', 'seller',
    array['in_app','email']::text[], 'active', true, 'listing_requirement_revision',
    '{}'::jsonb,
    '{"phase":"p0_3","purpose":"Initial seller-visible document request event"}'::jsonb
  ),
  (
    'seller_document_request_reminder', 'Seller document request reminder', 'reminder', 'scheduled_reminder', 'seller',
    array['email','in_app']::text[], 'active', true, 'listing_requirement_revision_day',
    '{"cadenceDays":[0,2,5,9],"stopWhen":"seller_document_supplied","quietHours":{"enabled":true,"timezone":"Africa/Johannesburg","startHour":18,"endHour":8},"escalation":{"enabled":true,"afterDay":9,"recipientRole":"assigned_user"}}'::jsonb,
    '{"phase":"p0_3","purpose":"Document-specific follow-up with automatic stop conditions"}'::jsonb
  ),
  (
    'seller_document_request_escalation', 'Seller document request escalation', 'notification', 'system_event', 'agent',
    array['in_app']::text[], 'active', true, 'listing_requirement_revision',
    '{}'::jsonb,
    '{"phase":"p0_3","purpose":"Assigned-agent escalation after the final seller reminder"}'::jsonb
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
    reminder_policy = excluded.reminder_policy,
    metadata_json = coalesce(public.notification_automation_definitions.metadata_json, '{}'::jsonb) || excluded.metadata_json,
    updated_at = now();

create index if not exists private_listing_document_requirements_follow_up_idx
  on public.private_listing_document_requirements(status, next_reminder_at, requested_at)
  where status in ('requested', 'rejected') and is_required is true;

create index if not exists notification_events_seller_document_follow_up_idx
  on public.notification_events(listing_id, automation_key, status, queued_at)
  where automation_key in (
    'seller_document_requested',
    'seller_document_request_reminder',
    'seller_document_request_escalation'
  );

create or replace function public.bridge_prepare_rejected_seller_document_reupload_p0_3()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text := lower(regexp_replace(coalesce(new.requirement_key, ''), '[^a-zA-Z0-9]+', '_', 'g'));
  v_revision integer;
begin
  if new.status = 'rejected' and old.status is distinct from 'rejected' then
    v_revision := greatest(coalesce(old.request_revision, new.request_revision, 1) + 1, 2);
    new.request_revision := v_revision;
    new.requested_from_role := 'seller';
    new.request_priority := 'blocker';
    new.request_due_date := public.bridge_add_seller_request_business_days(current_date, 2);
    new.request_delivery_channels := array['in_app','email']::text[];
    new.request_dedupe_key := 'seller-document-request:' || new.private_listing_id::text || ':' || v_key || ':v' || v_revision::text;
    new.request_source := 'seller_document_follow_up_p0_3';
    new.requested_at := now();
    new.last_request_reason := 'rejected_document_reupload_required';
    new.reminder_count := 0;
    new.last_reminder_at := null;
    new.next_reminder_at := now();
    new.escalated_at := null;
    new.follow_up_stopped_at := null;
    new.follow_up_stop_reason := null;
    new.request_metadata := coalesce(new.request_metadata, '{}'::jsonb) || jsonb_build_object(
      'isReupload', true,
      'reissuedAutomatically', true,
      'orchestrationVersion', 'seller_document_follow_up_p0_3'
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prepare_rejected_seller_document_reupload_p0_3
  on public.private_listing_document_requirements;
create trigger trg_prepare_rejected_seller_document_reupload_p0_3
before update of status
on public.private_listing_document_requirements
for each row
execute function public.bridge_prepare_rejected_seller_document_reupload_p0_3();

create or replace function public.bridge_queue_seller_document_follow_ups_p0_3(
  p_limit integer default 100,
  p_now timestamptz default now(),
  p_dry_run boolean default false,
  p_listing_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := coalesce(p_now, now());
  v_limit integer := greatest(0, least(coalesce(p_limit, 100), 500));
  v_candidate_count integer := 0;
  v_queued_count integer := 0;
  v_escalated_count integer := 0;
begin
  create temporary table if not exists seller_document_follow_up_candidates_p0_3 (
    requirement_id uuid,
    listing_id uuid,
    organisation_id uuid,
    assigned_user_id uuid,
    requirement_key text,
    requirement_name text,
    request_revision integer,
    request_due_date date,
    requested_at timestamptz,
    reminder_day integer,
    recipient_email text,
    seller_workspace_token text,
    dedupe_key text,
    is_reupload boolean
  ) on commit drop;
  truncate seller_document_follow_up_candidates_p0_3;

  insert into seller_document_follow_up_candidates_p0_3
  select
    requirement.id,
    requirement.private_listing_id,
    listing.organisation_id,
    listing.assigned_agent_id,
    requirement.requirement_key,
    requirement.requirement_name,
    greatest(coalesce(requirement.request_revision, 1), 1),
    requirement.request_due_date,
    requirement.requested_at,
    cadence.reminder_day,
    lower(nullif(trim(coalesce(
      requirement.request_metadata->>'seller_email',
      onboarding.form_data->>'email',
      onboarding.form_data->>'sellerEmail',
      portal.client_email
    )), '')),
    nullif(trim(coalesce(
      onboarding.seller_portal_token,
      portal.seller_workspace_token,
      onboarding.token
    )), ''),
    'seller-document-follow-up:' || requirement.private_listing_id::text || ':' || requirement.id::text ||
      ':v' || greatest(coalesce(requirement.request_revision, 1), 1)::text || ':day-' || cadence.reminder_day::text,
    requirement.status = 'rejected'
  from public.private_listing_document_requirements requirement
  join public.private_listings listing on listing.id = requirement.private_listing_id
  cross join lateral (values (0), (2), (5), (9)) cadence(reminder_day)
  left join lateral (
    select seller_onboarding.*
    from public.private_listing_seller_onboarding seller_onboarding
    where seller_onboarding.private_listing_id = requirement.private_listing_id
    order by seller_onboarding.updated_at desc nulls last, seller_onboarding.created_at desc
    limit 1
  ) onboarding on true
  left join lateral (
    select client_context.*
    from public.client_portal_contexts client_context
    where client_context.listing_id = requirement.private_listing_id
      and client_context.context_type = 'selling'
      and client_context.status = 'active'
    order by client_context.updated_at desc nulls last
    limit 1
  ) portal on true
  where requirement.status in ('requested', 'rejected')
    and requirement.is_required is true
    and requirement.document_visibility = 'seller_visible'
    and requirement.requested_at is not null
    and (p_listing_id is null or requirement.private_listing_id = p_listing_id)
    and requirement.requested_at::date + cadence.reminder_day <= v_now::date
    and not exists (
      select 1
      from public.private_listing_documents document
      where document.private_listing_id = requirement.private_listing_id
        and document.status in ('uploaded', 'under_review', 'approved', 'completed')
        and (
          document.requirement_id = requirement.id
          or lower(regexp_replace(coalesce(document.document_type, ''), '[^a-zA-Z0-9]+', '_', 'g')) =
             lower(regexp_replace(requirement.requirement_key, '[^a-zA-Z0-9]+', '_', 'g'))
        )
    )
    and not exists (
      select 1 from public.notification_events event
      where event.organisation_id = listing.organisation_id
        and event.dedupe_key = 'seller-document-follow-up:' || requirement.private_listing_id::text || ':' || requirement.id::text ||
          ':v' || greatest(coalesce(requirement.request_revision, 1), 1)::text || ':day-' || cadence.reminder_day::text
    )
  order by requirement.requested_at, cadence.reminder_day
  limit v_limit;

  select count(*) into v_candidate_count from seller_document_follow_up_candidates_p0_3;

  if not coalesce(p_dry_run, false) then
    insert into public.notification_events (
      automation_key, organisation_id, assigned_user_id, listing_id,
      event_key, category, trigger_type, channel, status,
      recipient_email, recipient_role, subject, message_preview,
      source, dedupe_key, payload_json, metadata_json, prepared_at, queued_at
    )
    select
      'seller_document_request_reminder', candidate.organisation_id, candidate.assigned_user_id, candidate.listing_id,
      'seller_document_request_reminder', 'reminder', 'scheduled_reminder', 'email', 'queued',
      candidate.recipient_email, 'seller',
      case when candidate.is_reupload then 'Action required: replace ' else 'Document requested: ' end || candidate.requirement_name,
      case when candidate.is_reupload
        then 'A replacement document is required after review.'
        else 'Please upload the requested document in your secure seller portal.'
      end,
      'seller_document_follow_up_p0_3', candidate.dedupe_key,
      jsonb_strip_nulls(jsonb_build_object(
        'requirementId', candidate.requirement_id,
        'requirementKey', candidate.requirement_key,
        'requirementName', candidate.requirement_name,
        'requestRevision', candidate.request_revision,
        'reminderDay', candidate.reminder_day,
        'dueDate', candidate.request_due_date,
        'sellerWorkspaceToken', candidate.seller_workspace_token,
        'isReupload', candidate.is_reupload
      )),
      jsonb_build_object(
        'phase', 'p0_3',
        'stopWhen', 'seller_document_supplied',
        'sourceMetadata', jsonb_strip_nulls(jsonb_build_object(
          'requirementName', candidate.requirement_name,
          'sellerWorkspaceToken', candidate.seller_workspace_token
        ))
      ),
      v_now,
      v_now
    from seller_document_follow_up_candidates_p0_3 candidate
    where candidate.recipient_email is not null;
    get diagnostics v_queued_count = row_count;

    insert into public.notification_events (
      automation_key, organisation_id, assigned_user_id, listing_id,
      event_key, category, trigger_type, channel, status,
      recipient_role, subject, message_preview, source, dedupe_key,
      payload_json, metadata_json, prepared_at, sent_at
    )
    select
      'seller_document_requested', candidate.organisation_id, candidate.assigned_user_id, candidate.listing_id,
      'seller_document_requested', 'notification', 'system_event', 'in_app', 'sent',
      'seller', case when candidate.is_reupload then 'Replacement document requested' else 'Seller document requested' end,
      candidate.requirement_name || case when candidate.is_reupload then ' needs to be replaced.' else ' is ready for upload.' end,
      'seller_document_follow_up_p0_3',
      'seller-document-requested-event:' || candidate.listing_id::text || ':' || candidate.requirement_id::text || ':v' || candidate.request_revision::text,
      jsonb_build_object(
        'requirementId', candidate.requirement_id,
        'requirementKey', candidate.requirement_key,
        'requirementName', candidate.requirement_name,
        'requestRevision', candidate.request_revision,
        'isReupload', candidate.is_reupload
      ),
      jsonb_build_object('phase', 'p0_3', 'sellerVisible', true),
      v_now,
      v_now
    from seller_document_follow_up_candidates_p0_3 candidate
    where candidate.reminder_day = 0
      and not exists (
        select 1 from public.notification_events existing
        where existing.organisation_id = candidate.organisation_id
          and existing.dedupe_key = 'seller-document-requested-event:' || candidate.listing_id::text || ':' || candidate.requirement_id::text || ':v' || candidate.request_revision::text
      );

    insert into public.notification_events (
      automation_key, organisation_id, assigned_user_id, listing_id,
      event_key, category, trigger_type, channel, status,
      recipient_role, subject, message_preview, source, dedupe_key,
      payload_json, metadata_json, prepared_at, sent_at
    )
    select distinct on (candidate.requirement_id, candidate.request_revision)
      'seller_document_request_escalation', candidate.organisation_id, candidate.assigned_user_id, candidate.listing_id,
      'seller_document_request_escalation', 'notification', 'system_event', 'in_app', 'sent',
      'agent', 'Seller document request overdue',
      candidate.requirement_name || ' is still outstanding after the final seller reminder.',
      'seller_document_follow_up_p0_3',
      'seller-document-escalation:' || candidate.listing_id::text || ':' || candidate.requirement_id::text ||
        ':v' || candidate.request_revision::text || ':day-9',
      jsonb_build_object(
        'requirementId', candidate.requirement_id,
        'requirementKey', candidate.requirement_key,
        'requirementName', candidate.requirement_name,
        'requestRevision', candidate.request_revision,
        'escalationDay', 9
      ),
      jsonb_build_object('phase', 'p0_3', 'recipientRole', 'assigned_user'),
      v_now,
      v_now
    from seller_document_follow_up_candidates_p0_3 candidate
    where candidate.reminder_day = 9
      and candidate.assigned_user_id is not null
      and not exists (
        select 1 from public.notification_events existing
        where existing.organisation_id = candidate.organisation_id
          and existing.dedupe_key = 'seller-document-escalation:' || candidate.listing_id::text || ':' || candidate.requirement_id::text ||
            ':v' || candidate.request_revision::text || ':day-9'
      )
    order by candidate.requirement_id, candidate.request_revision, candidate.reminder_day desc;
    get diagnostics v_escalated_count = row_count;

    update public.private_listing_document_requirements requirement
    set reminder_count = coalesce(requirement.reminder_count, 0) + follow_up.reminder_count,
        last_reminder_at = case when follow_up.reminder_count > 0 then v_now else requirement.last_reminder_at end,
        next_reminder_at = follow_up.next_reminder_at,
        escalated_at = case when follow_up.has_escalation then coalesce(requirement.escalated_at, v_now) else requirement.escalated_at end
    from (
      select
        candidate.requirement_id,
        (count(distinct candidate.reminder_day) filter (where candidate.recipient_email is not null))::integer as reminder_count,
        bool_or(candidate.reminder_day = 9) as has_escalation,
        case
          when max(candidate.reminder_day) < 2 then min(candidate.requested_at) + interval '2 days'
          when max(candidate.reminder_day) < 5 then min(candidate.requested_at) + interval '5 days'
          when max(candidate.reminder_day) < 9 then min(candidate.requested_at) + interval '9 days'
          else null
        end as next_reminder_at
      from seller_document_follow_up_candidates_p0_3 candidate
      group by candidate.requirement_id
    ) follow_up
    where requirement.id = follow_up.requirement_id;
  end if;

  return jsonb_build_object(
    'success', true,
    'phase', 'p0_3',
    'dryRun', coalesce(p_dry_run, false),
    'candidateCount', v_candidate_count,
    'queuedCount', v_queued_count,
    'escalatedCount', v_escalated_count,
    'generatedAt', v_now
  );
end;
$$;

create or replace function public.bridge_queue_seller_document_follow_up_on_request_p0_3()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status in ('requested', 'rejected')
     and new.is_required is true
     and new.document_visibility = 'seller_visible'
     and (
       tg_op = 'INSERT'
       or old.status is distinct from new.status
       or old.request_revision is distinct from new.request_revision
     ) then
    perform public.bridge_queue_seller_document_follow_ups_p0_3(25, now(), false, new.private_listing_id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_queue_seller_document_follow_up_on_request_p0_3
  on public.private_listing_document_requirements;
create trigger trg_queue_seller_document_follow_up_on_request_p0_3
after insert or update of status, request_revision
on public.private_listing_document_requirements
for each row
execute function public.bridge_queue_seller_document_follow_up_on_request_p0_3();

create or replace function public.bridge_stop_seller_document_follow_up_p0_3(
  p_requirement_id uuid,
  p_reason text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
begin
  update public.notification_events event
  set status = 'skipped',
      metadata_json = coalesce(event.metadata_json, '{}'::jsonb) || jsonb_build_object(
        'followUpStoppedAt', now(),
        'followUpStopReason', coalesce(nullif(trim(p_reason), ''), 'document_supplied')
      ),
      updated_at = now()
  where event.automation_key = 'seller_document_request_reminder'
    and event.status in ('prepared', 'queued', 'processing')
    and event.payload_json->>'requirementId' = p_requirement_id::text;
  get diagnostics v_count = row_count;

  update public.private_listing_document_requirements
  set follow_up_stopped_at = now(),
      follow_up_stop_reason = coalesce(nullif(trim(p_reason), ''), 'document_supplied'),
      next_reminder_at = null
  where id = p_requirement_id;

  return v_count;
end;
$$;

create or replace function public.bridge_stop_seller_document_follow_up_from_requirement_p0_3()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status in ('uploaded', 'under_review', 'approved', 'completed', 'not_applicable', 'cancelled', 'waived')
     and old.status is distinct from new.status then
    perform public.bridge_stop_seller_document_follow_up_p0_3(new.id, 'requirement_' || new.status);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_stop_seller_document_follow_up_from_requirement_p0_3
  on public.private_listing_document_requirements;
create trigger trg_stop_seller_document_follow_up_from_requirement_p0_3
after update of status
on public.private_listing_document_requirements
for each row
execute function public.bridge_stop_seller_document_follow_up_from_requirement_p0_3();

create or replace function public.bridge_stop_seller_document_follow_up_from_upload_p0_3()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_requirement_id uuid;
begin
  if new.status not in ('uploaded', 'under_review', 'approved', 'completed') then
    return new;
  end if;

  select requirement.id into v_requirement_id
  from public.private_listing_document_requirements requirement
  where requirement.private_listing_id = new.private_listing_id
    and (
      requirement.id = new.requirement_id
      or lower(regexp_replace(coalesce(requirement.requirement_key, ''), '[^a-zA-Z0-9]+', '_', 'g')) =
         lower(regexp_replace(coalesce(new.document_type, ''), '[^a-zA-Z0-9]+', '_', 'g'))
    )
  order by (requirement.id = new.requirement_id) desc
  limit 1;

  if v_requirement_id is not null then
    perform public.bridge_stop_seller_document_follow_up_p0_3(v_requirement_id, 'document_supplied');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_stop_seller_document_follow_up_from_upload_p0_3
  on public.private_listing_documents;
create trigger trg_stop_seller_document_follow_up_from_upload_p0_3
after insert or update of status
on public.private_listing_documents
for each row
execute function public.bridge_stop_seller_document_follow_up_from_upload_p0_3();

create or replace function public.bridge_claim_notification_reminder_events_phase4(
  p_limit integer default 25,
  p_event_id uuid default null
)
returns setof public.notification_events
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit integer := greatest(0, least(coalesce(p_limit, 25), 100));
begin
  return query
  with next_events as (
    select id
    from public.notification_events
    where category = 'reminder'
      and trigger_type = 'scheduled_reminder'
      and channel = 'email'
      and status = 'queued'
      and automation_key in (
        'buyer_onboarding_reminder',
        'seller_onboarding_reminder',
        'seller_document_request_reminder',
        'attorney_invite_reminder',
        'bond_originator_invite_reminder',
        'agent_invite_reminder'
      )
      and recipient_email is not null
      and (p_event_id is null or id = p_event_id)
    order by queued_at asc nulls last, created_at asc
    limit v_limit
    for update skip locked
  )
  update public.notification_events event
  set status = 'processing',
      dispatch_attempt_count = coalesce(event.dispatch_attempt_count, 0) + 1,
      last_dispatch_attempt_at = now(),
      last_dispatch_error = null,
      metadata_json = coalesce(event.metadata_json, '{}'::jsonb) || jsonb_build_object(
        'phase', case when event.automation_key = 'seller_document_request_reminder' then 'p0_3' else 'phase_4_reminder_dispatch' end,
        'dispatchClaimedAt', now()
      ),
      updated_at = now()
  from next_events
  where event.id = next_events.id
  returning event.*;
end;
$$;

revoke all on function public.bridge_queue_seller_document_follow_ups_p0_3(integer, timestamptz, boolean, uuid) from public, anon, authenticated;
grant execute on function public.bridge_queue_seller_document_follow_ups_p0_3(integer, timestamptz, boolean, uuid) to service_role;
revoke all on function public.bridge_stop_seller_document_follow_up_p0_3(uuid, text) from public, anon, authenticated;
grant execute on function public.bridge_stop_seller_document_follow_up_p0_3(uuid, text) to service_role;

comment on function public.bridge_queue_seller_document_follow_ups_p0_3(integer, timestamptz, boolean, uuid) is
  'Queues deduplicated day 0/2/5/9 seller document emails, stops when supplied, and escalates overdue requests to the assigned agent.';

commit;
