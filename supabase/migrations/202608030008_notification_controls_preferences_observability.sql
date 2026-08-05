begin;

create extension if not exists "pgcrypto";

create table if not exists public.notification_recipient_preferences (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid references public.organisations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  recipient_email text,
  recipient_role text,
  automation_key text references public.notification_automation_definitions(automation_key)
    on update cascade
    on delete cascade,
  channel text not null default 'email',
  enabled boolean not null default true,
  frequency text not null default 'immediate',
  quiet_hours_enabled boolean not null default false,
  quiet_hours_start_hour integer not null default 18,
  quiet_hours_end_hour integer not null default 8,
  quiet_hours_timezone text not null default 'Africa/Johannesburg',
  muted_until timestamptz,
  unsubscribe_token text not null default encode(gen_random_bytes(24), 'hex'),
  source text not null default 'account_settings',
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notification_recipient_preferences_channel_check
    check (channel in ('email', 'in_app', 'whatsapp', 'sms')),
  constraint notification_recipient_preferences_frequency_check
    check (frequency in ('immediate', 'hourly', 'daily', 'weekly', 'muted')),
  constraint notification_recipient_preferences_quiet_start_check
    check (quiet_hours_start_hour between 0 and 23),
  constraint notification_recipient_preferences_quiet_end_check
    check (quiet_hours_end_hour between 0 and 23),
  constraint notification_recipient_preferences_scope_check
    check (user_id is not null or nullif(trim(coalesce(recipient_email, '')), '') is not null)
);

alter table public.notification_recipient_preferences
  add column if not exists user_id uuid references auth.users(id) on delete cascade,
  add column if not exists recipient_role text,
  add column if not exists automation_key text references public.notification_automation_definitions(automation_key)
    on update cascade
    on delete cascade,
  add column if not exists channel text not null default 'email',
  add column if not exists enabled boolean not null default true,
  add column if not exists frequency text not null default 'immediate',
  add column if not exists quiet_hours_enabled boolean not null default false,
  add column if not exists quiet_hours_start_hour integer not null default 18,
  add column if not exists quiet_hours_end_hour integer not null default 8,
  add column if not exists quiet_hours_timezone text not null default 'Africa/Johannesburg',
  add column if not exists muted_until timestamptz,
  add column if not exists unsubscribe_token text not null default encode(gen_random_bytes(24), 'hex'),
  add column if not exists source text not null default 'account_settings',
  add column if not exists metadata_json jsonb not null default '{}'::jsonb;

create unique index if not exists notification_recipient_preferences_scope_idx
  on public.notification_recipient_preferences (
    coalesce(organisation_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(user_id, '00000000-0000-0000-0000-000000000000'::uuid),
    lower(coalesce(recipient_email, '')),
    coalesce(recipient_role, ''),
    coalesce(automation_key, '*'),
    channel
  );

create unique index if not exists notification_recipient_preferences_unsubscribe_idx
  on public.notification_recipient_preferences (unsubscribe_token);

create index if not exists notification_recipient_preferences_org_idx
  on public.notification_recipient_preferences (organisation_id, automation_key, channel, updated_at desc);

create table if not exists public.notification_suppression_list (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid references public.organisations(id) on delete cascade,
  recipient_email text not null,
  recipient_role text,
  automation_key text references public.notification_automation_definitions(automation_key)
    on update cascade
    on delete cascade,
  channel text not null default 'email',
  reason text not null,
  active boolean not null default true,
  source text not null default 'manual',
  expires_at timestamptz,
  metadata_json jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notification_suppression_list_channel_check
    check (channel in ('email', 'in_app', 'whatsapp', 'sms')),
  constraint notification_suppression_list_reason_check
    check (reason in (
      'unsubscribe',
      'bounce',
      'complaint',
      'manual',
      'test_recipient',
      'invalid_recipient',
      'role_disabled',
      'compliance_hold'
    )),
  constraint notification_suppression_list_email_check
    check (length(trim(recipient_email)) > 0)
);

create unique index if not exists notification_suppression_list_active_scope_idx
  on public.notification_suppression_list (
    coalesce(organisation_id, '00000000-0000-0000-0000-000000000000'::uuid),
    lower(recipient_email),
    coalesce(recipient_role, ''),
    coalesce(automation_key, '*'),
    channel
  )
  where active;

create index if not exists notification_suppression_list_lookup_idx
  on public.notification_suppression_list (
    lower(recipient_email),
    channel,
    active,
    expires_at
  );

create table if not exists public.notification_delivery_attempts (
  id uuid primary key default gen_random_uuid(),
  notification_event_id uuid references public.notification_events(id) on delete set null,
  communication_delivery_id uuid references public.communication_deliveries(id) on delete set null,
  organisation_id uuid references public.organisations(id) on delete cascade,
  automation_key text references public.notification_automation_definitions(automation_key)
    on update cascade
    on delete set null,
  channel text not null default 'email',
  recipient_email text,
  recipient_role text,
  attempt_number integer not null default 1,
  status text not null,
  provider text,
  provider_message_id text,
  error_message text,
  latency_ms integer,
  control_decision jsonb not null default '{}'::jsonb,
  metadata_json jsonb not null default '{}'::jsonb,
  attempted_at timestamptz not null default now(),
  constraint notification_delivery_attempts_channel_check
    check (channel in ('email', 'in_app', 'whatsapp', 'sms')),
  constraint notification_delivery_attempts_attempt_check
    check (attempt_number > 0),
  constraint notification_delivery_attempts_status_check
    check (status in ('queued', 'sent', 'delivered', 'failed', 'skipped', 'deferred', 'suppressed'))
);

create index if not exists notification_delivery_attempts_event_idx
  on public.notification_delivery_attempts (notification_event_id, attempted_at desc);

create index if not exists notification_delivery_attempts_org_status_idx
  on public.notification_delivery_attempts (organisation_id, status, attempted_at desc);

create index if not exists notification_delivery_attempts_automation_idx
  on public.notification_delivery_attempts (organisation_id, automation_key, status, attempted_at desc);

create table if not exists public.notification_observability_daily_rollups (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid references public.organisations(id) on delete cascade,
  rollup_date date not null,
  automation_key text references public.notification_automation_definitions(automation_key)
    on update cascade
    on delete set null,
  channel text not null default 'email',
  queued_count integer not null default 0,
  sent_count integer not null default 0,
  delivered_count integer not null default 0,
  failed_count integer not null default 0,
  skipped_count integer not null default 0,
  suppressed_count integer not null default 0,
  deferred_count integer not null default 0,
  average_latency_ms integer,
  metadata_json jsonb not null default '{}'::jsonb,
  generated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notification_observability_daily_rollups_channel_check
    check (channel in ('email', 'in_app', 'whatsapp', 'sms'))
);

create unique index if not exists notification_observability_daily_rollups_scope_idx
  on public.notification_observability_daily_rollups (
    coalesce(organisation_id, '00000000-0000-0000-0000-000000000000'::uuid),
    rollup_date,
    coalesce(automation_key, '*'),
    channel
  );

create or replace function public.bridge_set_notification_controls_updated_at_phase9()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_notification_recipient_preferences_updated_at
  on public.notification_recipient_preferences;
create trigger trg_notification_recipient_preferences_updated_at
before update on public.notification_recipient_preferences
for each row execute function public.bridge_set_notification_controls_updated_at_phase9();

drop trigger if exists trg_notification_suppression_list_updated_at
  on public.notification_suppression_list;
create trigger trg_notification_suppression_list_updated_at
before update on public.notification_suppression_list
for each row execute function public.bridge_set_notification_controls_updated_at_phase9();

drop trigger if exists trg_notification_observability_daily_rollups_updated_at
  on public.notification_observability_daily_rollups;
create trigger trg_notification_observability_daily_rollups_updated_at
before update on public.notification_observability_daily_rollups
for each row execute function public.bridge_set_notification_controls_updated_at_phase9();

create or replace function public.bridge_notification_is_quiet_hours_phase9(
  p_now timestamptz,
  p_timezone text,
  p_start_hour integer,
  p_end_hour integer
)
returns boolean
language plpgsql
stable
as $$
declare
  v_hour integer;
  v_start integer := greatest(0, least(23, coalesce(p_start_hour, 18)));
  v_end integer := greatest(0, least(23, coalesce(p_end_hour, 8)));
begin
  if v_start = v_end then
    return false;
  end if;

  begin
    v_hour := extract(hour from coalesce(p_now, now()) at time zone coalesce(nullif(trim(p_timezone), ''), 'UTC'))::integer;
  exception when others then
    v_hour := extract(hour from coalesce(p_now, now()) at time zone 'UTC')::integer;
  end;

  if v_start < v_end then
    return v_hour >= v_start and v_hour < v_end;
  end if;

  return v_hour >= v_start or v_hour < v_end;
end;
$$;

create or replace function public.bridge_resolve_notification_recipient_control_phase9(
  p_organisation_id uuid,
  p_recipient_email text,
  p_recipient_user_id uuid default null,
  p_recipient_role text default null,
  p_automation_key text default null,
  p_channel text default 'email',
  p_now timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(coalesce(p_recipient_email, '')));
  v_channel text := lower(trim(coalesce(p_channel, 'email')));
  v_role text := lower(trim(coalesce(p_recipient_role, '')));
  v_suppression public.notification_suppression_list%rowtype;
  v_preference public.notification_recipient_preferences%rowtype;
begin
  if v_email = '' then
    return jsonb_build_object(
      'allowed', false,
      'reason', 'missing_recipient_email',
      'status', 'skipped'
    );
  end if;

  select *
    into v_suppression
  from public.notification_suppression_list suppression
  where suppression.active
    and lower(suppression.recipient_email) = v_email
    and suppression.channel = v_channel
    and (suppression.expires_at is null or suppression.expires_at > coalesce(p_now, now()))
    and (suppression.organisation_id is null or suppression.organisation_id = p_organisation_id)
    and (suppression.automation_key is null or suppression.automation_key = p_automation_key)
    and (
      nullif(trim(coalesce(suppression.recipient_role, '')), '') is null
      or lower(suppression.recipient_role) = v_role
    )
  order by
    (suppression.organisation_id is null) asc,
    (suppression.automation_key is null) asc,
    (nullif(trim(coalesce(suppression.recipient_role, '')), '') is null) asc,
    suppression.created_at desc
  limit 1;

  if found then
    return jsonb_build_object(
      'allowed', false,
      'reason', 'suppressed:' || v_suppression.reason,
      'status', 'suppressed',
      'suppressionId', v_suppression.id,
      'source', v_suppression.source,
      'expiresAt', v_suppression.expires_at
    );
  end if;

  select *
    into v_preference
  from public.notification_recipient_preferences preference
  where preference.channel = v_channel
    and (preference.organisation_id is null or preference.organisation_id = p_organisation_id)
    and (preference.automation_key is null or preference.automation_key = p_automation_key)
    and (
      (p_recipient_user_id is not null and preference.user_id = p_recipient_user_id)
      or lower(coalesce(preference.recipient_email, '')) = v_email
      or (
        v_role <> ''
        and lower(coalesce(preference.recipient_role, '')) = v_role
        and preference.user_id is null
        and nullif(trim(coalesce(preference.recipient_email, '')), '') is null
      )
    )
  order by
    (preference.organisation_id is null) asc,
    (preference.automation_key is null) asc,
    (preference.user_id is null) asc,
    (nullif(trim(coalesce(preference.recipient_email, '')), '') is null) asc,
    preference.updated_at desc
  limit 1;

  if found then
    if not v_preference.enabled or v_preference.frequency = 'muted' then
      return jsonb_build_object(
        'allowed', false,
        'reason', 'preference_disabled',
        'status', 'skipped',
        'preferenceId', v_preference.id,
        'frequency', v_preference.frequency
      );
    end if;

    if v_preference.muted_until is not null and v_preference.muted_until > coalesce(p_now, now()) then
      return jsonb_build_object(
        'allowed', false,
        'reason', 'muted_until',
        'status', 'deferred',
        'preferenceId', v_preference.id,
        'mutedUntil', v_preference.muted_until
      );
    end if;

    if v_preference.quiet_hours_enabled
       and public.bridge_notification_is_quiet_hours_phase9(
         coalesce(p_now, now()),
         v_preference.quiet_hours_timezone,
         v_preference.quiet_hours_start_hour,
         v_preference.quiet_hours_end_hour
       ) then
      return jsonb_build_object(
        'allowed', false,
        'reason', 'quiet_hours',
        'status', 'deferred',
        'preferenceId', v_preference.id,
        'deferUntil', coalesce(p_now, now()) + interval '1 hour',
        'timezone', v_preference.quiet_hours_timezone
      );
    end if;

    return jsonb_build_object(
      'allowed', true,
      'reason', 'allowed_by_preference',
      'status', 'allowed',
      'preferenceId', v_preference.id,
      'frequency', v_preference.frequency
    );
  end if;

  return jsonb_build_object(
    'allowed', true,
    'reason', 'allowed_default',
    'status', 'allowed'
  );
end;
$$;

create or replace function public.bridge_record_notification_delivery_attempt_phase9(
  p_notification_event_id uuid,
  p_communication_delivery_id uuid default null,
  p_organisation_id uuid default null,
  p_automation_key text default null,
  p_channel text default 'email',
  p_recipient_email text default null,
  p_recipient_role text default null,
  p_attempt_number integer default null,
  p_status text default 'queued',
  p_provider text default null,
  p_provider_message_id text default null,
  p_error_message text default null,
  p_latency_ms integer default null,
  p_control_decision jsonb default '{}'::jsonb,
  p_metadata_json jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.notification_events%rowtype;
  v_attempt_number integer := greatest(1, coalesce(p_attempt_number, 1));
  v_attempt_id uuid;
begin
  if p_notification_event_id is not null then
    select * into v_event
    from public.notification_events
    where id = p_notification_event_id;

    if found then
      v_attempt_number := greatest(1, coalesce(p_attempt_number, v_event.dispatch_attempt_count, 0));
    end if;
  end if;

  insert into public.notification_delivery_attempts (
    notification_event_id,
    communication_delivery_id,
    organisation_id,
    automation_key,
    channel,
    recipient_email,
    recipient_role,
    attempt_number,
    status,
    provider,
    provider_message_id,
    error_message,
    latency_ms,
    control_decision,
    metadata_json
  )
  values (
    p_notification_event_id,
    p_communication_delivery_id,
    coalesce(p_organisation_id, v_event.organisation_id),
    coalesce(nullif(trim(coalesce(p_automation_key, '')), ''), v_event.automation_key),
    lower(trim(coalesce(p_channel, v_event.channel, 'email'))),
    lower(trim(coalesce(p_recipient_email, v_event.recipient_email, ''))),
    lower(trim(coalesce(p_recipient_role, v_event.recipient_role, ''))),
    v_attempt_number,
    lower(trim(coalesce(p_status, 'queued'))),
    nullif(trim(coalesce(p_provider, '')), ''),
    nullif(trim(coalesce(p_provider_message_id, '')), ''),
    nullif(trim(coalesce(p_error_message, '')), ''),
    p_latency_ms,
    coalesce(p_control_decision, '{}'::jsonb),
    coalesce(p_metadata_json, '{}'::jsonb)
  )
  returning id into v_attempt_id;

  return v_attempt_id;
end;
$$;

create or replace function public.bridge_apply_notification_preferences_to_queue_phase9(
  p_limit integer default 500,
  p_now timestamptz default now(),
  p_dry_run boolean default false,
  p_event_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event record;
  v_decision jsonb;
  v_checked integer := 0;
  v_allowed integer := 0;
  v_skipped integer := 0;
  v_deferred integer := 0;
  v_reason text;
  v_defer_until timestamptz;
begin
  for v_event in
    select *
    from public.notification_events
    where status = 'queued'
      and channel = 'email'
      and recipient_email is not null
      and (p_event_id is null or id = p_event_id)
      and (next_dispatch_attempt_at is null or next_dispatch_attempt_at <= coalesce(p_now, now()))
    order by queued_at asc nulls last, created_at asc
    limit case when p_event_id is not null then 1 else greatest(1, least(coalesce(p_limit, 500), 5000)) end
  loop
    v_checked := v_checked + 1;
    v_decision := public.bridge_resolve_notification_recipient_control_phase9(
      v_event.organisation_id,
      v_event.recipient_email,
      v_event.assigned_user_id,
      v_event.recipient_role,
      v_event.automation_key,
      v_event.channel,
      coalesce(p_now, now())
    );

    if coalesce((v_decision ->> 'allowed')::boolean, false) then
      v_allowed := v_allowed + 1;
    else
      v_reason := coalesce(v_decision ->> 'reason', 'blocked_by_notification_controls');
      v_defer_until := nullif(v_decision ->> 'deferUntil', '')::timestamptz;

      if coalesce(v_decision ->> 'status', '') = 'deferred' then
        v_deferred := v_deferred + 1;
        if not p_dry_run then
          update public.notification_events
             set status = 'queued',
                 next_dispatch_attempt_at = coalesce(v_defer_until, coalesce(p_now, now()) + interval '1 hour'),
                 last_dispatch_error = v_reason,
                 metadata_json = coalesce(metadata_json, '{}'::jsonb) ||
                   jsonb_build_object('phase9ControlDecision', v_decision)
           where id = v_event.id;

          perform public.bridge_record_notification_delivery_attempt_phase9(
            v_event.id,
            null,
            v_event.organisation_id,
            v_event.automation_key,
            v_event.channel,
            v_event.recipient_email,
            v_event.recipient_role,
            greatest(1, coalesce(v_event.dispatch_attempt_count, 0)),
            'deferred',
            null,
            null,
            v_reason,
            null,
            v_decision,
            jsonb_build_object('source', 'phase9_queue_controls')
          );
        end if;
      else
        v_skipped := v_skipped + 1;
        if not p_dry_run then
          update public.notification_events
             set status = 'skipped',
                 error_message = v_reason,
                 last_dispatch_error = null,
                 failed_at = null,
                 next_dispatch_attempt_at = null,
                 metadata_json = coalesce(metadata_json, '{}'::jsonb) ||
                   jsonb_build_object('phase9ControlDecision', v_decision)
           where id = v_event.id;

          perform public.bridge_record_notification_delivery_attempt_phase9(
            v_event.id,
            null,
            v_event.organisation_id,
            v_event.automation_key,
            v_event.channel,
            v_event.recipient_email,
            v_event.recipient_role,
            greatest(1, coalesce(v_event.dispatch_attempt_count, 0)),
            coalesce(v_decision ->> 'status', 'skipped'),
            null,
            null,
            v_reason,
            null,
            v_decision,
            jsonb_build_object('source', 'phase9_queue_controls')
          );
        end if;
      end if;
    end if;
  end loop;

  return jsonb_build_object(
    'checked', v_checked,
    'allowed', v_allowed,
    'skipped', v_skipped,
    'deferred', v_deferred,
    'dryRun', p_dry_run,
    'generatedAt', now()
  );
end;
$$;

create or replace function public.bridge_notification_observability_snapshot_phase9(
  p_organisation_id uuid default null,
  p_since timestamptz default now() - interval '7 days'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_since timestamptz := coalesce(p_since, now() - interval '7 days');
  v_event_status_counts jsonb := '{}'::jsonb;
  v_delivery_status_counts jsonb := '{}'::jsonb;
  v_attempt_status_counts jsonb := '{}'::jsonb;
  v_failure_counts jsonb := '[]'::jsonb;
  v_recent_failures jsonb := '[]'::jsonb;
  v_suppression_counts jsonb := '{}'::jsonb;
  v_totals jsonb := '{}'::jsonb;
begin
  if p_organisation_id is null and auth.role() <> 'service_role' then
    return jsonb_build_object(
      'status', 'forbidden',
      'generatedAt', now(),
      'message', 'An organisationId is required for authenticated notification observability snapshots.'
    );
  end if;

  if p_organisation_id is not null
     and auth.role() <> 'service_role'
     and not public.bridge_is_active_member(p_organisation_id) then
    return jsonb_build_object(
      'status', 'forbidden',
      'organisationId', p_organisation_id,
      'generatedAt', now()
    );
  end if;

  with events as (
    select *
    from public.notification_events event
    where event.created_at >= v_since
      and (p_organisation_id is null or event.organisation_id = p_organisation_id)
  ),
  counts as (
    select status, count(*)::integer as count
    from events
    group by status
  )
  select coalesce(jsonb_object_agg(status, count order by status), '{}'::jsonb)
    into v_event_status_counts
  from counts;

  with deliveries as (
    select *
    from public.communication_deliveries delivery
    where delivery.created_at >= v_since
      and (p_organisation_id is null or delivery.organisation_id = p_organisation_id)
  ),
  counts as (
    select status, count(*)::integer as count
    from deliveries
    group by status
  )
  select coalesce(jsonb_object_agg(status, count order by status), '{}'::jsonb)
    into v_delivery_status_counts
  from counts;

  with attempts as (
    select *
    from public.notification_delivery_attempts attempt
    where attempt.attempted_at >= v_since
      and (p_organisation_id is null or attempt.organisation_id = p_organisation_id)
  ),
  counts as (
    select status, count(*)::integer as count
    from attempts
    group by status
  )
  select coalesce(jsonb_object_agg(status, count order by status), '{}'::jsonb)
    into v_attempt_status_counts
  from counts;

  with attempts as (
    select *
    from public.notification_delivery_attempts attempt
    where attempt.attempted_at >= v_since
      and (p_organisation_id is null or attempt.organisation_id = p_organisation_id)
  ),
  failure_counts as (
    select automation_key, count(*)::integer as count
    from attempts
    where status in ('failed', 'suppressed', 'skipped')
    group by automation_key
    order by count(*) desc
    limit 20
  )
  select coalesce(jsonb_agg(to_jsonb(failure_counts) order by count desc), '[]'::jsonb)
    into v_failure_counts
  from failure_counts;

  with attempts as (
    select *
    from public.notification_delivery_attempts attempt
    where attempt.attempted_at >= v_since
      and (p_organisation_id is null or attempt.organisation_id = p_organisation_id)
      and attempt.status = 'failed'
    order by attempt.attempted_at desc
    limit 12
  )
  select coalesce(jsonb_agg(to_jsonb(attempts) order by attempted_at desc), '[]'::jsonb)
    into v_recent_failures
  from attempts;

  with suppressions as (
    select *
    from public.notification_suppression_list suppression
    where suppression.active
      and (suppression.expires_at is null or suppression.expires_at > now())
      and (p_organisation_id is null or suppression.organisation_id = p_organisation_id)
  ),
  counts as (
    select reason, count(*)::integer as count
    from suppressions
    group by reason
  )
  select coalesce(jsonb_object_agg(reason, count order by reason), '{}'::jsonb)
    into v_suppression_counts
  from counts;

  with events as (
    select *
    from public.notification_events event
    where event.created_at >= v_since
      and (p_organisation_id is null or event.organisation_id = p_organisation_id)
  ),
  deliveries as (
    select *
    from public.communication_deliveries delivery
    where delivery.created_at >= v_since
      and (p_organisation_id is null or delivery.organisation_id = p_organisation_id)
  ),
  attempts as (
    select *
    from public.notification_delivery_attempts attempt
    where attempt.attempted_at >= v_since
      and (p_organisation_id is null or attempt.organisation_id = p_organisation_id)
  )
  select jsonb_build_object(
    'events', (select count(*)::integer from events),
    'deliveries', (select count(*)::integer from deliveries),
    'attempts', (select count(*)::integer from attempts),
    'sentDeliveries', (select count(*)::integer from deliveries where status in ('sent', 'delivered')),
    'failedDeliveries', (select count(*)::integer from deliveries where status = 'failed'),
    'sentAttempts', (select count(*)::integer from attempts where status in ('sent', 'delivered')),
    'failedAttempts', (select count(*)::integer from attempts where status = 'failed'),
    'suppressedAttempts', (select count(*)::integer from attempts where status = 'suppressed'),
    'deferredAttempts', (select count(*)::integer from attempts where status = 'deferred'),
    'averageLatencyMs', (
      select coalesce(round(avg(latency_ms))::integer, 0)
      from attempts
      where latency_ms is not null
    )
  )
  into v_totals;

  return jsonb_build_object(
    'status', 'ok',
    'organisationId', p_organisation_id,
    'since', v_since,
    'generatedAt', now(),
    'totals', v_totals,
    'eventStatusCounts', v_event_status_counts,
    'deliveryStatusCounts', v_delivery_status_counts,
    'attemptStatusCounts', v_attempt_status_counts,
    'failureCountsByAutomation', v_failure_counts,
    'recentFailures', v_recent_failures,
    'activeSuppressionsByReason', v_suppression_counts
  );
end;
$$;

alter table public.notification_recipient_preferences enable row level security;
alter table public.notification_suppression_list enable row level security;
alter table public.notification_delivery_attempts enable row level security;
alter table public.notification_observability_daily_rollups enable row level security;

drop policy if exists notification_recipient_preferences_service_all
  on public.notification_recipient_preferences;
create policy notification_recipient_preferences_service_all
  on public.notification_recipient_preferences
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists notification_recipient_preferences_member_select
  on public.notification_recipient_preferences;
create policy notification_recipient_preferences_member_select
  on public.notification_recipient_preferences
  for select
  to authenticated
  using (
    user_id = auth.uid()
    or (organisation_id is not null and public.bridge_is_active_member(organisation_id))
  );

drop policy if exists notification_recipient_preferences_member_insert
  on public.notification_recipient_preferences;
create policy notification_recipient_preferences_member_insert
  on public.notification_recipient_preferences
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
    or (organisation_id is not null and public.bridge_is_active_member(organisation_id))
  );

drop policy if exists notification_recipient_preferences_member_update
  on public.notification_recipient_preferences;
create policy notification_recipient_preferences_member_update
  on public.notification_recipient_preferences
  for update
  to authenticated
  using (
    user_id = auth.uid()
    or (organisation_id is not null and public.bridge_is_active_member(organisation_id))
  )
  with check (
    user_id = auth.uid()
    or (organisation_id is not null and public.bridge_is_active_member(organisation_id))
  );

drop policy if exists notification_suppression_list_service_all
  on public.notification_suppression_list;
create policy notification_suppression_list_service_all
  on public.notification_suppression_list
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists notification_suppression_list_member_select
  on public.notification_suppression_list;
create policy notification_suppression_list_member_select
  on public.notification_suppression_list
  for select
  to authenticated
  using (
    organisation_id is not null and public.bridge_is_active_member(organisation_id)
  );

drop policy if exists notification_delivery_attempts_service_all
  on public.notification_delivery_attempts;
create policy notification_delivery_attempts_service_all
  on public.notification_delivery_attempts
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists notification_delivery_attempts_member_select
  on public.notification_delivery_attempts;
create policy notification_delivery_attempts_member_select
  on public.notification_delivery_attempts
  for select
  to authenticated
  using (
    organisation_id is not null and public.bridge_is_active_member(organisation_id)
  );

drop policy if exists notification_observability_daily_rollups_service_all
  on public.notification_observability_daily_rollups;
create policy notification_observability_daily_rollups_service_all
  on public.notification_observability_daily_rollups
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists notification_observability_daily_rollups_member_select
  on public.notification_observability_daily_rollups;
create policy notification_observability_daily_rollups_member_select
  on public.notification_observability_daily_rollups
  for select
  to authenticated
  using (
    organisation_id is not null and public.bridge_is_active_member(organisation_id)
  );

grant select, insert, update on public.notification_recipient_preferences to authenticated;
grant select on public.notification_suppression_list to authenticated;
grant select on public.notification_delivery_attempts to authenticated;
grant select on public.notification_observability_daily_rollups to authenticated;
grant select, insert, update, delete on public.notification_recipient_preferences to service_role;
grant select, insert, update, delete on public.notification_suppression_list to service_role;
grant select, insert, update, delete on public.notification_delivery_attempts to service_role;
grant select, insert, update, delete on public.notification_observability_daily_rollups to service_role;

grant execute on function public.bridge_notification_is_quiet_hours_phase9(timestamptz, text, integer, integer)
  to authenticated, service_role;
grant execute on function public.bridge_resolve_notification_recipient_control_phase9(uuid, text, uuid, text, text, text, timestamptz)
  to service_role;
grant execute on function public.bridge_record_notification_delivery_attempt_phase9(uuid, uuid, uuid, text, text, text, text, integer, text, text, text, text, integer, jsonb, jsonb)
  to service_role;
grant execute on function public.bridge_apply_notification_preferences_to_queue_phase9(integer, timestamptz, boolean, uuid)
  to service_role;
grant execute on function public.bridge_notification_observability_snapshot_phase9(uuid, timestamptz)
  to authenticated, service_role;

comment on table public.notification_recipient_preferences is
  'Per-account notification controls for recipient, role, automation key, channel, frequency, quiet hours, and temporary mutes.';
comment on table public.notification_suppression_list is
  'Active notification suppression records for unsubscribes, bounces, complaints, manual holds, invalid recipients, and controlled test recipients.';
comment on table public.notification_delivery_attempts is
  'Per-dispatch notification delivery attempt telemetry linked to notification_events and communication_deliveries.';
comment on table public.notification_observability_daily_rollups is
  'Daily notification observability rollups by organisation, automation key, and channel.';
comment on function public.bridge_resolve_notification_recipient_control_phase9(uuid, text, uuid, text, text, text, timestamptz) is
  'Resolves whether a notification may be delivered to a recipient after suppression, mute, frequency, and quiet-hours controls.';
comment on function public.bridge_apply_notification_preferences_to_queue_phase9(integer, timestamptz, boolean, uuid) is
  'Applies Phase 9 recipient controls to queued notification_events, skipping suppressed notifications and deferring quiet-hours/muted notifications.';
comment on function public.bridge_notification_observability_snapshot_phase9(uuid, timestamptz) is
  'Returns a notification health snapshot with event, attempt, suppression, failure, and latency metrics.';

commit;
