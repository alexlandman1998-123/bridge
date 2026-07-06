begin;

update public.notification_automation_definitions
   set implementation_status = 'active',
       default_enabled = true,
       metadata_json = coalesce(metadata_json, '{}'::jsonb) ||
         jsonb_build_object('phase', 'phase_3_reminder_queue'),
       updated_at = now()
 where automation_key in (
   'buyer_onboarding_reminder',
   'seller_onboarding_reminder',
   'attorney_invite_reminder',
   'bond_originator_invite_reminder',
   'agent_invite_reminder'
 );

create table if not exists public.notification_reminder_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running',
  dry_run boolean not null default false,
  limit_count integer not null default 50,
  queued_count integer not null default 0,
  skipped_count integer not null default 0,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notification_reminder_runs_status_check
    check (status in ('running', 'completed', 'failed'))
);

alter table if exists public.notification_events
  add column if not exists reminder_run_id uuid references public.notification_reminder_runs(id) on delete set null,
  add column if not exists source_notification_event_id uuid references public.notification_events(id) on delete set null;

create index if not exists notification_events_reminder_run_idx
  on public.notification_events (reminder_run_id, created_at desc)
  where reminder_run_id is not null;

create index if not exists notification_events_source_event_idx
  on public.notification_events (source_notification_event_id, created_at desc)
  where source_notification_event_id is not null;

create index if not exists notification_reminder_runs_started_idx
  on public.notification_reminder_runs (started_at desc);

drop trigger if exists trg_notification_reminder_runs_updated_at
  on public.notification_reminder_runs;
create trigger trg_notification_reminder_runs_updated_at
before update on public.notification_reminder_runs
for each row execute function public.bridge_notification_automation_set_updated_at();

alter table public.notification_reminder_runs enable row level security;

drop policy if exists notification_reminder_runs_service_role_all
  on public.notification_reminder_runs;
create policy notification_reminder_runs_service_role_all
  on public.notification_reminder_runs
  for all
  to service_role
  using (true)
  with check (true);

create or replace function public.bridge_queue_notification_reminder_events_phase3(
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
  v_run_id uuid;
  v_limit integer := greatest(0, least(coalesce(p_limit, 50), 500));
  v_now timestamptz := coalesce(p_now, now());
  v_candidate_count integer := 0;
  v_queued_count integer := 0;
  v_skipped_count integer := 0;
begin
  insert into public.notification_reminder_runs (
    status,
    dry_run,
    limit_count,
    metadata_json
  )
  values (
    'running',
    coalesce(p_dry_run, false),
    v_limit,
    jsonb_build_object(
      'phase', 'phase_3_reminder_queue',
      'cadenceDays', jsonb_build_array(2, 5, 9),
      'generatedAt', v_now
    )
  )
  returning id into v_run_id;

  with reminder_rules as (
    select *
    from (
      values
        (
          'buyer_onboarding_sent',
          'buyer_onboarding_reminder',
          'buyer_onboarding_submitted',
          'buyer',
          'Reminder: buyer onboarding still needs completion',
          'The buyer onboarding form is still outstanding. Send a gentle reminder to complete it.'
        ),
        (
          'seller_onboarding_sent',
          'seller_onboarding_reminder',
          'seller_onboarding_submitted',
          'seller',
          'Reminder: seller onboarding still needs completion',
          'The seller onboarding form is still outstanding. Send a gentle reminder to complete it.'
        ),
        (
          'attorney_invite_sent',
          'attorney_invite_reminder',
          'attorney_invite_accepted',
          'attorney',
          'Reminder: attorney invite is still pending',
          'The attorney invite has not been accepted yet. Send a gentle reminder to accept it.'
        ),
        (
          'bond_originator_invite_sent',
          'bond_originator_invite_reminder',
          'bond_originator_invite_accepted',
          'bond_originator',
          'Reminder: bond originator invite is still pending',
          'The bond originator invite has not been accepted yet. Send a gentle reminder to accept it.'
        ),
        (
          'agent_invite_sent',
          'agent_invite_reminder',
          'agent_invite_accepted',
          'agent',
          'Reminder: agent invite is still pending',
          'The agent invite has not been accepted yet. Send a gentle reminder to accept it.'
        )
    ) as rule(
      source_key,
      reminder_key,
      stop_key,
      recipient_role,
      subject,
      message_preview
    )
  ),
  source_deliveries as (
    select
      cd.id as source_delivery_id,
      cd.notification_event_id as source_notification_event_id,
      cd.organisation_id,
      cd.branch_id,
      cd.lead_id,
      cd.listing_id,
      cd.transaction_id,
      cd.offer_id,
      cd.appointment_id,
      cd.portal_session_id,
      cd.seller_review_session_id,
      lower(trim(cd.recipient)) as recipient_email,
      coalesce(nullif(lower(trim(cd.recipient_role)), ''), rule.recipient_role) as recipient_role,
      rule.source_key,
      rule.reminder_key,
      rule.stop_key,
      rule.subject,
      rule.message_preview,
      cd.subject as source_subject,
      left(coalesce(cd.message_preview, ''), 320) as source_message_preview,
      coalesce(cd.sent_at, cd.delivered_at, cd.created_at) as source_sent_at,
      cd.created_at as source_created_at,
      coalesce(cd.metadata_json, '{}'::jsonb) as source_metadata_json
    from public.communication_deliveries cd
    join reminder_rules rule
      on rule.source_key = cd.automation_key
    join public.notification_automation_definitions definition
      on definition.automation_key = rule.reminder_key
     and definition.implementation_status = 'active'
     and definition.default_enabled = true
    where cd.channel = 'email'
      and cd.status in ('sent', 'delivered')
      and nullif(trim(cd.recipient), '') is not null
  ),
  due_windows as (
    select
      sd.*,
      cadence_day,
      sd.source_sent_at + make_interval(days => cadence_day) as due_at,
      sd.reminder_key || ':delivery:' || sd.source_delivery_id::text || ':d' || cadence_day::text as dedupe_key
    from source_deliveries sd
    cross join lateral unnest(array[2, 5, 9]) as cadence_day
    where sd.source_sent_at + make_interval(days => cadence_day) <= v_now
  ),
  candidate_due as (
    select distinct on (due.source_delivery_id)
      due.*
    from due_windows due
    where not exists (
        select 1
        from public.notification_events existing
        where existing.organisation_id = due.organisation_id
          and existing.dedupe_key = due.dedupe_key
        limit 1
      )
      and not exists (
        select 1
        from public.notification_events stop_event
        where stop_event.organisation_id = due.organisation_id
          and stop_event.automation_key = due.stop_key
          and stop_event.status <> 'failed'
          and (
            (due.transaction_id is not null and stop_event.transaction_id = due.transaction_id)
            or (due.listing_id is not null and stop_event.listing_id = due.listing_id)
            or (due.lead_id is not null and stop_event.lead_id = due.lead_id)
            or lower(coalesce(stop_event.recipient_email, '')) = due.recipient_email
          )
        limit 1
      )
      and (
        due.reminder_key <> 'buyer_onboarding_reminder'
        or not exists (
          select 1
          from public.transactions tx
          where tx.id = due.transaction_id
            and (
              tx.onboarding_completed_at is not null
              or tx.external_onboarding_submitted_at is not null
            )
          limit 1
        )
      )
      and (
        due.reminder_key <> 'seller_onboarding_reminder'
        or (
          not exists (
            select 1
            from public.private_listing_seller_onboarding seller_onboarding
            where seller_onboarding.private_listing_id = due.listing_id
              and (
                seller_onboarding.submitted_at is not null
                or lower(coalesce(seller_onboarding.status, '')) in ('submitted', 'completed', 'complete')
              )
            limit 1
          )
          and not exists (
            select 1
            from public.leads lead
            where lead.lead_id = due.lead_id
              and lower(coalesce(lead.seller_onboarding_status, '')) in ('submitted', 'completed', 'complete')
            limit 1
          )
        )
      )
      and (
        due.reminder_key not in ('attorney_invite_reminder', 'bond_originator_invite_reminder')
        or not exists (
          select 1
          from public.transaction_partner_invitations invite
          where invite.transaction_id = due.transaction_id
            and lower(coalesce(invite.email, '')) = due.recipient_email
            and invite.status = 'accepted'
            and (
              (
                due.reminder_key = 'bond_originator_invite_reminder'
                and lower(coalesce(invite.role_type, '')) = 'bond_originator'
              )
              or (
                due.reminder_key = 'attorney_invite_reminder'
                and (
                  lower(coalesce(invite.role_type, '')) = 'attorney'
                  or lower(coalesce(invite.role_type, '')) like '%attorney%'
                  or lower(coalesce(invite.role_type, '')) like '%conveyancer%'
                )
              )
            )
          limit 1
        )
      )
      and (
        due.reminder_key <> 'agent_invite_reminder'
        or not exists (
          select 1
          from public.invites invite
          where invite.target_workspace_id = due.organisation_id
            and lower(coalesce(invite.email, '')) = due.recipient_email
            and invite.status = 'accepted'
            and invite.invite_type in ('workspace_invite', 'branch_invite', 'team_invite')
          limit 1
        )
      )
    order by due.source_delivery_id, due.cadence_day asc
  ),
  limited_candidates as (
    select *
    from candidate_due
    order by due_at asc, source_created_at asc, source_delivery_id asc
    limit v_limit
  ),
  inserted as (
    insert into public.notification_events (
      automation_key,
      organisation_id,
      branch_id,
      lead_id,
      listing_id,
      transaction_id,
      offer_id,
      appointment_id,
      portal_session_id,
      seller_review_session_id,
      reminder_run_id,
      source_notification_event_id,
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
    select
      candidate.reminder_key,
      candidate.organisation_id,
      candidate.branch_id,
      candidate.lead_id,
      candidate.listing_id,
      candidate.transaction_id,
      candidate.offer_id,
      candidate.appointment_id,
      candidate.portal_session_id,
      candidate.seller_review_session_id,
      v_run_id,
      candidate.source_notification_event_id,
      candidate.reminder_key || ':day_' || candidate.cadence_day::text,
      'reminder',
      'scheduled_reminder',
      'email',
      'queued',
      candidate.recipient_email,
      candidate.recipient_role,
      candidate.subject,
      candidate.message_preview,
      'notification_automation_phase3',
      candidate.dedupe_key,
      jsonb_strip_nulls(jsonb_build_object(
        'sourceDeliveryId', candidate.source_delivery_id,
        'sourceNotificationEventId', candidate.source_notification_event_id,
        'sourceAutomationKey', candidate.source_key,
        'reminderDay', candidate.cadence_day,
        'dueAt', candidate.due_at,
        'sendEmailType', candidate.reminder_key,
        'communicationType', candidate.reminder_key,
        'recipient', candidate.recipient_email,
        'recipientRole', candidate.recipient_role,
        'subject', candidate.subject,
        'messagePreview', candidate.message_preview,
        'sourceSubject', candidate.source_subject,
        'sourceMessagePreview', candidate.source_message_preview,
        'transactionId', candidate.transaction_id,
        'listingId', candidate.listing_id,
        'leadId', candidate.lead_id
      )),
      jsonb_build_object(
        'phase', 'phase_3_reminder_queue',
        'reminderRunId', v_run_id,
        'sourceDeliveryId', candidate.source_delivery_id,
        'sourceMetadata', candidate.source_metadata_json
      ),
      v_now,
      v_now
    from limited_candidates candidate
    where not coalesce(p_dry_run, false)
    returning id
  )
  select
    coalesce((select count(*) from candidate_due), 0),
    coalesce((select count(*) from inserted), 0)
    into v_candidate_count, v_queued_count;

  v_skipped_count := greatest(v_candidate_count - v_limit, 0);

  update public.notification_reminder_runs
     set status = 'completed',
         finished_at = now(),
         queued_count = v_queued_count,
         skipped_count = v_skipped_count,
         metadata_json = metadata_json || jsonb_build_object(
           'candidateCount', v_candidate_count,
           'queuedCount', v_queued_count,
           'skippedCount', v_skipped_count
         )
   where id = v_run_id;

  return jsonb_build_object(
    'success', true,
    'dryRun', coalesce(p_dry_run, false),
    'runId', v_run_id,
    'candidateCount', v_candidate_count,
    'queuedCount', v_queued_count,
    'skippedCount', v_skipped_count,
    'generatedAt', v_now
  );
exception
  when others then
    if v_run_id is not null then
      update public.notification_reminder_runs
         set status = 'failed',
             finished_at = now(),
             metadata_json = metadata_json || jsonb_build_object(
               'error', sqlerrm,
               'phase', 'phase_3_reminder_queue'
             )
       where id = v_run_id;
    end if;

    return jsonb_build_object(
      'success', false,
      'dryRun', coalesce(p_dry_run, false),
      'runId', v_run_id,
      'error', sqlerrm,
      'generatedAt', v_now
    );
end;
$$;

grant select, insert, update on public.notification_reminder_runs to service_role;
grant execute on function public.bridge_queue_notification_reminder_events_phase3(integer, timestamptz, boolean) to service_role;

comment on table public.notification_reminder_runs is
  'Audit records for reminder queue runs produced by notification automation Phase 3.';

comment on function public.bridge_queue_notification_reminder_events_phase3(integer, timestamptz, boolean) is
  'Queues due buyer, seller, attorney, bond originator, and agent reminder notification_events with cadence and stop-condition dedupe.';

commit;
