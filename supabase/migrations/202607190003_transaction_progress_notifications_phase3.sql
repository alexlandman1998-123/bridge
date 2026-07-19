begin;

insert into public.notification_automation_definitions (
  automation_key, display_name, category, trigger_type, recipient_role,
  channels, implementation_status, default_enabled, dedupe_strategy,
  reminder_policy, metadata_json
) values (
  'transaction_progress_changed',
  'Transaction progress changed',
  'notification',
  'system_event',
  'transaction_role_player',
  array['email', 'whatsapp']::text[],
  'active',
  true,
  'progress_version_recipient_channel',
  '{}'::jsonb,
  '{"phase":"phase_3_notifications","whatsappDelivery":"disabled_until_provider_ready"}'::jsonb
)
on conflict (automation_key) do update set
  display_name = excluded.display_name,
  category = excluded.category,
  trigger_type = excluded.trigger_type,
  recipient_role = excluded.recipient_role,
  channels = excluded.channels,
  implementation_status = excluded.implementation_status,
  default_enabled = excluded.default_enabled,
  dedupe_strategy = excluded.dedupe_strategy,
  metadata_json = excluded.metadata_json,
  updated_at = now();

alter table public.notification_events
  add column if not exists transaction_shared_progress_id uuid
    references public.transaction_shared_progress(id) on delete set null,
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

alter table public.notification_events
  drop constraint if exists notification_events_dispatch_attempt_check;
alter table public.notification_events
  add constraint notification_events_dispatch_attempt_check
  check (
    dispatch_attempt_count >= 0
    and max_dispatch_attempts between 1 and 20
    and dispatch_attempt_count <= max_dispatch_attempts
  );

create unique index if not exists notification_events_progress_dedupe_unique_idx
  on public.notification_events (organisation_id, dedupe_key)
  where automation_key = 'transaction_progress_changed' and dedupe_key is not null;

create index if not exists notification_events_progress_dispatch_idx
  on public.notification_events (next_dispatch_attempt_at, queued_at, created_at)
  where automation_key = 'transaction_progress_changed'
    and channel = 'email'
    and status in ('queued', 'failed');

create or replace function public.bridge_queue_transaction_progress_notifications_phase3()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_transaction public.transactions%rowtype;
  v_actor_email text;
  v_recipient record;
  v_is_client boolean;
  v_title text;
  v_description text;
  v_dedupe_base text;
begin
  if tg_op = 'UPDATE' and row(
    old.step_key, old.status, old.responsible_role, old.blocked,
    old.safe_explanation, old.expected_next_step, old.visibility,
    old.professional_title, old.professional_description,
    old.client_title, old.client_description
  ) is not distinct from row(
    new.step_key, new.status, new.responsible_role, new.blocked,
    new.safe_explanation, new.expected_next_step, new.visibility,
    new.professional_title, new.professional_description,
    new.client_title, new.client_description
  ) then
    return new;
  end if;

  select * into v_transaction
  from public.transactions
  where id = new.transaction_id;
  if v_transaction.id is null or v_transaction.organisation_id is null then
    return new;
  end if;

  select lower(nullif(trim(profile.email), '')) into v_actor_email
  from public.profiles profile
  where profile.id = new.updated_by;

  for v_recipient in
    with candidates as (
      select
        participant.user_id,
        lower(nullif(trim(participant.participant_email), '')) as email,
        nullif(trim(coalesce(
          to_jsonb(participant)->>'participant_phone',
          to_jsonb(profile)->>'phone_number',
          to_jsonb(profile)->>'phone'
        )), '') as phone,
        lower(coalesce(nullif(participant.legal_role, ''), nullif(participant.role_type, ''), 'role_player')) as role,
        nullif(trim(coalesce(participant.participant_name, profile.full_name, profile.email)), '') as recipient_name
      from public.transaction_participants participant
      left join public.profiles profile on profile.id = participant.user_id
      where participant.transaction_id = new.transaction_id
        and lower(coalesce(participant.status, 'active')) in ('active', 'accepted')
        and coalesce(participant.can_view, true)

      union all
      select null::uuid, lower(nullif(trim(v_transaction.assigned_agent_email), '')),
        null::text, 'agent', nullif(trim(v_transaction.assigned_agent), '')
      union all
      select null::uuid, lower(nullif(trim(v_transaction.assigned_attorney_email), '')),
        null::text, 'attorney', nullif(trim(v_transaction.attorney), '')
      union all
      select null::uuid, lower(nullif(trim(v_transaction.assigned_bond_originator_email), '')),
        null::text, 'bond_originator', nullif(trim(v_transaction.bond_originator), '')
      union all
      select null::uuid, lower(nullif(trim(v_transaction.seller_email), '')),
        nullif(trim(to_jsonb(v_transaction)->>'seller_phone'), ''), 'seller',
        nullif(trim(to_jsonb(v_transaction)->>'seller_name'), '')
      union all
      select null::uuid, lower(nullif(trim(buyer.email), '')),
        nullif(trim(coalesce(to_jsonb(buyer)->>'phone_number', to_jsonb(buyer)->>'phone')), ''),
        'client', nullif(trim(coalesce(to_jsonb(buyer)->>'name', to_jsonb(buyer)->>'full_name')), '')
      from public.buyers buyer
      where buyer.id = v_transaction.buyer_id
    ), eligible as (
      select distinct on (coalesce(email, phone))
        user_id, email, phone, role, recipient_name
      from candidates
      where coalesce(email, phone) is not null
        and (email is null or email is distinct from v_actor_email)
        and (user_id is null or user_id is distinct from new.updated_by)
        and (
          (new.visibility = 'client_visible')
          or (
            new.visibility = 'professional_shared'
            and role not in ('buyer', 'seller', 'client')
          )
          or (
            new.visibility = 'internal'
            and role in (
              'attorney', 'conveyancer', 'transfer_attorney', 'bond_attorney',
              'cancellation_attorney', 'attorney_conveyancer', 'candidate_attorney',
              'conveyancing_secretary', 'firm_admin', 'director_partner',
              'developer', 'platform_admin', 'internal_admin', 'admin'
            )
          )
        )
      order by coalesce(email, phone), user_id nulls last, role
    )
    select * from eligible
  loop
    v_is_client := v_recipient.role in ('buyer', 'seller', 'client');
    v_title := case when v_is_client then new.client_title else new.professional_title end;
    v_description := case when v_is_client then new.client_description else new.professional_description end;
    if nullif(trim(coalesce(v_title, '')), '') is null
      or nullif(trim(coalesce(v_description, '')), '') is null then
      continue;
    end if;

    v_dedupe_base := concat_ws(':',
      'transaction-progress', new.id::text, new.updated_at::text,
      coalesce(v_recipient.email, v_recipient.phone), v_recipient.role
    );

    if v_recipient.email is not null then
      insert into public.notification_events (
        automation_key, organisation_id, transaction_id,
        transaction_shared_progress_id, recipient_user_id,
        event_key, category, trigger_type, channel, status,
        recipient_email, recipient_address, recipient_role,
        subject, message_preview, provider, source, dedupe_key,
        idempotency_key, payload_json, metadata_json,
        queued_at, next_dispatch_attempt_at
      ) values (
        'transaction_progress_changed', v_transaction.organisation_id, new.transaction_id,
        new.id, v_recipient.user_id,
        'transaction_progress_changed', 'notification', 'system_event', 'email', 'queued',
        v_recipient.email, v_recipient.email, v_recipient.role,
        'Arch9 transaction update: ' || new.process_label,
        left(v_description, 320), 'resend', 'transaction_shared_progress',
        v_dedupe_base || ':email', v_dedupe_base || ':email',
        jsonb_strip_nulls(jsonb_build_object(
          'progressId', new.id,
          'processKey', new.process_key,
          'processLabel', new.process_label,
          'stepKey', new.step_key,
          'status', new.status,
          'responsibleRole', new.responsible_role,
          'blocked', new.blocked,
          'title', v_title,
          'description', v_description,
          'safeExplanation', new.safe_explanation,
          'expectedNextStep', new.expected_next_step,
          'recipientName', v_recipient.recipient_name
        )),
        jsonb_build_object('phase', 'phase_3_notifications', 'visibility', new.visibility),
        now(), now()
      )
      on conflict (organisation_id, dedupe_key)
        where automation_key = 'transaction_progress_changed' and dedupe_key is not null
      do nothing;
    end if;

    if v_recipient.phone is not null then
      insert into public.notification_events (
        automation_key, organisation_id, transaction_id,
        transaction_shared_progress_id, recipient_user_id,
        event_key, category, trigger_type, channel, status,
        recipient_email, recipient_address, recipient_role, subject, message_preview,
        source, dedupe_key, idempotency_key, payload_json, metadata_json
      ) values (
        'transaction_progress_changed', v_transaction.organisation_id, new.transaction_id,
        new.id, v_recipient.user_id,
        'transaction_progress_changed', 'notification', 'system_event', 'whatsapp', 'skipped',
        v_recipient.email, v_recipient.phone, v_recipient.role, v_title, left(v_description, 320),
        'transaction_shared_progress', v_dedupe_base || ':whatsapp', v_dedupe_base || ':whatsapp',
        jsonb_strip_nulls(jsonb_build_object(
          'progressId', new.id, 'processKey', new.process_key, 'stepKey', new.step_key,
          'status', new.status, 'title', v_title, 'description', v_description,
          'safeExplanation', new.safe_explanation, 'expectedNextStep', new.expected_next_step,
          'recipientName', v_recipient.recipient_name
        )),
        jsonb_build_object(
          'phase', 'phase_3_notifications',
          'visibility', new.visibility,
          'skipReason', 'whatsapp_provider_disabled'
        )
      )
      on conflict (organisation_id, dedupe_key)
        where automation_key = 'transaction_progress_changed' and dedupe_key is not null
      do nothing;
    end if;
  end loop;

  return new;
end;
$$;

drop trigger if exists trg_transaction_shared_progress_notifications_phase3
  on public.transaction_shared_progress;
create trigger trg_transaction_shared_progress_notifications_phase3
after insert or update on public.transaction_shared_progress
for each row execute function public.bridge_queue_transaction_progress_notifications_phase3();

create or replace function public.bridge_claim_transaction_progress_notifications_phase3(
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
    where event.automation_key = 'transaction_progress_changed'
      and event.channel = 'email'
      and event.status in ('queued', 'failed')
      and event.dispatch_attempt_count < event.max_dispatch_attempts
      and coalesce(event.next_dispatch_attempt_at, now()) <= now()
      and (p_transaction_id is null or event.transaction_id = p_transaction_id)
      and (p_event_id is null or event.id = p_event_id)
    order by event.queued_at asc nulls last, event.created_at asc
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 25), 100))
  )
  update public.notification_events event
  set status = 'processing',
      dispatch_attempt_count = event.dispatch_attempt_count + 1,
      last_dispatch_attempt_at = now(),
      last_dispatch_error = null
  from claimable
  where event.id = claimable.id
  returning event.*;
end;
$$;

revoke all on function public.bridge_claim_transaction_progress_notifications_phase3(uuid, uuid, integer) from public;
grant execute on function public.bridge_claim_transaction_progress_notifications_phase3(uuid, uuid, integer) to service_role;

notify pgrst, 'reload schema';
commit;
