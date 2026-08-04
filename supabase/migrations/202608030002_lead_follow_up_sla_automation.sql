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
    'lead_first_response_sla_reminder',
    'Lead first response SLA reminder',
    'reminder',
    'scheduled_reminder',
    'agent',
    array['email']::text[],
    'active',
    true,
    'lead_recipient_sla_due_at',
    '{"cadence":"once_per_sla_due_at","warningMinutes":120,"stopWhen":"lead_first_contact_logged","quietHours":{"enabled":true,"timezone":"Africa/Johannesburg","startHour":18,"endHour":8}}'::jsonb,
    '{"domain":"lead_operations","phase":"phase_3_lead_follow_up_sla","communicationTypes":["lead_first_response_sla_reminder"]}'::jsonb
  ),
  (
    'lead_first_response_sla_escalation',
    'Lead first response SLA escalation',
    'reminder',
    'scheduled_reminder',
    'manager',
    array['email']::text[],
    'active',
    true,
    'lead_manager_sla_due_at',
    '{"cadence":"once_per_sla_due_at","stopWhen":"lead_first_contact_logged","quietHours":{"enabled":true,"timezone":"Africa/Johannesburg","startHour":18,"endHour":8}}'::jsonb,
    '{"domain":"lead_operations","phase":"phase_3_lead_follow_up_sla","communicationTypes":["lead_first_response_sla_escalation"]}'::jsonb
  ),
  (
    'lead_follow_up_due_reminder',
    'Lead follow-up due reminder',
    'reminder',
    'scheduled_reminder',
    'agent',
    array['email']::text[],
    'active',
    true,
    'lead_task_recipient_due_date',
    '{"cadence":"once_per_task_due_date","stopWhen":"lead_task_completed","quietHours":{"enabled":true,"timezone":"Africa/Johannesburg","startHour":18,"endHour":8},"escalation":{"enabled":true,"afterDays":1,"recipientRole":"manager"}}'::jsonb,
    '{"domain":"lead_operations","phase":"phase_3_lead_follow_up_sla","communicationTypes":["lead_follow_up_due_reminder"]}'::jsonb
  ),
  (
    'lead_follow_up_missed_escalation',
    'Lead follow-up missed escalation',
    'reminder',
    'scheduled_reminder',
    'manager',
    array['email']::text[],
    'active',
    true,
    'lead_task_manager_due_date',
    '{"cadence":"once_per_task_due_date","stopWhen":"lead_task_completed","quietHours":{"enabled":true,"timezone":"Africa/Johannesburg","startHour":18,"endHour":8}}'::jsonb,
    '{"domain":"lead_operations","phase":"phase_3_lead_follow_up_sla","communicationTypes":["lead_follow_up_missed_escalation"]}'::jsonb
  ),
  (
    'lead_dormant_reactivation',
    'Dormant lead reactivation reminder',
    'reminder',
    'scheduled_reminder',
    'agent',
    array['email']::text[],
    'active',
    true,
    'lead_recipient_dormant_week',
    '{"cadence":"weekly_while_dormant","dormantDays":14,"stopWhen":"lead_activity_logged","quietHours":{"enabled":true,"timezone":"Africa/Johannesburg","startHour":18,"endHour":8}}'::jsonb,
    '{"domain":"lead_operations","phase":"phase_3_lead_follow_up_sla","communicationTypes":["lead_dormant_reactivation"]}'::jsonb
  ),
  (
    'lead_no_response_nurture',
    'Lead no-response nurture',
    'reminder',
    'scheduled_reminder',
    'lead',
    array['email']::text[],
    'active',
    true,
    'lead_recipient_nurture_week',
    '{"cadence":"weekly_after_acknowledgement","startAfterDays":2,"stopWhen":"lead_first_contact_logged","quietHours":{"enabled":true,"timezone":"Africa/Johannesburg","startHour":18,"endHour":8}}'::jsonb,
    '{"domain":"lead_operations","phase":"phase_3_lead_follow_up_sla","communicationTypes":["lead_no_response_nurture"]}'::jsonb
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

create unique index if not exists notification_events_lead_follow_up_sla_dedupe_idx
  on public.notification_events (organisation_id, dedupe_key)
  where automation_key in (
    'lead_first_response_sla_reminder',
    'lead_first_response_sla_escalation',
    'lead_follow_up_due_reminder',
    'lead_follow_up_missed_escalation',
    'lead_dormant_reactivation',
    'lead_no_response_nurture'
  )
    and dedupe_key is not null;

create index if not exists notification_events_lead_follow_up_sla_dispatch_idx
  on public.notification_events (queued_at asc nulls last, created_at asc)
  where automation_key in (
    'lead_first_response_sla_reminder',
    'lead_first_response_sla_escalation',
    'lead_follow_up_due_reminder',
    'lead_follow_up_missed_escalation',
    'lead_dormant_reactivation',
    'lead_no_response_nurture'
  )
    and channel = 'email'
    and status = 'queued';

create or replace function public.bridge_queue_lead_follow_up_sla_events_phase3(
  p_limit integer default 50,
  p_now timestamptz default now(),
  p_dry_run boolean default false,
  p_sla_warning_minutes integer default 120,
  p_dormant_days integer default 14
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit integer := greatest(0, least(coalesce(p_limit, 50), 500));
  v_now timestamptz := coalesce(p_now, now());
  v_today date := (coalesce(p_now, now()) at time zone 'Africa/Johannesburg')::date;
  v_warning_interval interval := make_interval(mins => greatest(5, least(coalesce(p_sla_warning_minutes, 120), 1440)));
  v_dormant_interval interval := make_interval(days => greatest(3, least(coalesce(p_dormant_days, 14), 120)));
  v_candidate_count integer := 0;
  v_queued_count integer := 0;
begin
  drop table if exists pg_temp.bridge_lead_follow_up_sla_candidates;

  create temporary table bridge_lead_follow_up_sla_candidates on commit drop as
  with base_leads as (
    select
      lead.lead_id,
      lead.organisation_id,
      lead.branch_id,
      lead.contact_id,
      lead.assigned_agent_id,
      lead.assigned_user_id,
      coalesce(lead.assigned_user_id, lead.assigned_agent_id) as owner_user_id,
      lead.assigned_agent_email,
      lead.lead_source,
      lead.lead_category,
      lead.status,
      lead.stage,
      lead.sla_due_at,
      lead.first_contacted_at,
      lead.acknowledgement_status,
      lead.acknowledgement_sent_at,
      lead.created_at,
      lead.updated_at,
      contact.email as contact_email,
      contact.phone as contact_phone,
      trim(concat_ws(' ', contact.first_name, contact.last_name)) as contact_name,
      org.name as organisation_name
    from public.leads lead
    left join public.contacts contact
      on contact.contact_id = lead.contact_id
     and contact.organisation_id = lead.organisation_id
    left join public.organisations org
      on org.id = lead.organisation_id
    where coalesce(lower(trim(lead.status)), '') not in ('closed', 'lost', 'converted', 'archived', 'deleted', 'cancelled', 'canceled')
      and coalesce(lower(trim(lead.stage)), '') not in ('closed', 'lost', 'converted', 'archived', 'deleted', 'cancelled', 'canceled')
  ),
  agents as (
    select
      member.organisation_id,
      member.user_id,
      member.email,
      trim(concat_ws(' ', member.first_name, member.last_name)) as display_name,
      member.branch_id,
      member.primary_branch_id
    from public.organisation_users member
    where lower(trim(coalesce(member.status, ''))) in ('active', 'accepted')
      and nullif(trim(coalesce(member.email, '')), '') is not null
  ),
  managers as (
    select
      member.organisation_id,
      member.user_id,
      member.email,
      trim(concat_ws(' ', member.first_name, member.last_name)) as display_name,
      member.branch_id,
      member.primary_branch_id,
      lower(regexp_replace(coalesce(
        nullif(trim(member.workspace_role), ''),
        nullif(trim(member.organisation_role), ''),
        nullif(trim(member.role), ''),
        nullif(trim(member.app_role), ''),
        ''
      ), '[\s-]+', '_', 'g')) as role_key
    from public.organisation_users member
    where lower(trim(coalesce(member.status, ''))) in ('active', 'accepted')
      and nullif(trim(coalesce(member.email, '')), '') is not null
  ),
  latest_activity as (
    select
      lead.lead_id,
      greatest(
        coalesce(lead.updated_at, lead.created_at, 'epoch'::timestamptz),
        coalesce(activity.last_activity_at, 'epoch'::timestamptz),
        coalesce(comm.last_communication_at, 'epoch'::timestamptz)
      ) as last_activity_at
    from base_leads lead
    left join lateral (
      select max(coalesce(item.activity_date, item.created_at)) as last_activity_at
      from public.lead_activities item
      where item.organisation_id = lead.organisation_id
        and item.lead_id = lead.lead_id
    ) activity on true
    left join lateral (
      select max(coalesce(item.occurred_at, item.created_at)) as last_communication_at
      from public.lead_communication_events item
      where item.organisation_id = lead.organisation_id
        and item.lead_id = lead.lead_id
    ) comm on true
  ),
  candidate_rows as (
    select
      'lead_first_response_sla_reminder'::text as automation_key,
      lead.organisation_id,
      lead.branch_id,
      lead.owner_user_id as assigned_user_id,
      lead.lead_id,
      'agent'::text as recipient_role,
      coalesce(agent.email, lead.assigned_agent_email) as recipient_email,
      coalesce(nullif(agent.display_name, ''), agent.email, 'Agent') as recipient_name,
      'First response SLA due soon'::text as subject,
      coalesce(nullif(lead.contact_name, ''), 'A lead') || ' is approaching the first-response SLA.' as message_preview,
      'lead_first_response_sla_reminder:' || lead.lead_id::text || ':' || extract(epoch from lead.sla_due_at)::bigint::text as dedupe_key,
      lead.sla_due_at as due_at,
      null::uuid as task_id,
      null::text as task_title,
      null::date as task_due_date,
      null::integer as quiet_days,
      lead.contact_name,
      lead.contact_email,
      lead.contact_phone,
      lead.lead_source,
      lead.lead_category,
      lead.status,
      lead.stage,
      lead.organisation_name
    from base_leads lead
    left join agents agent
      on agent.organisation_id = lead.organisation_id
     and agent.user_id = lead.owner_user_id
    where lead.first_contacted_at is null
      and lead.sla_due_at is not null
      and lead.sla_due_at > v_now
      and lead.sla_due_at - v_warning_interval <= v_now
      and nullif(trim(coalesce(agent.email, lead.assigned_agent_email, '')), '') is not null

    union all

    select
      'lead_first_response_sla_escalation',
      lead.organisation_id,
      lead.branch_id,
      lead.owner_user_id,
      lead.lead_id,
      'manager',
      manager.email,
      coalesce(nullif(manager.display_name, ''), manager.email, 'Manager'),
      'Lead first response SLA missed',
      coalesce(nullif(lead.contact_name, ''), 'A lead') || ' has missed the first-response SLA.',
      'lead_first_response_sla_escalation:' || lead.lead_id::text || ':' || coalesce(manager.user_id::text, lower(manager.email)) || ':' || extract(epoch from lead.sla_due_at)::bigint::text,
      lead.sla_due_at,
      null::uuid,
      null::text,
      null::date,
      null::integer,
      lead.contact_name,
      lead.contact_email,
      lead.contact_phone,
      lead.lead_source,
      lead.lead_category,
      lead.status,
      lead.stage,
      lead.organisation_name
    from base_leads lead
    join managers manager
      on manager.organisation_id = lead.organisation_id
     and manager.role_key in ('owner', 'principal', 'agency_principal', 'admin', 'super_admin', 'branch_manager', 'agency_manager', 'manager')
     and (
       lead.branch_id is null
       or manager.branch_id is null
       or manager.branch_id = lead.branch_id
       or manager.primary_branch_id = lead.branch_id
     )
    where lead.first_contacted_at is null
      and lead.sla_due_at is not null
      and lead.sla_due_at <= v_now

    union all

    select
      'lead_follow_up_due_reminder',
      lead.organisation_id,
      lead.branch_id,
      coalesce(task.assigned_agent_id, lead.owner_user_id),
      lead.lead_id,
      'agent',
      coalesce(agent.email, lead.assigned_agent_email),
      coalesce(nullif(agent.display_name, ''), agent.email, 'Agent'),
      'Lead follow-up due',
      coalesce(nullif(lead.contact_name, ''), 'A lead') || ' has a follow-up due today.',
      'lead_follow_up_due_reminder:' || task.task_id::text || ':' || task.due_date::text || ':' || coalesce(coalesce(task.assigned_agent_id, lead.owner_user_id)::text, lower(coalesce(agent.email, lead.assigned_agent_email))),
      task.due_date::timestamptz,
      task.task_id,
      task.title,
      task.due_date,
      null::integer,
      lead.contact_name,
      lead.contact_email,
      lead.contact_phone,
      lead.lead_source,
      lead.lead_category,
      lead.status,
      lead.stage,
      lead.organisation_name
    from public.tasks task
    join base_leads lead
      on lead.organisation_id = task.organisation_id
     and lead.lead_id = task.lead_id
    left join agents agent
      on agent.organisation_id = task.organisation_id
     and agent.user_id = coalesce(task.assigned_agent_id, lead.owner_user_id)
    where task.due_date = v_today
      and coalesce(lower(trim(task.status)), 'pending') not in ('completed', 'complete', 'done', 'cancelled', 'canceled', 'closed')
      and nullif(trim(coalesce(agent.email, lead.assigned_agent_email, '')), '') is not null

    union all

    select
      'lead_follow_up_missed_escalation',
      lead.organisation_id,
      lead.branch_id,
      coalesce(task.assigned_agent_id, lead.owner_user_id),
      lead.lead_id,
      'manager',
      manager.email,
      coalesce(nullif(manager.display_name, ''), manager.email, 'Manager'),
      'Lead follow-up missed',
      coalesce(nullif(lead.contact_name, ''), 'A lead') || ' has an overdue follow-up task.',
      'lead_follow_up_missed_escalation:' || task.task_id::text || ':' || task.due_date::text || ':' || coalesce(manager.user_id::text, lower(manager.email)),
      task.due_date::timestamptz,
      task.task_id,
      task.title,
      task.due_date,
      null::integer,
      lead.contact_name,
      lead.contact_email,
      lead.contact_phone,
      lead.lead_source,
      lead.lead_category,
      lead.status,
      lead.stage,
      lead.organisation_name
    from public.tasks task
    join base_leads lead
      on lead.organisation_id = task.organisation_id
     and lead.lead_id = task.lead_id
    join managers manager
      on manager.organisation_id = lead.organisation_id
     and manager.role_key in ('owner', 'principal', 'agency_principal', 'admin', 'super_admin', 'branch_manager', 'agency_manager', 'manager')
     and (
       lead.branch_id is null
       or manager.branch_id is null
       or manager.branch_id = lead.branch_id
       or manager.primary_branch_id = lead.branch_id
     )
    where task.due_date < v_today
      and coalesce(lower(trim(task.status)), 'pending') not in ('completed', 'complete', 'done', 'cancelled', 'canceled', 'closed')

    union all

    select
      'lead_dormant_reactivation',
      lead.organisation_id,
      lead.branch_id,
      lead.owner_user_id,
      lead.lead_id,
      'agent',
      coalesce(agent.email, lead.assigned_agent_email),
      coalesce(nullif(agent.display_name, ''), agent.email, 'Agent'),
      'Dormant lead needs reactivation',
      coalesce(nullif(lead.contact_name, ''), 'A lead') || ' has had no recorded activity for the dormant-lead window.',
      'lead_dormant_reactivation:' || lead.lead_id::text || ':' || coalesce(lead.owner_user_id::text, lower(coalesce(agent.email, lead.assigned_agent_email))) || ':' || date_trunc('week', v_now)::date::text,
      latest.last_activity_at,
      null::uuid,
      null::text,
      null::date,
      greatest(0, floor(extract(epoch from (v_now - latest.last_activity_at)) / 86400)::integer),
      lead.contact_name,
      lead.contact_email,
      lead.contact_phone,
      lead.lead_source,
      lead.lead_category,
      lead.status,
      lead.stage,
      lead.organisation_name
    from base_leads lead
    join latest_activity latest
      on latest.lead_id = lead.lead_id
    left join agents agent
      on agent.organisation_id = lead.organisation_id
     and agent.user_id = lead.owner_user_id
    where latest.last_activity_at <= v_now - v_dormant_interval
      and lead.owner_user_id is not null
      and nullif(trim(coalesce(agent.email, lead.assigned_agent_email, '')), '') is not null

    union all

    select
      'lead_no_response_nurture',
      lead.organisation_id,
      lead.branch_id,
      lead.owner_user_id,
      lead.lead_id,
      'lead',
      lead.contact_email,
      coalesce(nullif(lead.contact_name, ''), 'there'),
      'We are still working on your enquiry',
      'Your enquiry has been received and is still with the property team.',
      'lead_no_response_nurture:' || lead.lead_id::text || ':' || lower(lead.contact_email) || ':' || date_trunc('week', v_now)::date::text,
      coalesce(lead.acknowledgement_sent_at, lead.created_at) + interval '2 days',
      null::uuid,
      null::text,
      null::date,
      null::integer,
      lead.contact_name,
      lead.contact_email,
      lead.contact_phone,
      lead.lead_source,
      lead.lead_category,
      lead.status,
      lead.stage,
      lead.organisation_name
    from base_leads lead
    where lead.first_contacted_at is null
      and nullif(trim(coalesce(lead.contact_email, '')), '') is not null
      and coalesce(lead.acknowledgement_sent_at, lead.created_at) <= v_now - interval '2 days'
      and (
        lower(trim(coalesce(lead.acknowledgement_status, ''))) in ('sent', 'delivered')
        or lead.acknowledgement_sent_at is not null
      )
  )
  select *
  from candidate_rows candidate
  where not exists (
    select 1
    from public.notification_events event
    where event.organisation_id = candidate.organisation_id
      and event.dedupe_key = candidate.dedupe_key
  )
  order by due_at asc nulls last, automation_key asc
  limit v_limit;

  select count(*) into v_candidate_count
  from bridge_lead_follow_up_sla_candidates;

  if not coalesce(p_dry_run, false) then
    insert into public.notification_events (
      automation_key,
      organisation_id,
      branch_id,
      assigned_user_id,
      lead_id,
      event_key,
      category,
      trigger_type,
      channel,
      status,
      recipient_email,
      recipient_role,
      subject,
      message_preview,
      provider,
      source,
      dedupe_key,
      payload_json,
      metadata_json,
      prepared_at,
      queued_at
    )
    select
      candidate.automation_key,
      candidate.organisation_id,
      candidate.branch_id,
      candidate.assigned_user_id,
      candidate.lead_id,
      candidate.automation_key,
      'reminder',
      'scheduled_reminder',
      'email',
      'queued',
      lower(trim(candidate.recipient_email)),
      candidate.recipient_role,
      candidate.subject,
      left(candidate.message_preview, 320),
      'send-email',
      'lead_follow_up_sla_automation',
      candidate.dedupe_key,
      jsonb_build_object(
        'leadId', candidate.lead_id,
        'leadName', nullif(candidate.contact_name, ''),
        'leadEmail', nullif(candidate.contact_email, ''),
        'leadPhone', nullif(candidate.contact_phone, ''),
        'leadSource', nullif(candidate.lead_source, ''),
        'leadCategory', nullif(candidate.lead_category, ''),
        'leadStatus', coalesce(nullif(candidate.status, ''), nullif(candidate.stage, '')),
        'taskId', candidate.task_id,
        'taskTitle', nullif(candidate.task_title, ''),
        'dueDate', candidate.task_due_date,
        'slaDueAt', case when candidate.automation_key like 'lead_first_response_sla_%' then candidate.due_at else null end,
        'quietDays', candidate.quiet_days,
        'recipientName', candidate.recipient_name,
        'source', 'lead_follow_up_sla_automation'
      ),
      jsonb_build_object(
        'phase', 'phase_3_lead_follow_up_sla',
        'domain', 'lead_operations',
        'organisationName', nullif(candidate.organisation_name, ''),
        'taskId', candidate.task_id,
        'dueAt', candidate.due_at,
        'dryRun', false
      ),
      v_now,
      v_now
    from bridge_lead_follow_up_sla_candidates candidate
    on conflict do nothing;

    get diagnostics v_queued_count = row_count;

    update public.leads lead
       set ownership_status = 'escalated',
           updated_at = v_now
     where lead.first_contacted_at is null
       and exists (
         select 1
         from bridge_lead_follow_up_sla_candidates candidate
         where candidate.automation_key = 'lead_first_response_sla_escalation'
           and candidate.lead_id = lead.lead_id
           and candidate.organisation_id = lead.organisation_id
       );
  end if;

  return jsonb_build_object(
    'success', true,
    'phase', 'phase_3_lead_follow_up_sla',
    'dryRun', coalesce(p_dry_run, false),
    'checkedAt', v_now,
    'candidateCount', v_candidate_count,
    'queuedCount', v_queued_count,
    'limit', v_limit,
    'automationKeys', jsonb_build_array(
      'lead_first_response_sla_reminder',
      'lead_first_response_sla_escalation',
      'lead_follow_up_due_reminder',
      'lead_follow_up_missed_escalation',
      'lead_dormant_reactivation',
      'lead_no_response_nurture'
    )
  );
end;
$$;

revoke all on function public.bridge_queue_lead_follow_up_sla_events_phase3(integer, timestamptz, boolean, integer, integer) from public, anon, authenticated;
grant execute on function public.bridge_queue_lead_follow_up_sla_events_phase3(integer, timestamptz, boolean, integer, integer) to service_role;

comment on function public.bridge_queue_lead_follow_up_sla_events_phase3(integer, timestamptz, boolean, integer, integer) is
  'Queues CI-consistent email reminder events for lead first-response SLA, follow-up tasks, dormant lead reactivation, and no-response nurture.';

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
        'agent_invite_reminder',
        'lead_first_response_sla_reminder',
        'lead_first_response_sla_escalation',
        'lead_follow_up_due_reminder',
        'lead_follow_up_missed_escalation',
        'lead_dormant_reactivation',
        'lead_no_response_nurture'
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
         metadata_json = coalesce(event.metadata_json, '{}'::jsonb) ||
           jsonb_build_object(
             'phase', 'phase_4_reminder_dispatch',
             'dispatchClaimedAt', now()
           ),
         updated_at = now()
    from next_events
   where event.id = next_events.id
  returning event.*;
end;
$$;

grant execute on function public.bridge_claim_notification_reminder_events_phase4(integer, uuid) to service_role;

notify pgrst, 'reload schema';

commit;
