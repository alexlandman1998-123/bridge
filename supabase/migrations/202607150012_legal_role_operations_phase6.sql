begin;

insert into public.notification_automation_definitions (
  automation_key,
  display_name,
  category,
  trigger_type,
  recipient_role,
  channels,
  implementation_status,
  default_enabled,
  dedupe_strategy,
  reminder_policy,
  metadata_json
)
values
  (
    'legal_role_firm_accepted',
    'Bank-appointed firm accepted platform invite',
    'notification',
    'system_event',
    'attorney',
    array['in_app']::text[],
    'active',
    true,
    'appointment_state_once',
    '{}'::jsonb,
    '{"phase":"legal_role_phase_6"}'::jsonb
  ),
  (
    'legal_role_staff_assigned',
    'Bank-appointed firm assigned matter staff',
    'notification',
    'system_event',
    'attorney',
    array['in_app']::text[],
    'active',
    true,
    'appointment_state_once',
    '{}'::jsonb,
    '{"phase":"legal_role_phase_6"}'::jsonb
  ),
  (
    'legal_role_instruction_confirmed',
    'Bank legal instruction confirmed',
    'notification',
    'system_event',
    'attorney',
    array['in_app']::text[],
    'active',
    true,
    'appointment_state_once',
    '{}'::jsonb,
    '{"phase":"legal_role_phase_6"}'::jsonb
  ),
  (
    'legal_role_activated',
    'Bank-appointed legal role activated',
    'notification',
    'system_event',
    'attorney',
    array['in_app']::text[],
    'active',
    true,
    'appointment_state_once',
    '{}'::jsonb,
    '{"phase":"legal_role_phase_6"}'::jsonb
  ),
  (
    'legal_role_replacement_required',
    'Bank-appointed legal role replacement required',
    'notification',
    'system_event',
    'attorney',
    array['email','in_app']::text[],
    'active',
    true,
    'appointment_state_once',
    '{}'::jsonb,
    '{"phase":"legal_role_phase_6"}'::jsonb
  ),
  (
    'legal_role_coordination_reminder',
    'Bank-appointed legal role coordination reminder',
    'reminder',
    'scheduled_reminder',
    'attorney',
    array['email','in_app']::text[],
    'active',
    true,
    'appointment_action_reminder_window',
    '{"cadenceDays":[0,2,5],"stopWhen":"legal_role_state_changes"}'::jsonb,
    '{"phase":"legal_role_phase_6"}'::jsonb
  )
on conflict (automation_key) do update
set
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

create or replace function public.bridge_legal_role_primary_user(
  p_transaction_id uuid,
  p_role_type text,
  p_firm_id uuid default null
)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(assignment.attorney_user_id, assignment.primary_attorney_id)
  from public.transaction_attorney_assignments assignment
  where assignment.transaction_id = p_transaction_id
    and assignment.attorney_role = p_role_type
    and assignment.is_primary = true
    and (p_firm_id is null or coalesce(assignment.attorney_firm_id, assignment.firm_id) = p_firm_id)
    and coalesce(assignment.assignment_status, assignment.status, 'pending') <> 'removed'
  order by assignment.updated_at desc
  limit 1;
$$;

create or replace function public.bridge_legal_role_firm_lead_user(p_firm_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select member.user_id
  from public.attorney_firm_members member
  where member.firm_id = p_firm_id
    and member.status = 'active'
    and member.role in ('firm_admin', 'director_partner')
  order by
    case when member.role = 'firm_admin' then 0 else 1 end,
    member.created_at asc
  limit 1;
$$;

create or replace function public.bridge_record_legal_role_operational_notification_phase6(
  p_appointment_id uuid,
  p_automation_key text,
  p_recipient_user_id uuid,
  p_title text,
  p_message text,
  p_dedupe_suffix text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_appointment public.transaction_legal_role_appointments%rowtype;
  v_organisation_id uuid;
  v_recipient_email text;
  v_dedupe_key text;
  v_notification_event_id uuid;
begin
  select * into v_appointment
  from public.transaction_legal_role_appointments
  where id = p_appointment_id;
  if v_appointment.id is null then return null; end if;

  select transaction.organisation_id into v_organisation_id
  from public.transactions transaction
  where transaction.id = v_appointment.transaction_id;
  if v_organisation_id is null then return null; end if;

  select profile.email into v_recipient_email
  from public.profiles profile
  where profile.id = p_recipient_user_id;

  v_dedupe_key := concat_ws(
    ':',
    p_automation_key,
    v_appointment.id::text,
    coalesce(nullif(trim(p_dedupe_suffix), ''), v_appointment.coordination_state)
  );

  v_notification_event_id := public.bridge_record_notification_event_phase2(
    p_automation_key,
    v_organisation_id,
    'legal_role_operations_phase6',
    auth.uid(),
    p_recipient_user_id,
    'attorney',
    v_recipient_email,
    v_appointment.transaction_id,
    null,
    null,
    null,
    p_title,
    p_message,
    v_dedupe_key,
    jsonb_build_object(
      'appointmentId', v_appointment.id,
      'roleType', v_appointment.role_type,
      'coordinationState', v_appointment.coordination_state
    ),
    jsonb_build_object('phase', 'legal_role_phase_6')
  );

  if p_recipient_user_id is not null then
    perform public.bridge_insert_invite_accepted_transaction_notification_phase2(
      v_appointment.transaction_id,
      p_recipient_user_id,
      'attorney',
      p_title,
      p_message,
      v_dedupe_key,
      jsonb_build_object(
        'appointmentId', v_appointment.id,
        'roleType', v_appointment.role_type,
        'coordinationState', v_appointment.coordination_state,
        'automationKey', p_automation_key
      )
    );
  end if;

  return v_notification_event_id;
end;
$$;

create or replace function public.bridge_handle_legal_role_operational_notification_phase6()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recipient_user_id uuid;
  v_automation_key text;
  v_title text;
  v_message text;
  v_role_label text := case
    when new.role_type = 'bond_attorney' then 'Bond attorney'
    else 'Cancellation attorney'
  end;
begin
  if new.role_type not in ('bond_attorney', 'cancellation_attorney') then return new; end if;

  if old.coordination_state is distinct from new.coordination_state then
    if new.coordination_state = 'invite_accepted' then
      v_automation_key := 'legal_role_firm_accepted';
      v_recipient_user_id := public.bridge_legal_role_primary_user(new.transaction_id, 'transfer_attorney', null);
      v_title := v_role_label || ' firm accepted';
      v_message := new.appointed_firm_name || ' accepted the platform invitation. Internal matter staffing and formal bank instruction remain separate.';
    elsif new.coordination_state = 'instruction_confirmed' then
      v_automation_key := 'legal_role_instruction_confirmed';
      v_recipient_user_id := coalesce(
        public.bridge_legal_role_primary_user(new.transaction_id, new.role_type, new.accepted_firm_id),
        public.bridge_legal_role_firm_lead_user(new.accepted_firm_id)
      );
      v_title := v_role_label || ' instruction ready';
      v_message := 'The bank instruction has been recorded. The appointed firm must accept or decline it.';
    elsif new.coordination_state = 'active' then
      v_automation_key := 'legal_role_activated';
      v_recipient_user_id := public.bridge_legal_role_primary_user(new.transaction_id, 'transfer_attorney', null);
      v_title := v_role_label || ' role active';
      v_message := 'The appointed firm accepted the bank instruction and the legal role is now active.';
    elsif new.coordination_state = 'replacement_required' then
      v_automation_key := 'legal_role_replacement_required';
      v_recipient_user_id := public.bridge_legal_role_primary_user(new.transaction_id, 'transfer_attorney', null);
      v_title := v_role_label || ' replacement required';
      v_message := 'The bank-appointed instruction or invitation was declined. Obtain the replacement appointment from the bank.';
    end if;
  elsif old.staff_assignment_status is distinct from new.staff_assignment_status
    and new.staff_assignment_status = 'staff_assigned' then
    v_automation_key := 'legal_role_staff_assigned';
    v_recipient_user_id := public.bridge_legal_role_primary_user(new.transaction_id, 'transfer_attorney', null);
    v_title := v_role_label || ' matter team assigned';
    v_message := new.appointed_firm_name || ' assigned its internal primary attorney. Formal bank instruction is still required before activation.';
  end if;

  if v_automation_key is not null then
    perform public.bridge_record_legal_role_operational_notification_phase6(
      new.id,
      v_automation_key,
      v_recipient_user_id,
      v_title,
      v_message,
      case
        when v_automation_key = 'legal_role_staff_assigned' then new.staff_assignment_status
        else new.coordination_state
      end
    );
  end if;

  return new;
end;
$$;

drop trigger if exists notify_legal_role_operations_phase6 on public.transaction_legal_role_appointments;
create trigger notify_legal_role_operations_phase6
after update of coordination_state, staff_assignment_status
on public.transaction_legal_role_appointments
for each row
when (
  old.coordination_state is distinct from new.coordination_state
  or old.staff_assignment_status is distinct from new.staff_assignment_status
)
execute function public.bridge_handle_legal_role_operational_notification_phase6();

create or replace function public.bridge_queue_legal_role_coordination_reminders_phase6(
  p_limit integer default 50,
  p_now timestamptz default now(),
  p_dry_run boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_candidate record;
  v_limit integer := greatest(0, least(coalesce(p_limit, 50), 500));
  v_now timestamptz := coalesce(p_now, now());
  v_recipient_user_id uuid;
  v_recipient_email text;
  v_dedupe_key text;
  v_reminder_day integer;
  v_candidate_count integer := 0;
  v_queued_count integer := 0;
begin
  for v_candidate in
    with operational_state as (
      select
        appointment.*,
        transaction.organisation_id,
        case
          when appointment.coordination_state = 'invite_sent' then 'firm_acceptance'
          when appointment.coordination_state = 'invite_accepted'
            and appointment.staff_assignment_status <> 'staff_assigned' then 'staff_assignment'
          when appointment.coordination_state = 'invite_accepted' then 'bank_instruction'
          when appointment.coordination_state = 'instruction_confirmed' then 'instruction_decision'
          when appointment.coordination_state = 'replacement_required' then 'replacement_appointment'
          else null
        end as action_key,
        case
          when appointment.coordination_state = 'invite_sent' then coalesce(invitation.created_at, appointment.updated_at) + interval '2 days'
          when appointment.coordination_state = 'invite_accepted'
            and appointment.staff_assignment_status <> 'staff_assigned' then coalesce(appointment.accepted_at, appointment.updated_at) + interval '1 day'
          when appointment.coordination_state = 'invite_accepted' then appointment.updated_at + interval '2 days'
          when appointment.coordination_state = 'instruction_confirmed' then coalesce(appointment.instruction_confirmed_at, appointment.updated_at) + interval '1 day'
          when appointment.coordination_state = 'replacement_required' then appointment.updated_at + interval '1 day'
          else null
        end as due_at
      from public.transaction_legal_role_appointments appointment
      join public.transactions transaction on transaction.id = appointment.transaction_id
      left join public.transaction_partner_invitations invitation on invitation.id = appointment.invitation_id
      where appointment.role_type in ('bond_attorney', 'cancellation_attorney')
        and appointment.coordination_state in ('invite_sent', 'invite_accepted', 'instruction_confirmed', 'replacement_required')
    )
    select *
    from operational_state
    where action_key is not null and due_at <= v_now
    order by due_at asc
    limit v_limit
  loop
    v_candidate_count := v_candidate_count + 1;
    v_reminder_day := case
      when v_now >= v_candidate.due_at + interval '5 days' then 5
      when v_now >= v_candidate.due_at + interval '2 days' then 2
      else 0
    end;

    if v_candidate.action_key in ('firm_acceptance') then
      v_recipient_user_id := null;
      v_recipient_email := v_candidate.appointed_email;
    elsif v_candidate.action_key in ('staff_assignment', 'bank_instruction', 'instruction_decision') then
      v_recipient_user_id := coalesce(
        public.bridge_legal_role_primary_user(v_candidate.transaction_id, v_candidate.role_type, v_candidate.accepted_firm_id),
        public.bridge_legal_role_firm_lead_user(v_candidate.accepted_firm_id)
      );
      select profile.email into v_recipient_email from public.profiles profile where profile.id = v_recipient_user_id;
    else
      v_recipient_user_id := public.bridge_legal_role_primary_user(v_candidate.transaction_id, 'transfer_attorney', null);
      select profile.email into v_recipient_email from public.profiles profile where profile.id = v_recipient_user_id;
    end if;

    v_dedupe_key := concat_ws(
      ':',
      'legal_role_coordination_reminder',
      v_candidate.id::text,
      v_candidate.action_key,
      'day_' || v_reminder_day::text
    );

    if not exists (
      select 1 from public.notification_events event
      where event.organisation_id = v_candidate.organisation_id
        and event.dedupe_key = v_dedupe_key
    ) then
      if not coalesce(p_dry_run, false) then
        insert into public.notification_events (
          automation_key,
          organisation_id,
          assigned_user_id,
          transaction_id,
          event_key,
          category,
          trigger_type,
          channel,
          status,
          recipient_email,
          recipient_role,
          subject,
          message_preview,
          source,
          dedupe_key,
          payload_json,
          metadata_json,
          prepared_at,
          queued_at
        )
        values (
          'legal_role_coordination_reminder',
          v_candidate.organisation_id,
          v_recipient_user_id,
          v_candidate.transaction_id,
          'legal_role_coordination_reminder:' || v_candidate.action_key,
          'reminder',
          'scheduled_reminder',
          case when v_recipient_email is null then 'in_app' else 'email' end,
          case when v_recipient_email is null then 'sent' else 'queued' end,
          v_recipient_email,
          'attorney',
          'Legal role action overdue: ' || initcap(replace(v_candidate.action_key, '_', ' ')),
          'The ' || initcap(replace(v_candidate.role_type, '_', ' ')) || ' workflow is waiting for ' || replace(v_candidate.action_key, '_', ' ') || '.',
          'legal_role_operations_phase6',
          v_dedupe_key,
          jsonb_build_object(
            'appointmentId', v_candidate.id,
            'roleType', v_candidate.role_type,
            'actionKey', v_candidate.action_key,
            'dueAt', v_candidate.due_at,
            'reminderDay', v_reminder_day,
            'sendEmailType', 'legal_role_coordination_reminder',
            'communicationType', 'legal_role_coordination_reminder'
          ),
          jsonb_build_object('phase', 'legal_role_phase_6'),
          v_now,
          case when v_recipient_email is null then null else v_now end
        );

        if v_recipient_user_id is not null then
          perform public.bridge_insert_invite_accepted_transaction_notification_phase2(
            v_candidate.transaction_id,
            v_recipient_user_id,
            'attorney',
            'Legal role action overdue',
            'The ' || initcap(replace(v_candidate.role_type, '_', ' ')) || ' workflow is waiting for ' || replace(v_candidate.action_key, '_', ' ') || '.',
            v_dedupe_key,
            jsonb_build_object(
              'appointmentId', v_candidate.id,
              'roleType', v_candidate.role_type,
              'actionKey', v_candidate.action_key,
              'dueAt', v_candidate.due_at
            )
          );
        end if;
      end if;
      v_queued_count := v_queued_count + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'success', true,
    'dryRun', coalesce(p_dry_run, false),
    'candidateCount', v_candidate_count,
    'queuedCount', v_queued_count,
    'generatedAt', v_now
  );
end;
$$;

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
        'attorney_invite_reminder',
        'bond_originator_invite_reminder',
        'agent_invite_reminder',
        'legal_role_coordination_reminder'
      )
      and recipient_email is not null
      and (p_event_id is null or id = p_event_id)
    order by queued_at asc nulls last, created_at asc
    limit v_limit
    for update skip locked
  )
  update public.notification_events event
  set
    status = 'processing',
    dispatch_attempt_count = coalesce(event.dispatch_attempt_count, 0) + 1,
    last_dispatch_attempt_at = now(),
    last_dispatch_error = null,
    metadata_json = coalesce(event.metadata_json, '{}'::jsonb) || jsonb_build_object(
      'phase', 'legal_role_phase_6',
      'dispatchClaimedAt', now()
    ),
    updated_at = now()
  from next_events
  where event.id = next_events.id
  returning event.*;
end;
$$;

revoke all on function public.bridge_legal_role_primary_user(uuid, text, uuid) from public, anon, authenticated, service_role;
revoke all on function public.bridge_legal_role_firm_lead_user(uuid) from public, anon, authenticated, service_role;
revoke all on function public.bridge_record_legal_role_operational_notification_phase6(uuid, text, uuid, text, text, text) from public, anon, authenticated, service_role;
revoke all on function public.bridge_handle_legal_role_operational_notification_phase6() from public, anon, authenticated, service_role;
revoke all on function public.bridge_queue_legal_role_coordination_reminders_phase6(integer, timestamptz, boolean) from public, anon, authenticated, service_role;
revoke all on function public.bridge_claim_notification_reminder_events_phase4(integer, uuid) from public, anon, authenticated, service_role;
grant execute on function public.bridge_queue_legal_role_coordination_reminders_phase6(integer, timestamptz, boolean) to service_role;
grant execute on function public.bridge_claim_notification_reminder_events_phase4(integer, uuid) to service_role;

comment on function public.bridge_queue_legal_role_coordination_reminders_phase6(integer, timestamptz, boolean) is
  'Queues deduplicated firm-acceptance, staff-assignment, bank-instruction, instruction-decision, and replacement reminders for bank-appointed legal roles.';

commit;
