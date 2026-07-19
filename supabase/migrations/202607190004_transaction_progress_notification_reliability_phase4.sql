begin;

create table if not exists public.notification_recipient_preferences (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  recipient_email text not null,
  email_enabled boolean not null default true,
  whatsapp_enabled boolean not null default false,
  disabled_reason text,
  bounced_at timestamptz,
  complained_at timestamptz,
  suppressed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notification_recipient_preferences_email_check
    check (recipient_email = lower(trim(recipient_email)) and position('@' in recipient_email) > 1),
  unique (organisation_id, recipient_email)
);

create table if not exists public.notification_provider_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  provider_event_id text not null,
  event_type text not null,
  provider_message_id text,
  payload_json jsonb not null default '{}'::jsonb,
  processing_status text not null default 'received',
  processing_error text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  constraint notification_provider_webhook_events_status_check
    check (processing_status in ('received', 'processed', 'ignored', 'failed')),
  unique (provider, provider_event_id)
);

create index if not exists notification_recipient_preferences_org_idx
  on public.notification_recipient_preferences (organisation_id, updated_at desc);
create index if not exists notification_provider_webhook_message_idx
  on public.notification_provider_webhook_events (provider, provider_message_id, received_at desc);

alter table public.notification_recipient_preferences enable row level security;
alter table public.notification_provider_webhook_events enable row level security;

drop policy if exists notification_recipient_preferences_select_member
  on public.notification_recipient_preferences;
create policy notification_recipient_preferences_select_member
  on public.notification_recipient_preferences
  for select to authenticated
  using (public.bridge_is_active_member(organisation_id));

drop policy if exists notification_recipient_preferences_manage_admin
  on public.notification_recipient_preferences;
create policy notification_recipient_preferences_manage_admin
  on public.notification_recipient_preferences
  for all to authenticated
  using (public.bridge_is_org_admin(organisation_id))
  with check (public.bridge_is_org_admin(organisation_id));

grant select on public.notification_recipient_preferences to authenticated;
grant insert, update on public.notification_recipient_preferences to authenticated;

create or replace function public.bridge_notification_recipient_preference_guard_phase4()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_preference public.notification_recipient_preferences%rowtype;
begin
  if new.automation_key <> 'transaction_progress_changed' then
    return new;
  end if;
  select * into v_preference
  from public.notification_recipient_preferences preference
  where preference.organisation_id = new.organisation_id
    and preference.recipient_email = lower(trim(coalesce(new.recipient_email, '')));

  if new.channel = 'email' and v_preference.id is not null and not v_preference.email_enabled then
    new.status := 'skipped';
    new.next_dispatch_attempt_at := null;
    new.metadata_json := coalesce(new.metadata_json, '{}'::jsonb) || jsonb_build_object(
      'skipReason', coalesce(v_preference.disabled_reason, 'email_disabled_by_preference')
    );
  elsif new.channel = 'whatsapp' and (
    v_preference.id is null or not v_preference.whatsapp_enabled
  ) then
    new.status := 'skipped';
    new.next_dispatch_attempt_at := null;
    new.metadata_json := coalesce(new.metadata_json, '{}'::jsonb) || jsonb_build_object(
      'skipReason', 'whatsapp_disabled_by_preference'
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notification_recipient_preference_guard_phase4
  on public.notification_events;
create trigger trg_notification_recipient_preference_guard_phase4
before insert on public.notification_events
for each row execute function public.bridge_notification_recipient_preference_guard_phase4();

create or replace function public.bridge_set_notification_recipient_preference_phase4(
  p_organisation_id uuid,
  p_recipient_email text,
  p_email_enabled boolean default true,
  p_whatsapp_enabled boolean default false
)
returns public.notification_recipient_preferences
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(trim(coalesce(p_recipient_email, '')));
  v_result public.notification_recipient_preferences%rowtype;
begin
  if auth.uid() is null or not public.bridge_is_org_admin(p_organisation_id) then
    raise exception 'Organisation administrator access is required.' using errcode = '42501';
  end if;
  if position('@' in v_email) <= 1 then
    raise exception 'A valid recipient email is required.' using errcode = '22023';
  end if;

  insert into public.notification_recipient_preferences (
    organisation_id, recipient_email, email_enabled, whatsapp_enabled,
    disabled_reason, updated_at
  ) values (
    p_organisation_id, v_email, coalesce(p_email_enabled, true),
    coalesce(p_whatsapp_enabled, false),
    case when coalesce(p_email_enabled, true) then null else 'disabled_by_organisation_admin' end,
    now()
  )
  on conflict (organisation_id, recipient_email) do update set
    email_enabled = excluded.email_enabled,
    whatsapp_enabled = excluded.whatsapp_enabled,
    disabled_reason = excluded.disabled_reason,
    updated_at = now()
  returning * into v_result;
  return v_result;
end;
$$;

revoke all on function public.bridge_set_notification_recipient_preference_phase4(uuid, text, boolean, boolean) from public;
grant execute on function public.bridge_set_notification_recipient_preference_phase4(uuid, text, boolean, boolean) to authenticated;

create or replace function public.bridge_transaction_progress_notification_health_phase4(
  p_organisation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  v_result jsonb;
begin
  if auth.uid() is null or not public.bridge_is_active_member(p_organisation_id) then
    raise exception 'Organisation membership is required.' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'organisationId', p_organisation_id,
    'queued', count(*) filter (where event.status = 'queued'),
    'processing', count(*) filter (where event.status = 'processing'),
    'failedRetryable', count(*) filter (
      where event.status = 'failed'
        and event.dispatch_attempt_count < event.max_dispatch_attempts
        and event.next_dispatch_attempt_at is not null
    ),
    'failedExhausted', count(*) filter (
      where event.status = 'failed'
        and (event.dispatch_attempt_count >= event.max_dispatch_attempts or event.next_dispatch_attempt_at is null)
    ),
    'sent', count(*) filter (where event.status = 'sent'),
    'delivered', count(*) filter (where event.status = 'delivered'),
    'skipped', count(*) filter (where event.status = 'skipped'),
    'oldestPendingAt', min(coalesce(event.next_dispatch_attempt_at, event.queued_at, event.created_at)) filter (
      where event.status in ('queued', 'processing', 'failed')
    ),
    'lastDeliveredAt', max(event.delivered_at),
    'generatedAt', now()
  ) into v_result
  from public.notification_events event
  where event.organisation_id = p_organisation_id
    and event.automation_key = 'transaction_progress_changed';
  return v_result;
end;
$$;

revoke all on function public.bridge_transaction_progress_notification_health_phase4(uuid) from public;
grant execute on function public.bridge_transaction_progress_notification_health_phase4(uuid) to authenticated;

notify pgrst, 'reload schema';
commit;
