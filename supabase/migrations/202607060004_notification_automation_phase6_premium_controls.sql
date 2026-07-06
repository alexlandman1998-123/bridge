begin;

update public.notification_automation_definitions
   set reminder_policy = case automation_key
       when 'buyer_onboarding_reminder' then jsonb_build_object(
         'cadenceDays', jsonb_build_array(2, 5, 9),
         'stopWhen', 'buyer_onboarding_submitted',
         'quietHours', jsonb_build_object(
           'enabled', true,
           'timezone', 'Africa/Johannesburg',
           'startHour', 18,
           'endHour', 8
         ),
         'escalation', jsonb_build_object(
           'enabled', true,
           'afterDay', 9,
           'recipientRole', 'assigned_user',
           'label', 'Escalate to assigned agent after the final buyer onboarding reminder.'
         ),
         'tone', 'premium_personal'
       )
       when 'seller_onboarding_reminder' then jsonb_build_object(
         'cadenceDays', jsonb_build_array(2, 5, 9),
         'stopWhen', 'seller_onboarding_submitted',
         'quietHours', jsonb_build_object(
           'enabled', true,
           'timezone', 'Africa/Johannesburg',
           'startHour', 18,
           'endHour', 8
         ),
         'escalation', jsonb_build_object(
           'enabled', true,
           'afterDay', 9,
           'recipientRole', 'assigned_user',
           'label', 'Escalate to assigned agent after the final seller onboarding reminder.'
         ),
         'tone', 'premium_personal'
       )
       when 'attorney_invite_reminder' then jsonb_build_object(
         'cadenceDays', jsonb_build_array(2, 5, 9),
         'stopWhen', 'attorney_invite_accepted',
         'quietHours', jsonb_build_object(
           'enabled', true,
           'timezone', 'Africa/Johannesburg',
           'startHour', 18,
           'endHour', 8
         ),
         'escalation', jsonb_build_object(
           'enabled', true,
           'afterDay', 9,
           'recipientRole', 'assigned_user',
           'label', 'Escalate to transaction owner after the final attorney invite reminder.'
         ),
         'tone', 'premium_professional'
       )
       when 'bond_originator_invite_reminder' then jsonb_build_object(
         'cadenceDays', jsonb_build_array(2, 5, 9),
         'stopWhen', 'bond_originator_invite_accepted',
         'quietHours', jsonb_build_object(
           'enabled', true,
           'timezone', 'Africa/Johannesburg',
           'startHour', 18,
           'endHour', 8
         ),
         'escalation', jsonb_build_object(
           'enabled', true,
           'afterDay', 9,
           'recipientRole', 'assigned_user',
           'label', 'Escalate to transaction owner after the final bond originator invite reminder.'
         ),
         'tone', 'premium_professional'
       )
       when 'agent_invite_reminder' then jsonb_build_object(
         'cadenceDays', jsonb_build_array(2, 5, 9),
         'stopWhen', 'agent_invite_accepted',
         'quietHours', jsonb_build_object(
           'enabled', true,
           'timezone', 'Africa/Johannesburg',
           'startHour', 18,
           'endHour', 8
         ),
         'escalation', jsonb_build_object(
           'enabled', true,
           'afterDay', 9,
           'recipientRole', 'admin',
           'label', 'Escalate to workspace admin after the final agent invite reminder.'
         ),
         'tone', 'premium_professional'
       )
       else reminder_policy
     end,
       metadata_json = coalesce(metadata_json, '{}'::jsonb) ||
         jsonb_build_object(
           'phase', 'phase_6_premium_controls',
           'premiumControls', jsonb_build_object(
             'dynamicCadence', true,
             'quietHoursAware', true,
             'escalationPolicy', true
           )
         ),
       updated_at = now()
 where automation_key in (
   'buyer_onboarding_reminder',
   'seller_onboarding_reminder',
   'attorney_invite_reminder',
   'bond_originator_invite_reminder',
   'agent_invite_reminder'
 );

create or replace function public.bridge_queue_notification_reminder_events_phase6(
  p_limit integer default 50,
  p_now timestamptz default now(),
  p_dry_run boolean default false,
  p_respect_quiet_hours boolean default true
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
  v_sendable_count integer := 0;
  v_quiet_deferred_count integer := 0;
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
      'phase', 'phase_6_premium_controls',
      'dynamicCadence', true,
      'quietHoursAware', coalesce(p_respect_quiet_hours, true),
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
      default_subject,
      default_message_preview
    )
  ),
  reminder_definitions as (
    select
      rule.*,
      coalesce(definition.reminder_policy, '{}'::jsonb) as reminder_policy,
      coalesce(definition.metadata_json, '{}'::jsonb) as definition_metadata
    from reminder_rules rule
    join public.notification_automation_definitions definition
      on definition.automation_key = rule.reminder_key
     and definition.implementation_status = 'active'
     and definition.default_enabled = true
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
      coalesce(nullif(lower(trim(cd.recipient_role)), ''), definition.recipient_role) as recipient_role,
      definition.source_key,
      definition.reminder_key,
      coalesce(nullif(definition.reminder_policy->>'stopWhen', ''), definition.stop_key) as stop_key,
      coalesce(nullif(definition.reminder_policy->>'subject', ''), definition.default_subject) as subject,
      coalesce(nullif(definition.reminder_policy->>'messagePreview', ''), definition.default_message_preview) as message_preview,
      definition.reminder_policy,
      definition.definition_metadata,
      cd.subject as source_subject,
      left(coalesce(cd.message_preview, ''), 320) as source_message_preview,
      coalesce(cd.sent_at, cd.delivered_at, cd.created_at) as source_sent_at,
      cd.created_at as source_created_at,
      coalesce(cd.metadata_json, '{}'::jsonb) as source_metadata_json
    from public.communication_deliveries cd
    join reminder_definitions definition
      on definition.source_key = cd.automation_key
    where cd.channel = 'email'
      and cd.status in ('sent', 'delivered')
      and nullif(trim(cd.recipient), '') is not null
  ),
  due_windows as (
    select
      sd.*,
      cadence.cadence_day,
      sd.source_sent_at + make_interval(days => cadence.cadence_day) as due_at,
      sd.reminder_key || ':delivery:' || sd.source_delivery_id::text || ':d' || cadence.cadence_day::text as dedupe_key,
      quiet.quiet_timezone,
      quiet.quiet_start_hour,
      quiet.quiet_end_hour,
      local_time.local_hour,
      case
        when not coalesce(p_respect_quiet_hours, true) then false
        when not coalesce(nullif(sd.reminder_policy #>> '{quietHours,enabled}', '')::boolean, true) then false
        when quiet.quiet_start_hour = quiet.quiet_end_hour then false
        when quiet.quiet_start_hour > quiet.quiet_end_hour then
          local_time.local_hour >= quiet.quiet_start_hour
          or local_time.local_hour < quiet.quiet_end_hour
        else
          local_time.local_hour >= quiet.quiet_start_hour
          and local_time.local_hour < quiet.quiet_end_hour
      end as is_quiet_hours
    from source_deliveries sd
    cross join lateral (
      select distinct greatest(1, least(value::integer, 60)) as cadence_day
      from jsonb_array_elements_text(
        case
          when jsonb_typeof(sd.reminder_policy->'cadenceDays') = 'array'
          then sd.reminder_policy->'cadenceDays'
          else '[2,5,9]'::jsonb
        end
      ) as cadence_value(value)
      where value ~ '^[0-9]+$'
    ) cadence
    cross join lateral (
      select
        coalesce(nullif(sd.reminder_policy #>> '{quietHours,timezone}', ''), 'Africa/Johannesburg') as quiet_timezone,
        coalesce(nullif(sd.reminder_policy #>> '{quietHours,startHour}', '')::integer, 18) as quiet_start_hour,
        coalesce(nullif(sd.reminder_policy #>> '{quietHours,endHour}', '')::integer, 8) as quiet_end_hour
    ) quiet
    cross join lateral (
      select extract(hour from timezone(quiet.quiet_timezone, v_now))::integer as local_hour
    ) local_time
    where sd.source_sent_at + make_interval(days => cadence.cadence_day) <= v_now
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
  sendable_candidates as (
    select *
    from candidate_due
    where not is_quiet_hours
  ),
  limited_candidates as (
    select *
    from sendable_candidates
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
      'notification_automation_phase6',
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
        'leadId', candidate.lead_id,
        'quietHours', jsonb_build_object(
          'timezone', candidate.quiet_timezone,
          'startHour', candidate.quiet_start_hour,
          'endHour', candidate.quiet_end_hour
        ),
        'escalation', candidate.reminder_policy->'escalation'
      )),
      jsonb_build_object(
        'phase', 'phase_6_premium_controls',
        'reminderRunId', v_run_id,
        'sourceDeliveryId', candidate.source_delivery_id,
        'sourceMetadata', candidate.source_metadata_json,
        'definitionMetadata', candidate.definition_metadata,
        'reminderPolicy', candidate.reminder_policy,
        'quietHoursDeferred', false
      ),
      v_now,
      v_now
    from limited_candidates candidate
    where not coalesce(p_dry_run, false)
    returning id
  )
  select
    coalesce((select count(*) from candidate_due), 0),
    coalesce((select count(*) from sendable_candidates), 0),
    coalesce((select count(*) from candidate_due where is_quiet_hours), 0),
    coalesce((select count(*) from inserted), 0)
    into v_candidate_count, v_sendable_count, v_quiet_deferred_count, v_queued_count;

  v_skipped_count := greatest(v_sendable_count - v_limit, 0);

  update public.notification_reminder_runs
     set status = 'completed',
         finished_at = now(),
         queued_count = v_queued_count,
         skipped_count = v_skipped_count,
         metadata_json = metadata_json || jsonb_build_object(
           'phase', 'phase_6_premium_controls',
           'candidateCount', v_candidate_count,
           'sendableCount', v_sendable_count,
           'quietHoursDeferredCount', v_quiet_deferred_count,
           'queuedCount', v_queued_count,
           'skippedCount', v_skipped_count
         )
   where id = v_run_id;

  return jsonb_build_object(
    'success', true,
    'phase', 'phase_6_premium_controls',
    'dryRun', coalesce(p_dry_run, false),
    'runId', v_run_id,
    'candidateCount', v_candidate_count,
    'sendableCount', v_sendable_count,
    'quietHoursDeferredCount', v_quiet_deferred_count,
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
               'phase', 'phase_6_premium_controls'
             )
       where id = v_run_id;
    end if;

    return jsonb_build_object(
      'success', false,
      'phase', 'phase_6_premium_controls',
      'dryRun', coalesce(p_dry_run, false),
      'runId', v_run_id,
      'error', sqlerrm,
      'generatedAt', v_now
    );
end;
$$;

create or replace function public.bridge_notification_automation_health_phase6(
  p_organisation_id uuid default null,
  p_since timestamptz default now() - interval '30 days'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_base jsonb := public.bridge_notification_automation_health_phase5(p_organisation_id, p_since);
  v_base_status text := coalesce(v_base->>'status', 'unknown');
  v_controls jsonb := '{}'::jsonb;
  v_policies jsonb := '[]'::jsonb;
  v_issues jsonb := coalesce(v_base->'issues', '[]'::jsonb);
  v_missing_controls integer := 0;
begin
  if v_base_status = 'forbidden' then
    return v_base;
  end if;

  with reminder_definitions as (
    select
      automation_key,
      display_name,
      recipient_role,
      implementation_status,
      default_enabled,
      coalesce(reminder_policy, '{}'::jsonb) as reminder_policy,
      coalesce(metadata_json, '{}'::jsonb) as metadata_json
    from public.notification_automation_definitions
    where category = 'reminder'
  ),
  scored as (
    select
      *,
      jsonb_typeof(reminder_policy->'cadenceDays') = 'array'
        and jsonb_array_length(
          case
            when jsonb_typeof(reminder_policy->'cadenceDays') = 'array'
            then reminder_policy->'cadenceDays'
            else '[]'::jsonb
          end
        ) > 0 as has_cadence,
      coalesce(nullif(reminder_policy #>> '{quietHours,enabled}', '')::boolean, false) as has_quiet_hours,
      coalesce(nullif(reminder_policy #>> '{escalation,enabled}', '')::boolean, false) as has_escalation
    from reminder_definitions
  )
  select
    jsonb_build_object(
      'phase', 'phase_6_premium_controls',
      'totalReminderAutomations', count(*)::integer,
      'activeReminderAutomations', count(*) filter (
        where implementation_status = 'active' and default_enabled
      )::integer,
      'cadenceConfigured', count(*) filter (where has_cadence)::integer,
      'quietHoursConfigured', count(*) filter (where has_quiet_hours)::integer,
      'escalationConfigured', count(*) filter (where has_escalation)::integer,
      'missingControls', count(*) filter (
        where not (has_cadence and has_quiet_hours and has_escalation)
      )::integer,
      'ready', count(*) filter (
        where not (has_cadence and has_quiet_hours and has_escalation)
      ) = 0
    ),
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'automationKey', automation_key,
          'displayName', display_name,
          'recipientRole', recipient_role,
          'status', implementation_status,
          'defaultEnabled', default_enabled,
          'cadenceDays', reminder_policy->'cadenceDays',
          'quietHours', reminder_policy->'quietHours',
          'escalation', reminder_policy->'escalation',
          'tone', reminder_policy->>'tone'
        )
        order by automation_key
      ),
      '[]'::jsonb
    )
    into v_controls, v_policies
  from scored;

  v_missing_controls := coalesce((v_controls->>'missingControls')::integer, 0);

  if v_missing_controls > 0 then
    v_issues := v_issues || jsonb_build_array(jsonb_build_object(
      'code', 'premium_reminder_controls_missing',
      'severity', 'warning',
      'count', v_missing_controls,
      'message', 'Some reminder automations are missing cadence, quiet-hour, or escalation policy controls.'
    ));
  end if;

  return (v_base - 'issues' - 'status') || jsonb_build_object(
    'status', case
      when v_missing_controls > 0 and v_base_status in ('healthy', 'attention') then 'warning'
      else v_base_status
    end,
    'issues', v_issues,
    'premiumControls', v_controls,
    'reminderPolicies', v_policies
  );
end;
$$;

grant execute on function public.bridge_queue_notification_reminder_events_phase6(integer, timestamptz, boolean, boolean) to service_role;
grant execute on function public.bridge_notification_automation_health_phase6(uuid, timestamptz) to authenticated, service_role;

comment on function public.bridge_queue_notification_reminder_events_phase6(integer, timestamptz, boolean, boolean) is
  'Queues notification reminder events from definition-level cadence policies while respecting quiet-hour controls.';

comment on function public.bridge_notification_automation_health_phase6(uuid, timestamptz) is
  'Returns notification automation health with premium reminder cadence, quiet-hour, and escalation policy readiness.';

commit;
