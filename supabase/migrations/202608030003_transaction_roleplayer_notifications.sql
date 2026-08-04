begin;

insert into public.notification_automation_definitions (
  automation_key, display_name, category, trigger_type, recipient_role,
  channels, implementation_status, default_enabled, dedupe_strategy,
  reminder_policy, metadata_json
) values
  ('transaction_created', 'Transaction created', 'notification', 'system_event', 'transaction_owner', array['email']::text[], 'active', true, 'transaction_event_owner', '{}'::jsonb, '{"phase":"phase_4_transaction_roleplayer_notifications"}'::jsonb),
  ('transaction_owner_changed', 'Transaction owner changed', 'notification', 'system_event', 'transaction_owner', array['email']::text[], 'active', true, 'transaction_event_owner', '{}'::jsonb, '{"phase":"phase_4_transaction_roleplayer_notifications"}'::jsonb),
  ('transaction_roleplayer_assigned', 'Transaction roleplayer assigned', 'notification', 'system_event', 'transaction_owner', array['email']::text[], 'active', true, 'transaction_roleplayer_owner', '{}'::jsonb, '{"phase":"phase_4_transaction_roleplayer_notifications"}'::jsonb),
  ('transaction_roleplayer_reassigned', 'Transaction roleplayer reassigned', 'notification', 'system_event', 'transaction_owner', array['email']::text[], 'active', true, 'transaction_roleplayer_owner', '{}'::jsonb, '{"phase":"phase_4_transaction_roleplayer_notifications"}'::jsonb),
  ('transaction_partner_accepted', 'Transaction partner accepted', 'notification', 'system_event', 'transaction_owner', array['email']::text[], 'active', true, 'transaction_partner_invitation_owner', '{}'::jsonb, '{"phase":"phase_4_transaction_roleplayer_notifications"}'::jsonb),
  ('transaction_partner_declined', 'Transaction partner declined', 'notification', 'system_event', 'transaction_owner', array['email']::text[], 'active', true, 'transaction_partner_invitation_owner', '{}'::jsonb, '{"phase":"phase_4_transaction_roleplayer_notifications"}'::jsonb),
  ('transaction_stage_changed', 'Transaction stage changed', 'notification', 'system_event', 'transaction_owner', array['email']::text[], 'active', true, 'transaction_stage_owner', '{}'::jsonb, '{"phase":"phase_4_transaction_roleplayer_notifications"}'::jsonb),
  ('transaction_stalled', 'Transaction stalled', 'reminder', 'scheduled_reminder', 'transaction_owner', array['email']::text[], 'active', true, 'transaction_stalled_weekly', '{"cadenceDays":[7],"stopWhen":"transaction_activity_logged","quietHours":{"enabled":true,"timezone":"Africa/Johannesburg","startHour":18,"endHour":8},"escalation":{"enabled":true,"afterDay":7,"recipientRole":"manager","label":"Escalate stalled transactions when no meaningful activity is recorded."}}'::jsonb, '{"phase":"phase_4_transaction_roleplayer_notifications"}'::jsonb),
  ('transaction_cancelled', 'Transaction cancelled', 'notification', 'system_event', 'transaction_owner', array['email']::text[], 'active', true, 'transaction_lifecycle_owner', '{}'::jsonb, '{"phase":"phase_4_transaction_roleplayer_notifications"}'::jsonb),
  ('transaction_archived', 'Transaction archived', 'notification', 'system_event', 'transaction_owner', array['email']::text[], 'active', true, 'transaction_lifecycle_owner', '{}'::jsonb, '{"phase":"phase_4_transaction_roleplayer_notifications"}'::jsonb),
  ('transaction_reactivated', 'Transaction reactivated', 'notification', 'system_event', 'transaction_owner', array['email']::text[], 'active', true, 'transaction_lifecycle_owner', '{}'::jsonb, '{"phase":"phase_4_transaction_roleplayer_notifications"}'::jsonb)
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

create unique index if not exists notification_events_transaction_ops_dedupe_idx
  on public.notification_events (organisation_id, dedupe_key)
  where automation_key in (
    'transaction_created',
    'transaction_owner_changed',
    'transaction_roleplayer_assigned',
    'transaction_roleplayer_reassigned',
    'transaction_partner_accepted',
    'transaction_partner_declined',
    'transaction_stage_changed',
    'transaction_stalled',
    'transaction_cancelled',
    'transaction_archived',
    'transaction_reactivated'
  )
  and dedupe_key is not null;

create index if not exists notification_events_transaction_ops_dispatch_idx
  on public.notification_events (next_dispatch_attempt_at, queued_at, created_at)
  where automation_key in (
    'transaction_created',
    'transaction_owner_changed',
    'transaction_roleplayer_assigned',
    'transaction_roleplayer_reassigned',
    'transaction_partner_accepted',
    'transaction_partner_declined',
    'transaction_stage_changed',
    'transaction_stalled',
    'transaction_cancelled',
    'transaction_archived',
    'transaction_reactivated'
  )
  and channel = 'email'
  and status in ('queued', 'failed');

create or replace function public.bridge_transaction_notification_role_label_phase4(p_role text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case lower(coalesce(p_role, ''))
    when 'transfer_attorney' then 'Transfer Attorney'
    when 'bond_attorney' then 'Bond Attorney'
    when 'cancellation_attorney' then 'Cancellation Attorney'
    when 'bond_originator' then 'Bond Originator'
    when 'developer_contact' then 'Developer Contact'
    when 'agent' then 'Agent'
    else initcap(replace(coalesce(nullif(p_role, ''), 'transaction partner'), '_', ' '))
  end
$$;

create or replace function public.bridge_transaction_terminal_state_phase4(p_transaction public.transactions)
returns text
language sql
stable
set search_path = ''
as $$
  select case
    when lower(coalesce(to_jsonb(p_transaction)->>'lifecycle_state', '')) in ('cancelled', 'canceled')
      or lower(coalesce(to_jsonb(p_transaction)->>'status', '')) in ('cancelled', 'canceled')
      or (to_jsonb(p_transaction)->>'cancelled_at') is not null
      then 'transaction_cancelled'
    when lower(coalesce(to_jsonb(p_transaction)->>'lifecycle_state', '')) = 'archived'
      or lower(coalesce(to_jsonb(p_transaction)->>'status', '')) = 'archived'
      or lower(coalesce(to_jsonb(p_transaction)->>'operational_state', '')) = 'archived'
      or coalesce((to_jsonb(p_transaction)->>'is_active')::boolean, true) is false
      or (to_jsonb(p_transaction)->>'archived_at') is not null
      then 'transaction_archived'
    else ''
  end
$$;

create or replace function public.bridge_transaction_reference_phase4(p_transaction public.transactions)
returns text
language sql
stable
set search_path = ''
as $$
  select coalesce(
    nullif(to_jsonb(p_transaction)->>'transaction_reference', ''),
    nullif(to_jsonb(p_transaction)->>'matter_number', ''),
    nullif(to_jsonb(p_transaction)->>'listing_title', ''),
    p_transaction.id::text
  )
$$;

create or replace function public.bridge_transaction_property_label_phase4(p_transaction public.transactions)
returns text
language sql
stable
set search_path = ''
as $$
  select coalesce(
    nullif(concat_ws(', ',
      nullif(to_jsonb(p_transaction)->>'property_address_line_1', ''),
      nullif(to_jsonb(p_transaction)->>'suburb', ''),
      nullif(to_jsonb(p_transaction)->>'city', '')
    ), ''),
    nullif(to_jsonb(p_transaction)->>'property_title', ''),
    nullif(to_jsonb(p_transaction)->>'listing_title', ''),
    nullif(to_jsonb(p_transaction)->>'property_description', ''),
    ''
  )
$$;

create or replace function public.bridge_transaction_stage_label_phase4(p_transaction public.transactions)
returns text
language sql
stable
set search_path = ''
as $$
  select coalesce(
    nullif(to_jsonb(p_transaction)->>'current_main_stage', ''),
    nullif(to_jsonb(p_transaction)->>'current_stage', ''),
    nullif(to_jsonb(p_transaction)->>'stage', ''),
    ''
  )
$$;

create or replace function public.bridge_transaction_owner_email_phase4(p_transaction public.transactions)
returns table(user_id uuid, email text, name text)
language sql
stable
set search_path = ''
as $$
  with owner_candidate as (
    select coalesce(p_transaction.owner_user_id, p_transaction.assigned_user_id, p_transaction.assigned_agent_id) as user_id
  )
  select
    owner_candidate.user_id,
    lower(nullif(trim(coalesce(profile.email, p_transaction.assigned_agent_email)), '')) as email,
    nullif(trim(coalesce(profile.full_name, p_transaction.assigned_agent, profile.email)), '') as name
  from owner_candidate
  left join public.profiles profile on profile.id = owner_candidate.user_id
  where owner_candidate.user_id is not null or nullif(trim(coalesce(p_transaction.assigned_agent_email, '')), '') is not null
  limit 1
$$;

create or replace function public.bridge_queue_transaction_operation_event_phase4(
  p_transaction public.transactions,
  p_automation_key text,
  p_subject text,
  p_message text,
  p_dedupe_key text,
  p_payload jsonb default '{}'::jsonb,
  p_source text default 'transactions'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_recipient record;
  v_event_id uuid;
  v_category text := 'notification';
  v_trigger_type text := 'system_event';
begin
  if p_transaction.id is null or p_transaction.organisation_id is null then
    return null;
  end if;

  if p_automation_key = 'transaction_stalled' then
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

  select *
  into v_recipient
  from public.bridge_transaction_owner_email_phase4(p_transaction)
  limit 1;

  if nullif(trim(coalesce(v_recipient.email, '')), '') is null then
    return null;
  end if;

  insert into public.notification_events (
    automation_key, organisation_id, branch_id, assigned_user_id, transaction_id,
    recipient_user_id, event_key, category, trigger_type, channel, status,
    recipient_email, recipient_address, recipient_role, subject, message_preview,
    provider, source, dedupe_key, idempotency_key, payload_json, metadata_json,
    queued_at, next_dispatch_attempt_at
  ) values (
    p_automation_key, p_transaction.organisation_id, p_transaction.assigned_branch_id,
    coalesce(p_transaction.owner_user_id, p_transaction.assigned_user_id, p_transaction.assigned_agent_id),
    p_transaction.id, v_recipient.user_id, p_automation_key, v_category, v_trigger_type,
    'email', 'queued', lower(v_recipient.email), lower(v_recipient.email),
    'transaction_owner', nullif(trim(coalesce(p_subject, '')), ''),
    left(trim(coalesce(p_message, '')), 320), 'resend',
    coalesce(nullif(trim(p_source), ''), 'transactions'), nullif(trim(p_dedupe_key), ''),
    nullif(trim(p_dedupe_key), ''),
    jsonb_strip_nulls(coalesce(p_payload, '{}'::jsonb) || jsonb_build_object(
      'transactionId', p_transaction.id,
      'transactionReference', public.bridge_transaction_reference_phase4(p_transaction),
      'propertyLabel', public.bridge_transaction_property_label_phase4(p_transaction),
      'stage', public.bridge_transaction_stage_label_phase4(p_transaction),
      'recipientName', v_recipient.name,
      'ownerName', v_recipient.name,
      'ownerEmail', v_recipient.email
    )),
    jsonb_build_object(
      'phase', 'phase_4_transaction_roleplayer_notifications',
      'sendEmailType', 'transaction_operations_dispatch'
    ),
    now(), now()
  )
  on conflict (organisation_id, dedupe_key)
    where automation_key in (
      'transaction_created',
      'transaction_owner_changed',
      'transaction_roleplayer_assigned',
      'transaction_roleplayer_reassigned',
      'transaction_partner_accepted',
      'transaction_partner_declined',
      'transaction_stage_changed',
      'transaction_stalled',
      'transaction_cancelled',
      'transaction_archived',
      'transaction_reactivated'
    )
    and dedupe_key is not null
  do nothing
  returning id into v_event_id;

  return v_event_id;
end;
$$;

create or replace function public.bridge_handle_transaction_operation_notifications_phase4()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old_stage text := '';
  v_new_stage text := '';
  v_old_terminal text := '';
  v_new_terminal text := '';
  v_previous_owner public.profiles%rowtype;
  v_new_owner public.profiles%rowtype;
  v_owner_changed boolean := false;
  v_reference text;
begin
  v_reference := public.bridge_transaction_reference_phase4(new);

  if tg_op = 'INSERT' then
    perform public.bridge_queue_transaction_operation_event_phase4(
      new,
      'transaction_created',
      'New transaction created',
      v_reference || ' has been created and is ready for review.',
      'transaction-created:' || new.id::text,
      '{}'::jsonb,
      'transactions'
    );
    return new;
  end if;

  v_old_stage := public.bridge_transaction_stage_label_phase4(old);
  v_new_stage := public.bridge_transaction_stage_label_phase4(new);
  v_old_terminal := public.bridge_transaction_terminal_state_phase4(old);
  v_new_terminal := public.bridge_transaction_terminal_state_phase4(new);
  v_owner_changed := coalesce(old.owner_user_id, old.assigned_user_id, old.assigned_agent_id)
    is distinct from coalesce(new.owner_user_id, new.assigned_user_id, new.assigned_agent_id);

  if v_owner_changed then
    select * into v_previous_owner
    from public.profiles
    where id = coalesce(old.owner_user_id, old.assigned_user_id, old.assigned_agent_id)
    limit 1;

    select * into v_new_owner
    from public.profiles
    where id = coalesce(new.owner_user_id, new.assigned_user_id, new.assigned_agent_id)
    limit 1;

    perform public.bridge_queue_transaction_operation_event_phase4(
      new,
      'transaction_owner_changed',
      'Transaction owner changed',
      v_reference || ' was reassigned' ||
        case when coalesce(v_new_owner.full_name, v_new_owner.email, '') <> '' then ' to ' || coalesce(v_new_owner.full_name, v_new_owner.email) else '' end ||
        case when coalesce(v_previous_owner.full_name, v_previous_owner.email, '') <> '' then ' from ' || coalesce(v_previous_owner.full_name, v_previous_owner.email) else '' end || '.',
      'transaction-owner-changed:' || new.id::text || ':' || now()::text,
      jsonb_strip_nulls(jsonb_build_object(
        'previousOwnerName', coalesce(v_previous_owner.full_name, v_previous_owner.email),
        'previousOwnerEmail', v_previous_owner.email,
        'ownerName', coalesce(v_new_owner.full_name, v_new_owner.email),
        'ownerEmail', v_new_owner.email
      )),
      'transactions'
    );
  end if;

  if nullif(v_new_stage, '') is not null and v_old_stage is distinct from v_new_stage then
    perform public.bridge_queue_transaction_operation_event_phase4(
      new,
      'transaction_stage_changed',
      'Transaction stage changed',
      v_reference || ' moved from ' || coalesce(nullif(v_old_stage, ''), 'the previous stage') || ' to ' || v_new_stage || '.',
      'transaction-stage-changed:' || new.id::text || ':' || coalesce(nullif(v_old_stage, ''), 'none') || ':' || v_new_stage || ':' || now()::text,
      jsonb_strip_nulls(jsonb_build_object(
        'previousStage', v_old_stage,
        'stage', v_new_stage
      )),
      'transactions'
    );
  end if;

  if v_new_terminal in ('transaction_cancelled', 'transaction_archived') and v_old_terminal is distinct from v_new_terminal then
    perform public.bridge_queue_transaction_operation_event_phase4(
      new,
      v_new_terminal,
      case when v_new_terminal = 'transaction_cancelled' then 'Transaction cancelled' else 'Transaction archived' end,
      v_reference || case when v_new_terminal = 'transaction_cancelled' then ' has been cancelled.' else ' has been archived.' end,
      v_new_terminal || ':' || new.id::text || ':' || now()::text,
      jsonb_strip_nulls(jsonb_build_object(
        'status', coalesce(to_jsonb(new)->>'lifecycle_state', to_jsonb(new)->>'status', to_jsonb(new)->>'operational_state'),
        'previousStatus', coalesce(to_jsonb(old)->>'lifecycle_state', to_jsonb(old)->>'status', to_jsonb(old)->>'operational_state')
      )),
      'transactions'
    );
  elsif v_old_terminal in ('transaction_cancelled', 'transaction_archived') and v_new_terminal = '' then
    perform public.bridge_queue_transaction_operation_event_phase4(
      new,
      'transaction_reactivated',
      'Transaction reactivated',
      v_reference || ' has been reactivated and is back in the active workflow.',
      'transaction-reactivated:' || new.id::text || ':' || now()::text,
      jsonb_strip_nulls(jsonb_build_object(
        'previousStatus', v_old_terminal,
        'status', coalesce(to_jsonb(new)->>'lifecycle_state', to_jsonb(new)->>'status', 'active')
      )),
      'transactions'
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_transaction_operation_notifications_phase4
  on public.transactions;
create trigger trg_transaction_operation_notifications_phase4
after insert or update on public.transactions
for each row execute function public.bridge_handle_transaction_operation_notifications_phase4();

create or replace function public.bridge_handle_transaction_partner_action_notifications_phase4()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_transaction public.transactions%rowtype;
  v_role_label text;
  v_partner_label text;
  v_key text := '';
  v_title text := '';
  v_message text := '';
begin
  if new.status not in ('accepted', 'declined') then
    return new;
  end if;

  if tg_op = 'UPDATE' and old.status is not distinct from new.status then
    return new;
  end if;

  select * into v_transaction
  from public.transactions
  where id = new.transaction_id
  limit 1;

  if v_transaction.id is null then
    return new;
  end if;

  v_role_label := public.bridge_transaction_notification_role_label_phase4(new.role_type);
  v_partner_label := coalesce(nullif(new.company_name, ''), nullif(new.contact_name, ''), nullif(new.email, ''), 'The invited partner');

  if new.status = 'accepted' then
    v_key := 'transaction_partner_accepted';
    v_title := 'Transaction partner accepted';
    v_message := v_partner_label || ' accepted the ' || lower(v_role_label) || ' invitation for ' || public.bridge_transaction_reference_phase4(v_transaction) || '.';
  else
    v_key := 'transaction_partner_declined';
    v_title := 'Transaction partner declined';
    v_message := v_partner_label || ' declined the ' || lower(v_role_label) || ' invitation for ' || public.bridge_transaction_reference_phase4(v_transaction) || '. Replacement action is required.';
  end if;

  perform public.bridge_queue_transaction_operation_event_phase4(
    v_transaction,
    v_key,
    v_title,
    v_message,
    v_key || ':transaction-partner-invitation:' || new.id::text,
    jsonb_strip_nulls(jsonb_build_object(
      'invitationId', new.id,
      'roleType', new.role_type,
      'roleLabel', v_role_label,
      'partnerName', v_partner_label,
      'partnerEmail', new.email,
      'acceptedAt', new.accepted_at,
      'declinedAt', new.declined_at,
      'nextAction', case when new.status = 'declined' then 'Nominate a replacement ' || lower(v_role_label) || '.' else null end
    )),
    'transaction_partner_invitations'
  );

  return new;
end;
$$;

drop trigger if exists trg_transaction_partner_action_notifications_phase4
  on public.transaction_partner_invitations;
create trigger trg_transaction_partner_action_notifications_phase4
after insert or update on public.transaction_partner_invitations
for each row execute function public.bridge_handle_transaction_partner_action_notifications_phase4();

create or replace function public.bridge_handle_transaction_roleplayer_notifications_phase4()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_transaction public.transactions%rowtype;
  v_key text;
  v_role_label text;
  v_partner_label text;
begin
  if coalesce(new.assignment_status, new.status, 'selected') in ('removed', 'declined', 'rejected') then
    return new;
  end if;

  if tg_op = 'UPDATE' and row(old.user_id, old.email_address, old.partner_name, old.role_type, old.assignment_status, old.status)
    is not distinct from row(new.user_id, new.email_address, new.partner_name, new.role_type, new.assignment_status, new.status) then
    return new;
  end if;

  select * into v_transaction
  from public.transactions
  where id = new.transaction_id
  limit 1;

  if v_transaction.id is null then
    return new;
  end if;

  v_key := case when tg_op = 'INSERT' then 'transaction_roleplayer_assigned' else 'transaction_roleplayer_reassigned' end;
  v_role_label := public.bridge_transaction_notification_role_label_phase4(new.role_type);
  v_partner_label := coalesce(nullif(new.partner_name, ''), nullif(new.contact_person, ''), nullif(new.email_address, ''), v_role_label);

  perform public.bridge_queue_transaction_operation_event_phase4(
    v_transaction,
    v_key,
    case when v_key = 'transaction_roleplayer_assigned' then 'Transaction roleplayer assigned' else 'Transaction roleplayer reassigned' end,
    v_partner_label || ' has been assigned as ' || lower(v_role_label) || ' on ' || public.bridge_transaction_reference_phase4(v_transaction) || '.',
    v_key || ':transaction-roleplayer:' || new.id::text || ':' || coalesce(new.updated_at, now())::text,
    jsonb_strip_nulls(jsonb_build_object(
      'roleplayerId', new.id,
      'roleType', new.role_type,
      'roleLabel', v_role_label,
      'partnerName', v_partner_label,
      'partnerEmail', new.email_address,
      'nextAction', 'Confirm the roleplayer has the correct workspace access.'
    )),
    'transaction_role_players'
  );

  return new;
end;
$$;

drop trigger if exists trg_transaction_roleplayer_notifications_phase4
  on public.transaction_role_players;
create trigger trg_transaction_roleplayer_notifications_phase4
after insert or update on public.transaction_role_players
for each row execute function public.bridge_handle_transaction_roleplayer_notifications_phase4();

create or replace function public.bridge_queue_transaction_stalled_notifications_phase4(
  p_limit integer default 100,
  p_now timestamptz default now(),
  p_dry_run boolean default false,
  p_stalled_after_days integer default 7
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_transaction public.transactions%rowtype;
  v_cutoff timestamptz := p_now - make_interval(days => greatest(1, coalesce(p_stalled_after_days, 7)));
  v_considered integer := 0;
  v_queued integer := 0;
  v_event_id uuid;
begin
  for v_transaction in
    select tx.*
    from public.transactions tx
    where tx.organisation_id is not null
      and public.bridge_transaction_terminal_state_phase4(tx) = ''
      and coalesce((to_jsonb(tx)->>'is_active')::boolean, true) is true
      and coalesce(
        nullif(to_jsonb(tx)->>'last_meaningful_activity_at', '')::timestamptz,
        tx.updated_at,
        tx.created_at
      ) <= v_cutoff
    order by coalesce(
      nullif(to_jsonb(tx)->>'last_meaningful_activity_at', '')::timestamptz,
      tx.updated_at,
      tx.created_at
    ) asc
    limit greatest(1, least(coalesce(p_limit, 100), 500))
  loop
    v_considered := v_considered + 1;
    if p_dry_run then
      continue;
    end if;

    v_event_id := public.bridge_queue_transaction_operation_event_phase4(
      v_transaction,
      'transaction_stalled',
      'Transaction needs attention',
      public.bridge_transaction_reference_phase4(v_transaction) || ' has had no meaningful activity for ' || greatest(1, coalesce(p_stalled_after_days, 7))::text || ' days.',
      'transaction-stalled:' || v_transaction.id::text || ':' || to_char(p_now, 'IYYY-IW'),
      jsonb_strip_nulls(jsonb_build_object(
        'reason', 'No meaningful activity for ' || greatest(1, coalesce(p_stalled_after_days, 7))::text || ' days',
        'nextAction', 'Review the transaction and record the next action.',
        'stalledAfterDays', greatest(1, coalesce(p_stalled_after_days, 7))
      )),
      'transaction_stalled_scan'
    );
    if v_event_id is not null then
      v_queued := v_queued + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'success', true,
    'phase', 'phase_4_transaction_roleplayer_notifications',
    'considered', v_considered,
    'queued', v_queued,
    'dryRun', p_dry_run
  );
end;
$$;

create or replace function public.bridge_claim_transaction_operations_notifications_phase4(
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
        'transaction_created',
        'transaction_owner_changed',
        'transaction_roleplayer_assigned',
        'transaction_roleplayer_reassigned',
        'transaction_partner_accepted',
        'transaction_partner_declined',
        'transaction_stage_changed',
        'transaction_stalled',
        'transaction_cancelled',
        'transaction_archived',
        'transaction_reactivated'
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

revoke all on function public.bridge_queue_transaction_stalled_notifications_phase4(integer, timestamptz, boolean, integer) from public, anon, authenticated;
revoke all on function public.bridge_claim_transaction_operations_notifications_phase4(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.bridge_queue_transaction_stalled_notifications_phase4(integer, timestamptz, boolean, integer) to service_role;
grant execute on function public.bridge_claim_transaction_operations_notifications_phase4(uuid, uuid, integer) to service_role;

comment on function public.bridge_queue_transaction_stalled_notifications_phase4(integer, timestamptz, boolean, integer) is
  'Phase 4 queues branded transaction stalled email events for active transactions without meaningful activity.';
comment on function public.bridge_claim_transaction_operations_notifications_phase4(uuid, uuid, integer) is
  'Phase 4 claims queued transaction and roleplayer notification_events for the send-email transaction operations dispatcher.';

notify pgrst, 'reload schema';
commit;
