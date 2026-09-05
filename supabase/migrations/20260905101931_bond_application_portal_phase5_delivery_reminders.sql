begin;

insert into public.notification_automation_definitions (
  automation_key, display_name, category, trigger_type, recipient_role, channels,
  implementation_status, default_enabled, dedupe_strategy, reminder_policy, metadata_json
) values (
  'bond_application_portal_completion_reminder',
  'Bond application completion reminder',
  'reminder',
  'scheduled_reminder',
  'buyer',
  array['email']::text[],
  'active',
  true,
  'bond_application_delivery_sequence',
  '{"cadenceDays":[1,3,7],"stopWhen":"application_submitted_or_cancelled","quietHours":{"enabled":true,"timezone":"Africa/Johannesburg","startHour":18,"endHour":8}}'::jsonb,
  '{"module":"bond_application_portal","phase":5}'::jsonb
)
on conflict (automation_key) do update
set display_name = excluded.display_name,
    implementation_status = excluded.implementation_status,
    default_enabled = excluded.default_enabled,
    reminder_policy = excluded.reminder_policy,
    metadata_json = coalesce(public.notification_automation_definitions.metadata_json, '{}'::jsonb) || excluded.metadata_json,
    updated_at = now();

create table if not exists public.bond_application_portal_delivery_events (
  id uuid primary key default gen_random_uuid(),
  export_package_id uuid not null references public.transaction_bond_application_export_packages(id) on delete cascade,
  bond_application_id uuid not null references public.bond_applications(id) on delete cascade,
  access_link_id uuid not null references public.bond_application_portal_access_links(id) on delete cascade,
  notification_event_id uuid references public.notification_events(id) on delete set null,
  delivery_kind text not null check (delivery_kind in ('manual', 'scheduled')),
  reminder_number integer not null default 0 check (reminder_number >= 0),
  recipient_email text not null,
  requested_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  unique (export_package_id, delivery_kind, reminder_number)
);

create index if not exists bond_application_portal_delivery_events_package_idx
  on public.bond_application_portal_delivery_events (export_package_id, created_at desc);
create index if not exists bond_application_portal_delivery_events_notification_idx
  on public.bond_application_portal_delivery_events (notification_event_id)
  where notification_event_id is not null;

alter table public.bond_application_portal_delivery_events enable row level security;
revoke all on public.bond_application_portal_delivery_events from public, anon;
grant select on public.bond_application_portal_delivery_events to authenticated;
grant all on public.bond_application_portal_delivery_events to service_role;

drop policy if exists bond_application_portal_delivery_events_assigned_originator_read
  on public.bond_application_portal_delivery_events;
create policy bond_application_portal_delivery_events_assigned_originator_read
  on public.bond_application_portal_delivery_events
  for select to authenticated
  using (
    exists (
      select 1
      from public.transaction_bond_originator_workspace_assignments assignment
      where assignment.export_package_id = bond_application_portal_delivery_events.export_package_id
        and assignment.assigned_to_profile_id = (select auth.uid())
        and assignment.status in ('assigned', 'accepted')
    )
  );

-- Internal service command. The plaintext token is held only in the queued
-- notification payload until the dispatcher sends it; the application-link
-- record itself continues to contain only a SHA-256 digest.
create or replace function public.bridge_prepare_bond_application_portal_delivery_phase5(
  p_export_package_id uuid,
  p_delivery_kind text,
  p_reminder_number integer default 0,
  p_actor_profile_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_package public.transaction_bond_application_export_packages%rowtype;
  v_assignment public.transaction_bond_originator_workspace_assignments%rowtype;
  v_application public.bond_applications%rowtype;
  v_recipient_email text;
  v_recipient_name text;
  v_token text;
  v_link public.bond_application_portal_access_links%rowtype;
  v_notification_event_id uuid;
  v_delivery public.bond_application_portal_delivery_events%rowtype;
  v_kind text := lower(trim(coalesce(p_delivery_kind, '')));
  v_actor uuid := coalesce(p_actor_profile_id, auth.uid());
begin
  if v_kind not in ('manual', 'scheduled') then
    raise exception 'Unsupported application delivery type.' using errcode = '22023';
  end if;
  if v_kind = 'scheduled' and coalesce(p_reminder_number, 0) < 1 then
    raise exception 'Scheduled reminders require a positive reminder number.' using errcode = '22023';
  end if;

  select * into v_package
  from public.transaction_bond_application_export_packages package
  where package.id = p_export_package_id
    and package.destination_key = 'bond_originator_intake'
    and package.status not in ('cancelled', 'superseded')
  for update;
  if not found or v_package.bond_application_id is null then
    raise exception 'This intake package has no active bond application.' using errcode = 'P0002';
  end if;

  if v_actor is not null then
    select * into v_assignment
    from public.transaction_bond_originator_workspace_assignments assignment
    where assignment.export_package_id = p_export_package_id
      and assignment.assigned_to_profile_id = v_actor
      and assignment.status in ('assigned', 'accepted')
    order by assignment.assigned_at desc
    limit 1;
    if not found then
      raise exception 'You are not assigned to this originator intake package.' using errcode = '42501';
    end if;
  elsif current_setting('request.jwt.claim.role', true) is distinct from 'service_role' then
    raise exception 'An assigned originator or service role is required.' using errcode = '42501';
  end if;

  select * into v_application
  from public.bond_applications application
  where application.id = v_package.bond_application_id
  for update;
  if not found or v_application.status in ('submitted', 'cancelled') then
    raise exception 'The bond application no longer needs completion reminders.' using errcode = '22023';
  end if;

  select lower(nullif(trim(buyer.email), '')), nullif(trim(buyer.name), '')
    into v_recipient_email, v_recipient_name
  from public.transactions transaction
  left join public.buyers buyer on buyer.id = transaction.buyer_id
  where transaction.id = v_package.transaction_id;
  if v_recipient_email is null then
    raise exception 'The buyer email is required before an application reminder can be sent.' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.bond_application_portal_delivery_events delivery
    where delivery.export_package_id = p_export_package_id
      and delivery.delivery_kind = v_kind
      and delivery.reminder_number = coalesce(p_reminder_number, 0)
  ) then
    raise exception 'This application delivery has already been prepared.' using errcode = '23505';
  end if;

  update public.bond_application_portal_access_links
  set revoked_at = coalesce(revoked_at, now()),
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('supersededByDeliveryAt', now())
  where bond_application_id = v_application.id
    and revoked_at is null
    and expires_at > now();

  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  insert into public.bond_application_portal_access_links (
    bond_application_id, token_hash, expires_at, created_by, metadata
  ) values (
    v_application.id,
    encode(extensions.digest(v_token, 'sha256'), 'hex'),
    now() + interval '14 days',
    v_actor,
    jsonb_build_object('issuedBy', 'bond_application_portal_phase5_delivery', 'exportPackageId', p_export_package_id, 'deliveryKind', v_kind, 'reminderNumber', coalesce(p_reminder_number, 0))
  ) returning * into v_link;

  insert into public.notification_events (
    automation_key, organisation_id, transaction_id, event_key, category, trigger_type,
    channel, status, recipient_email, recipient_role, subject, message_preview, source,
    dedupe_key, payload_json, metadata_json, prepared_at, queued_at
  )
  select
    'bond_application_portal_completion_reminder', transaction.organisation_id, transaction.id,
    'bond_application_portal_completion_reminder', 'reminder',
    case when v_kind = 'manual' then 'manual_send' else 'scheduled_reminder' end,
    'email', 'queued', v_recipient_email, 'buyer',
    case when v_kind = 'manual' then 'Complete your bond application' else 'Reminder: complete your bond application' end,
    'Your bond application is ready to complete securely.', 'bond_application_portal',
    'bond-application-delivery:' || p_export_package_id::text || ':' || v_kind || ':' || coalesce(p_reminder_number, 0)::text,
    jsonb_build_object('accessToken', v_token, 'recipientName', coalesce(v_recipient_name, 'there'), 'reminderNumber', coalesce(p_reminder_number, 0), 'portalLabel', 'Bond Application'),
    jsonb_build_object('exportPackageId', p_export_package_id, 'bondApplicationId', v_application.id, 'accessLinkId', v_link.id, 'deliveryKind', v_kind),
    now(), now()
  from public.transactions transaction where transaction.id = v_package.transaction_id
  returning id into v_notification_event_id;

  insert into public.bond_application_portal_delivery_events (
    export_package_id, bond_application_id, access_link_id, notification_event_id,
    delivery_kind, reminder_number, recipient_email, requested_by, metadata
  ) values (
    p_export_package_id, v_application.id, v_link.id, v_notification_event_id,
    v_kind, coalesce(p_reminder_number, 0), v_recipient_email, v_actor,
    jsonb_build_object('phase', 'bond_application_portal_phase5', 'recipientName', coalesce(v_recipient_name, ''))
  ) returning * into v_delivery;

  return jsonb_build_object('deliveryEventId', v_delivery.id, 'notificationEventId', v_notification_event_id, 'status', 'queued', 'deliveryKind', v_kind, 'reminderNumber', coalesce(p_reminder_number, 0));
end;
$$;

create or replace function public.bridge_send_bond_application_portal_delivery_for_originator(
  p_export_package_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_manual_number integer;
begin
  if auth.uid() is null then
    raise exception 'An authenticated bond originator is required.' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.bond_application_portal_delivery_events delivery
    where delivery.export_package_id = p_export_package_id
      and delivery.delivery_kind = 'manual'
      and delivery.created_at > now() - interval '15 minutes'
  ) then
    raise exception 'An application email was already queued in the last 15 minutes.' using errcode = '22023';
  end if;
  select coalesce(max(delivery.reminder_number), -1) + 1 into v_manual_number
  from public.bond_application_portal_delivery_events delivery
  where delivery.export_package_id = p_export_package_id
    and delivery.delivery_kind = 'manual';
  return public.bridge_prepare_bond_application_portal_delivery_phase5(p_export_package_id, 'manual', v_manual_number, auth.uid());
end;
$$;

create or replace function public.bridge_queue_bond_application_portal_reminders_phase5(
  p_limit integer default 100,
  p_now timestamptz default now(),
  p_dry_run boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_candidate record;
  v_considered integer := 0;
  v_queued integer := 0;
  v_now timestamptz := coalesce(p_now, now());
begin
  if current_setting('request.jwt.claim.role', true) is distinct from 'service_role' then
    raise exception 'Service role is required.' using errcode = '42501';
  end if;

  for v_candidate in
    select delivery.export_package_id, cadence.reminder_number
    from public.bond_application_portal_delivery_events delivery
    join public.notification_events initial_event on initial_event.id = delivery.notification_event_id
    join public.bond_applications application on application.id = delivery.bond_application_id
    cross join (values (1, 1), (2, 3), (3, 7)) as cadence(reminder_number, cadence_days)
    where delivery.delivery_kind = 'manual'
      and initial_event.status in ('sent', 'delivered')
      and application.status not in ('submitted', 'cancelled')
      and delivery.created_at + make_interval(days => cadence.cadence_days) <= v_now
      and not exists (
        select 1 from public.bond_application_portal_delivery_events existing
        where existing.export_package_id = delivery.export_package_id
          and existing.delivery_kind = 'scheduled'
          and existing.reminder_number = cadence.reminder_number
      )
    order by delivery.created_at, cadence.reminder_number
    limit greatest(0, least(coalesce(p_limit, 100), 500))
  loop
    v_considered := v_considered + 1;
    if not coalesce(p_dry_run, true) then
      perform public.bridge_prepare_bond_application_portal_delivery_phase5(
        v_candidate.export_package_id, 'scheduled', v_candidate.reminder_number, null
      );
      v_queued := v_queued + 1;
    end if;
  end loop;
  return jsonb_build_object('considered', v_considered, 'queued', v_queued, 'dryRun', coalesce(p_dry_run, true), 'processedAt', v_now);
end;
$$;

-- Once delivery is final, remove the temporary plaintext token from the
-- internal notification payload. The recipient already has the link and the
-- application access-link table has never stored it in plaintext.
create or replace function public.bridge_redact_bond_application_portal_delivery_token_phase5()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.automation_key = 'bond_application_portal_completion_reminder'
    and new.status in ('sent', 'delivered', 'failed', 'skipped')
    and coalesce(new.payload_json, '{}'::jsonb) ? 'accessToken' then
    new.payload_json := new.payload_json - 'accessToken';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_redact_bond_application_portal_delivery_token_phase5 on public.notification_events;
create trigger trg_redact_bond_application_portal_delivery_token_phase5
  before update on public.notification_events
  for each row execute function public.bridge_redact_bond_application_portal_delivery_token_phase5();

create or replace function public.bridge_bond_application_portal_delivery_action_centre_view()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object('version', 'bond_application_portal_phase5', 'items', coalesce(jsonb_agg(
    jsonb_build_object(
      'exportPackageId', package.id,
      'deliveries', coalesce(deliveries.items, '[]'::jsonb),
      'nextReminderPolicy', jsonb_build_object('cadenceDays', jsonb_build_array(1, 3, 7), 'stopsWhen', 'application_submitted_or_cancelled')
    ) order by package.created_at desc
  ), '[]'::jsonb))
  from public.transaction_bond_originator_workspace_assignments assignment
  join public.transaction_bond_application_export_packages package on package.id = assignment.export_package_id
  left join lateral (
    select jsonb_agg(jsonb_build_object(
      'id', delivery.id, 'deliveryKind', delivery.delivery_kind, 'reminderNumber', delivery.reminder_number,
      'createdAt', delivery.created_at, 'status', event.status, 'sentAt', event.sent_at, 'failedAt', event.failed_at
    ) order by delivery.created_at desc) as items
    from public.bond_application_portal_delivery_events delivery
    left join public.notification_events event on event.id = delivery.notification_event_id
    where delivery.export_package_id = package.id
  ) deliveries on true
  where assignment.assigned_to_profile_id = auth.uid()
    and assignment.status in ('assigned', 'accepted')
    and package.destination_key = 'bond_originator_intake'
    and package.status not in ('cancelled', 'superseded');
$$;

-- Extend the shared dispatcher claim safely rather than creating a second
-- email worker for application reminders.
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
      and channel = 'email'
      and status = 'queued'
      and automation_key in (
        'buyer_onboarding_reminder', 'seller_onboarding_reminder', 'seller_document_request_reminder',
        'attorney_invite_reminder', 'bond_originator_invite_reminder', 'agent_invite_reminder',
        'lead_first_response_sla_reminder', 'lead_first_response_sla_escalation',
        'lead_follow_up_due_reminder', 'lead_follow_up_missed_escalation',
        'lead_dormant_reactivation', 'lead_no_response_nurture',
        'bond_application_portal_completion_reminder'
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
      updated_at = now()
  from next_events
  where event.id = next_events.id
  returning event.*;
end;
$$;

revoke all on function public.bridge_prepare_bond_application_portal_delivery_phase5(uuid, text, integer, uuid) from public, anon, authenticated;
revoke all on function public.bridge_send_bond_application_portal_delivery_for_originator(uuid) from public, anon;
revoke all on function public.bridge_queue_bond_application_portal_reminders_phase5(integer, timestamptz, boolean) from public, anon, authenticated;
revoke all on function public.bridge_bond_application_portal_delivery_action_centre_view() from public, anon;
grant execute on function public.bridge_prepare_bond_application_portal_delivery_phase5(uuid, text, integer, uuid) to service_role;
grant execute on function public.bridge_send_bond_application_portal_delivery_for_originator(uuid) to authenticated;
grant execute on function public.bridge_queue_bond_application_portal_reminders_phase5(integer, timestamptz, boolean) to service_role;
grant execute on function public.bridge_bond_application_portal_delivery_action_centre_view() to authenticated;

comment on function public.bridge_queue_bond_application_portal_reminders_phase5(integer, timestamptz, boolean) is
  'Phase 5 service-only reminder planner. It schedules day 1, 3, and 7 bond-application reminders only after an initial email has been delivered, and stops for submitted or cancelled applications.';

notify pgrst, 'reload schema';
commit;
