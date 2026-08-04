begin;

insert into public.notification_automation_definitions (
  automation_key, display_name, category, trigger_type, recipient_role,
  channels, implementation_status, default_enabled, dedupe_strategy,
  reminder_policy, metadata_json
) values
  ('agent_weekly_lead_digest', 'Agent weekly lead digest', 'reminder', 'scheduled_reminder', 'agent', array['email']::text[], 'active', true, 'weekly_digest_recipient', '{"cadenceDays":[7],"stopWhen":"manual_disable","quietHours":{"enabled":true,"timezone":"Africa/Johannesburg","startHour":18,"endHour":8}}'::jsonb, '{"phase":"phase_7_weekly_digests"}'::jsonb),
  ('agent_weekly_transaction_digest', 'Agent weekly transaction digest', 'reminder', 'scheduled_reminder', 'agent', array['email']::text[], 'active', true, 'weekly_digest_recipient', '{"cadenceDays":[7],"stopWhen":"manual_disable","quietHours":{"enabled":true,"timezone":"Africa/Johannesburg","startHour":18,"endHour":8}}'::jsonb, '{"phase":"phase_7_weekly_digests"}'::jsonb),
  ('agent_weekly_task_digest', 'Agent weekly task digest', 'reminder', 'scheduled_reminder', 'agent', array['email']::text[], 'active', true, 'weekly_digest_recipient', '{"cadenceDays":[7],"stopWhen":"manual_disable","quietHours":{"enabled":true,"timezone":"Africa/Johannesburg","startHour":18,"endHour":8}}'::jsonb, '{"phase":"phase_7_weekly_digests"}'::jsonb),
  ('manager_weekly_team_digest', 'Manager weekly team digest', 'reminder', 'scheduled_reminder', 'manager', array['email']::text[], 'active', true, 'weekly_digest_recipient', '{"cadenceDays":[7],"stopWhen":"manual_disable","quietHours":{"enabled":true,"timezone":"Africa/Johannesburg","startHour":18,"endHour":8}}'::jsonb, '{"phase":"phase_7_weekly_digests"}'::jsonb),
  ('principal_weekly_business_digest', 'Principal weekly business digest', 'reminder', 'scheduled_reminder', 'principal', array['email']::text[], 'active', true, 'weekly_digest_recipient', '{"cadenceDays":[7],"stopWhen":"manual_disable","quietHours":{"enabled":true,"timezone":"Africa/Johannesburg","startHour":18,"endHour":8}}'::jsonb, '{"phase":"phase_7_weekly_digests"}'::jsonb),
  ('seller_weekly_listing_digest', 'Seller weekly listing digest', 'reminder', 'scheduled_reminder', 'seller', array['email']::text[], 'active', true, 'weekly_digest_recipient', '{"cadenceDays":[7],"stopWhen":"listing_closed_or_manual_disable","quietHours":{"enabled":true,"timezone":"Africa/Johannesburg","startHour":18,"endHour":8}}'::jsonb, '{"phase":"phase_7_weekly_digests"}'::jsonb),
  ('buyer_weekly_transaction_digest', 'Buyer weekly transaction digest', 'reminder', 'scheduled_reminder', 'buyer', array['email']::text[], 'active', true, 'weekly_digest_recipient', '{"cadenceDays":[7],"stopWhen":"transaction_closed_or_manual_disable","quietHours":{"enabled":true,"timezone":"Africa/Johannesburg","startHour":18,"endHour":8}}'::jsonb, '{"phase":"phase_7_weekly_digests"}'::jsonb),
  ('attorney_weekly_matter_digest', 'Attorney weekly matter digest', 'reminder', 'scheduled_reminder', 'attorney', array['email']::text[], 'active', true, 'weekly_digest_recipient', '{"cadenceDays":[7],"stopWhen":"manual_disable","quietHours":{"enabled":true,"timezone":"Africa/Johannesburg","startHour":18,"endHour":8}}'::jsonb, '{"phase":"phase_7_weekly_digests"}'::jsonb),
  ('bond_originator_weekly_pipeline_digest', 'Bond originator weekly pipeline digest', 'reminder', 'scheduled_reminder', 'bond_originator', array['email']::text[], 'active', true, 'weekly_digest_recipient', '{"cadenceDays":[7],"stopWhen":"manual_disable","quietHours":{"enabled":true,"timezone":"Africa/Johannesburg","startHour":18,"endHour":8}}'::jsonb, '{"phase":"phase_7_weekly_digests"}'::jsonb),
  ('commercial_weekly_pipeline_digest', 'Commercial weekly pipeline digest', 'reminder', 'scheduled_reminder', 'commercial_broker', array['email']::text[], 'active', true, 'weekly_digest_recipient', '{"cadenceDays":[7],"stopWhen":"manual_disable","quietHours":{"enabled":true,"timezone":"Africa/Johannesburg","startHour":18,"endHour":8}}'::jsonb, '{"phase":"phase_7_weekly_digests"}'::jsonb)
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

create or replace function public.bridge_weekly_digest_keys_phase7()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array[
    'agent_weekly_lead_digest',
    'agent_weekly_transaction_digest',
    'agent_weekly_task_digest',
    'manager_weekly_team_digest',
    'principal_weekly_business_digest',
    'seller_weekly_listing_digest',
    'buyer_weekly_transaction_digest',
    'attorney_weekly_matter_digest',
    'bond_originator_weekly_pipeline_digest',
    'commercial_weekly_pipeline_digest'
  ]::text[]
$$;

create unique index if not exists notification_events_weekly_digest_dedupe_idx
  on public.notification_events (organisation_id, dedupe_key)
  where automation_key = any (public.bridge_weekly_digest_keys_phase7())
  and dedupe_key is not null;

create index if not exists notification_events_weekly_digest_dispatch_idx
  on public.notification_events (next_dispatch_attempt_at, queued_at, created_at)
  where automation_key = any (public.bridge_weekly_digest_keys_phase7())
  and channel = 'email'
  and status in ('queued', 'failed');

create or replace function public.bridge_weekly_digest_week_key_phase7(p_now timestamptz default now())
returns text
language sql
stable
set search_path = ''
as $$
  select to_char(date_trunc('week', coalesce(p_now, now()) at time zone 'Africa/Johannesburg')::date, 'IYYY-"W"IW')
$$;

create or replace function public.bridge_weekly_digest_profile_recipient_phase7(p_user_id uuid)
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

create or replace function public.bridge_queue_weekly_digest_event_phase7(
  p_automation_key text,
  p_organisation_id uuid,
  p_recipient_email text,
  p_recipient_role text,
  p_recipient_user_id uuid default null,
  p_subject text default null,
  p_message_preview text default null,
  p_payload jsonb default '{}'::jsonb,
  p_metadata jsonb default '{}'::jsonb,
  p_dedupe_key text default null,
  p_queued_at timestamptz default now(),
  p_dry_run boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_id uuid;
  v_recipient_email text := lower(nullif(trim(coalesce(p_recipient_email, '')), ''));
  v_key text := lower(nullif(trim(coalesce(p_automation_key, '')), ''));
  v_dedupe_key text := nullif(trim(coalesce(p_dedupe_key, '')), '');
begin
  if v_key is null or not (v_key = any (public.bridge_weekly_digest_keys_phase7())) then
    raise exception 'Unsupported weekly digest automation key: %', p_automation_key;
  end if;

  if p_organisation_id is null or v_recipient_email is null then
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

  if p_dry_run then
    return gen_random_uuid();
  end if;

  insert into public.notification_events (
    automation_key, organisation_id, assigned_user_id, recipient_user_id,
    event_key, category, trigger_type, channel, status,
    recipient_email, recipient_address, recipient_role, subject, message_preview,
    source, dedupe_key, idempotency_key, payload_json, metadata_json,
    prepared_at, queued_at, next_dispatch_attempt_at
  ) values (
    v_key, p_organisation_id, p_recipient_user_id, p_recipient_user_id,
    v_key, 'reminder', 'scheduled_reminder', 'email', 'queued',
    v_recipient_email, v_recipient_email, nullif(trim(coalesce(p_recipient_role, '')), ''),
    nullif(trim(coalesce(p_subject, '')), ''),
    nullif(trim(coalesce(p_message_preview, '')), ''),
    'weekly_digest_phase7',
    v_dedupe_key,
    coalesce(v_dedupe_key, gen_random_uuid()::text),
    coalesce(p_payload, '{}'::jsonb) || jsonb_build_object('type', v_key),
    coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object(
      'sendEmailType', 'weekly_digest_dispatch',
      'notificationFamily', 'weekly_digest',
      'phase', 'phase_7_weekly_digests'
    ),
    now(), p_queued_at, p_queued_at
  )
  returning id into v_event_id;

  return v_event_id;
exception
  when unique_violation then
    return null;
end;
$$;

create or replace function public.bridge_queue_weekly_digest_notifications_phase7(
  p_now timestamptz default now(),
  p_limit integer default 500,
  p_dry_run boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member record;
  v_week_key text := public.bridge_weekly_digest_week_key_phase7(coalesce(p_now, now()));
  v_period_start date := date_trunc('week', coalesce(p_now, now()) at time zone 'Africa/Johannesburg')::date;
  v_period_end date := (date_trunc('week', coalesce(p_now, now()) at time zone 'Africa/Johannesburg') + interval '6 days')::date;
  v_report_period text;
  v_created integer := 0;
  v_checked integer := 0;
  v_event_id uuid;
  v_leads_created integer := 0;
  v_leads_open integer := 0;
  v_transactions_active integer := 0;
  v_transactions_created integer := 0;
  v_tasks_due integer := 0;
  v_tasks_overdue integer := 0;
  v_role text;
begin
  v_report_period := to_char(v_period_start, 'DD Mon YYYY') || ' - ' || to_char(v_period_end, 'DD Mon YYYY');

  for v_member in
    select
      member.organization_id as organisation_id,
      member.user_id,
      lower(coalesce(member.organization_role, 'member')) as role_key,
      lower(nullif(trim(profile.email), '')) as email,
      nullif(trim(coalesce(profile.full_name, profile.email)), '') as name
    from public.organization_members member
    join public.profiles profile on profile.id = member.user_id
    where coalesce(member.membership_status, 'active') = 'active'
      and nullif(trim(profile.email), '') is not null
    order by member.created_at desc nulls last
    limit greatest(1, least(coalesce(p_limit, 500), 2000))
  loop
    v_checked := v_checked + 1;
    v_role := coalesce(v_member.role_key, 'member');

    select
      count(*) filter (where lead.created_at >= v_period_start and lead.created_at < v_period_start + interval '7 days'),
      count(*) filter (where lower(coalesce(to_jsonb(lead)->>'stage', to_jsonb(lead)->>'status', 'open')) not in ('closed', 'archived', 'converted', 'lost'))
    into v_leads_created, v_leads_open
    from public.leads lead
    where lead.organisation_id = v_member.organisation_id
      and coalesce(lead.assigned_user_id, lead.assigned_agent_id) = v_member.user_id;

    select
      count(*) filter (where lower(coalesce(to_jsonb(tx)->>'lifecycle_state', to_jsonb(tx)->>'status', 'active')) not in ('closed', 'completed', 'cancelled', 'canceled', 'archived')),
      count(*) filter (where tx.created_at >= v_period_start and tx.created_at < v_period_start + interval '7 days')
    into v_transactions_active, v_transactions_created
    from public.transactions tx
    where tx.organisation_id = v_member.organisation_id
      and coalesce(tx.owner_user_id, tx.assigned_user_id, tx.assigned_agent_id) = v_member.user_id;

    if to_regclass('public.tasks') is not null then
      select
        count(*) filter (where task.due_date::date >= v_period_start and task.due_date::date < v_period_start + 7),
        count(*) filter (where task.due_date::date < coalesce(p_now, now())::date and lower(coalesce(task.status, 'open')) not in ('done', 'completed', 'closed'))
      into v_tasks_due, v_tasks_overdue
      from public.tasks task
      where task.organisation_id = v_member.organisation_id
        and task.assigned_agent_id = v_member.user_id;
    else
      v_tasks_due := 0;
      v_tasks_overdue := 0;
    end if;

    if v_role in ('agent', 'member', 'consultant', 'commercial_broker') then
      v_event_id := public.bridge_queue_weekly_digest_event_phase7(
        'agent_weekly_lead_digest',
        v_member.organisation_id,
        v_member.email,
        'agent',
        v_member.user_id,
        'Your weekly lead digest: ' || v_report_period,
        'Weekly lead activity summary for ' || v_report_period || '.',
        jsonb_build_object(
          'recipientName', v_member.name,
          'reportPeriod', v_report_period,
          'summaryItems', jsonb_build_array(
            jsonb_build_object('label', 'New Leads', 'value', v_leads_created),
            jsonb_build_object('label', 'Open Leads', 'value', v_leads_open)
          ),
          'sections', jsonb_build_array(jsonb_build_object(
            'title', 'Lead Focus',
            'items', jsonb_build_array(
              jsonb_build_object('label', 'New leads this week', 'detail', v_leads_created::text),
              jsonb_build_object('label', 'Open assigned leads', 'detail', v_leads_open::text)
            )
          ))
        ),
        jsonb_build_object('reportPeriod', v_report_period, 'weekKey', v_week_key),
        'agent_weekly_lead_digest:' || v_member.organisation_id::text || ':' || v_member.user_id::text || ':' || v_week_key,
        coalesce(p_now, now()),
        p_dry_run
      );
      if v_event_id is not null then v_created := v_created + 1; end if;

      v_event_id := public.bridge_queue_weekly_digest_event_phase7(
        'agent_weekly_transaction_digest',
        v_member.organisation_id,
        v_member.email,
        'agent',
        v_member.user_id,
        'Your weekly transaction digest: ' || v_report_period,
        'Weekly transaction activity summary for ' || v_report_period || '.',
        jsonb_build_object(
          'recipientName', v_member.name,
          'reportPeriod', v_report_period,
          'summaryItems', jsonb_build_array(
            jsonb_build_object('label', 'New Transactions', 'value', v_transactions_created),
            jsonb_build_object('label', 'Active Transactions', 'value', v_transactions_active)
          ),
          'sections', jsonb_build_array(jsonb_build_object(
            'title', 'Transaction Focus',
            'items', jsonb_build_array(
              jsonb_build_object('label', 'New transactions this week', 'detail', v_transactions_created::text),
              jsonb_build_object('label', 'Active assigned transactions', 'detail', v_transactions_active::text)
            )
          ))
        ),
        jsonb_build_object('reportPeriod', v_report_period, 'weekKey', v_week_key),
        'agent_weekly_transaction_digest:' || v_member.organisation_id::text || ':' || v_member.user_id::text || ':' || v_week_key,
        coalesce(p_now, now()),
        p_dry_run
      );
      if v_event_id is not null then v_created := v_created + 1; end if;

      v_event_id := public.bridge_queue_weekly_digest_event_phase7(
        'agent_weekly_task_digest',
        v_member.organisation_id,
        v_member.email,
        'agent',
        v_member.user_id,
        'Your weekly task digest: ' || v_report_period,
        'Weekly task activity summary for ' || v_report_period || '.',
        jsonb_build_object(
          'recipientName', v_member.name,
          'reportPeriod', v_report_period,
          'summaryItems', jsonb_build_array(
            jsonb_build_object('label', 'Tasks Due', 'value', v_tasks_due),
            jsonb_build_object('label', 'Overdue Tasks', 'value', v_tasks_overdue)
          )
        ),
        jsonb_build_object('reportPeriod', v_report_period, 'weekKey', v_week_key),
        'agent_weekly_task_digest:' || v_member.organisation_id::text || ':' || v_member.user_id::text || ':' || v_week_key,
        coalesce(p_now, now()),
        p_dry_run
      );
      if v_event_id is not null then v_created := v_created + 1; end if;
    end if;

    if v_role in ('manager', 'branch_manager', 'admin', 'principal', 'owner', 'director') then
      select
        count(*) filter (where lead.created_at >= v_period_start and lead.created_at < v_period_start + interval '7 days'),
        count(*) filter (where lower(coalesce(to_jsonb(lead)->>'stage', to_jsonb(lead)->>'status', 'open')) not in ('closed', 'archived', 'converted', 'lost'))
      into v_leads_created, v_leads_open
      from public.leads lead
      where lead.organisation_id = v_member.organisation_id;

      select
        count(*) filter (where lower(coalesce(to_jsonb(tx)->>'lifecycle_state', to_jsonb(tx)->>'status', 'active')) not in ('closed', 'completed', 'cancelled', 'canceled', 'archived')),
        count(*) filter (where tx.created_at >= v_period_start and tx.created_at < v_period_start + interval '7 days')
      into v_transactions_active, v_transactions_created
      from public.transactions tx
      where tx.organisation_id = v_member.organisation_id;

      v_event_id := public.bridge_queue_weekly_digest_event_phase7(
        case when v_role in ('principal', 'owner', 'director') then 'principal_weekly_business_digest' else 'manager_weekly_team_digest' end,
        v_member.organisation_id,
        v_member.email,
        case when v_role in ('principal', 'owner', 'director') then 'principal' else 'manager' end,
        v_member.user_id,
        'Your weekly account digest: ' || v_report_period,
        'Weekly account activity summary for ' || v_report_period || '.',
        jsonb_build_object(
          'recipientName', v_member.name,
          'reportPeriod', v_report_period,
          'summaryItems', jsonb_build_array(
            jsonb_build_object('label', 'New Leads', 'value', v_leads_created),
            jsonb_build_object('label', 'Open Leads', 'value', v_leads_open),
            jsonb_build_object('label', 'New Transactions', 'value', v_transactions_created),
            jsonb_build_object('label', 'Active Transactions', 'value', v_transactions_active)
          ),
          'sections', jsonb_build_array(jsonb_build_object(
            'title', 'Account Focus',
            'items', jsonb_build_array(
              jsonb_build_object('label', 'Lead intake', 'detail', v_leads_created::text || ' new / ' || v_leads_open::text || ' open'),
              jsonb_build_object('label', 'Transactions', 'detail', v_transactions_created::text || ' new / ' || v_transactions_active::text || ' active')
            )
          ))
        ),
        jsonb_build_object('reportPeriod', v_report_period, 'weekKey', v_week_key),
        (case when v_role in ('principal', 'owner', 'director') then 'principal_weekly_business_digest' else 'manager_weekly_team_digest' end) || ':' || v_member.organisation_id::text || ':' || v_member.user_id::text || ':' || v_week_key,
        coalesce(p_now, now()),
        p_dry_run
      );
      if v_event_id is not null then v_created := v_created + 1; end if;
    end if;

    if v_role in ('commercial_broker', 'commercial_agent') then
      v_event_id := public.bridge_queue_weekly_digest_event_phase7(
        'commercial_weekly_pipeline_digest',
        v_member.organisation_id,
        v_member.email,
        'commercial_broker',
        v_member.user_id,
        'Your weekly commercial pipeline digest: ' || v_report_period,
        'Weekly commercial pipeline summary for ' || v_report_period || '.',
        jsonb_build_object(
          'recipientName', v_member.name,
          'reportPeriod', v_report_period,
          'summaryItems', jsonb_build_array(
            jsonb_build_object('label', 'New Leads', 'value', v_leads_created),
            jsonb_build_object('label', 'Active Transactions', 'value', v_transactions_active)
          )
        ),
        jsonb_build_object('reportPeriod', v_report_period, 'weekKey', v_week_key),
        'commercial_weekly_pipeline_digest:' || v_member.organisation_id::text || ':' || v_member.user_id::text || ':' || v_week_key,
        coalesce(p_now, now()),
        p_dry_run
      );
      if v_event_id is not null then v_created := v_created + 1; end if;
    end if;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'phase', 'phase_7_weekly_digests',
    'weekKey', v_week_key,
    'reportPeriod', v_report_period,
    'checkedRecipients', v_checked,
    'queuedEvents', v_created,
    'dryRun', coalesce(p_dry_run, false)
  );
end;
$$;

create or replace function public.bridge_claim_weekly_digest_notifications_phase7(
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
    where event.automation_key = any (public.bridge_weekly_digest_keys_phase7())
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
