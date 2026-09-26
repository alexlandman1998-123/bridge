begin;

create index if not exists document_requests_client_turnaround_idx
  on public.document_requests (completed_at, transaction_id, created_at)
  where completed_at is not null;

create or replace function public.get_attorney_dashboard_health_performance_snapshot(
  p_firm_id uuid,
  p_role_view text default 'all',
  p_period_start date default null,
  p_period_end date default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_role text;
  v_role_view text := lower(trim(coalesce(p_role_view, 'all')));
  v_today date := timezone('Africa/Johannesburg', now())::date;
  v_period_start date := coalesce(p_period_start, date_trunc('month', timezone('Africa/Johannesburg', now()))::date);
  v_period_end date := coalesce(p_period_end, (date_trunc('month', timezone('Africa/Johannesburg', now())) + interval '1 month')::date);
  v_week_start date := date_trunc('week', timezone('Africa/Johannesburg', now()))::date;
  v_result jsonb;
begin
  if p_firm_id is null or v_actor_id is null then
    raise exception 'Attorney dashboard access requires an authenticated firm member.'
      using errcode = '42501';
  end if;

  if v_period_end <= v_period_start then
    raise exception 'The reporting period end must be after its start.'
      using errcode = '22023';
  end if;

  select member.role
    into v_role
  from public.attorney_firm_members member
  where member.firm_id = p_firm_id
    and member.user_id = v_actor_id
    and member.status = 'active'
  limit 1;

  if v_role not in ('firm_admin', 'director_partner') then
    raise exception 'You do not have permission to view this attorney firm dashboard.'
      using errcode = '42501';
  end if;

  with assignment_rows as (
    select
      assignment.transaction_id,
      coalesce(
        assignment.attorney_role,
        case lower(coalesce(assignment.assignment_type, ''))
          when 'bond' then 'bond_attorney'
          when 'cancellation' then 'cancellation_attorney'
          else 'transfer_attorney'
        end
      ) as attorney_role,
      coalesce(assignment.is_primary, false) as is_primary,
      coalesce(assignment.instruction_accepted_at, assignment.firm_accepted_at, assignment.assigned_at) as accepted_at,
      assignment.assigned_at
    from public.transaction_attorney_assignments assignment
    where coalesce(assignment.attorney_firm_id, assignment.firm_id) = p_firm_id
      and coalesce(assignment.assignment_status, assignment.status, 'active') in ('pending', 'active', 'paused', 'completed')
  ),
  matter_roles as (
    select
      assignment.transaction_id,
      array_agg(distinct assignment.attorney_role order by assignment.attorney_role) as roles,
      (array_agg(
        assignment.attorney_role
        order by
          case when assignment.is_primary then 0 else 1 end,
          case assignment.attorney_role
            when 'transfer_attorney' then 0
            when 'bond_attorney' then 1
            when 'cancellation_attorney' then 2
            else 3
          end,
          assignment.assigned_at,
          assignment.attorney_role
      ))[1] as primary_role,
      min(assignment.accepted_at) as accepted_at
    from assignment_rows assignment
    group by assignment.transaction_id
  ),
  scoped_matters as (
    select
      transaction.id as transaction_id,
      roles.roles,
      roles.primary_role,
      coalesce(
        roles.accepted_at,
        transaction.instructed_at,
        transaction.instruction_at,
        transaction.instruction_date::timestamptz
      ) as accepted_at,
      transaction.is_active,
      lower(coalesce(transaction.lifecycle_state, 'active')) as lifecycle_state,
      lower(coalesce(transaction.risk_status, '')) as risk_status,
      lower(coalesce(transaction.operational_state, '')) as operational_state,
      transaction.target_registration_date,
      coalesce(transaction.registration_date, timezone('Africa/Johannesburg', transaction.registered_at)::date) as registered_on,
      timezone('Africa/Johannesburg', transaction.cancelled_at)::date as cancelled_on,
      coalesce(transaction.last_meaningful_activity_at, transaction.updated_at, transaction.created_at) as last_activity_at
    from matter_roles roles
    join public.transactions transaction on transaction.id = roles.transaction_id
    where lower(coalesce(transaction.stage, '')) <> 'available'
      and lower(coalesce(transaction.current_main_stage, '')) not in ('avail', 'available')
      and lower(coalesce(transaction.next_action, '')) not like 'transaction deleted%'
      and lower(coalesce(transaction.next_action, '')) not like 'transaction reset to available%'
      and case v_role_view
        when 'transfer' then 'transfer_attorney' = any(roles.roles)
        when 'bond' then 'bond_attorney' = any(roles.roles)
        when 'cancellation' then 'cancellation_attorney' = any(roles.roles)
        when 'shared' then cardinality(roles.roles) > 1
        when 'full-service' then cardinality(roles.roles) = 3
        else true
      end
  ),
  active_matters as (
    select matter.*
    from scoped_matters matter
    where matter.is_active = true
      and matter.lifecycle_state not in ('archived', 'cancelled', 'deleted', 'completed', 'registered')
      and matter.registered_on is null
  ),
  health_evidence as (
    select
      matter.*,
      exists (
        select 1
        from public.attorney_workflow_blockers blocker
        where blocker.transaction_id = matter.transaction_id
          and blocker.resolved_at is null
          and blocker.due_date < v_today
      ) as has_overdue_blocker,
      exists (
        select 1
        from public.transaction_subprocesses lane
        join public.transaction_subprocess_steps step on step.subprocess_id = lane.id
        where lane.transaction_id = matter.transaction_id
          and step.status = 'blocked'
          and coalesce(
            step.due_date,
            case when coalesce(step.step_metadata->>'dueDate', '') ~ '^\d{4}-\d{2}-\d{2}$'
              then (step.step_metadata->>'dueDate')::date end,
            case when coalesce(step.step_metadata #>> '{workPacket,dueDate}', '') ~ '^\d{4}-\d{2}-\d{2}$'
              then (step.step_metadata #>> '{workPacket,dueDate}')::date end,
            lane.due_date
          ) < v_today
      ) as has_overdue_blocking_task,
      exists (
        select 1
        from public.attorney_workflow_blockers blocker
        where blocker.transaction_id = matter.transaction_id
          and blocker.resolved_at is null
      ) as has_open_blocker,
      exists (
        select 1
        from public.transaction_subprocesses lane
        join public.transaction_subprocess_steps step on step.subprocess_id = lane.id
        where lane.transaction_id = matter.transaction_id
          and step.status not in ('completed', 'completed_externally', 'not_applicable')
          and coalesce(
            step.due_date,
            case when coalesce(step.step_metadata->>'dueDate', '') ~ '^\d{4}-\d{2}-\d{2}$'
              then (step.step_metadata->>'dueDate')::date end,
            case when coalesce(step.step_metadata #>> '{workPacket,dueDate}', '') ~ '^\d{4}-\d{2}-\d{2}$'
              then (step.step_metadata #>> '{workPacket,dueDate}')::date end,
            lane.due_date
          ) between v_today and v_today + 3
      ) as has_task_due_soon,
      exists (
        select 1
        from public.transaction_subprocesses waiting_lane
        join public.transaction_subprocess_steps waiting_step on waiting_step.subprocess_id = waiting_lane.id
        where waiting_lane.transaction_id = matter.transaction_id
          and waiting_step.status = 'waiting'
          and coalesce(
            waiting_step.due_date,
            case when coalesce(waiting_step.step_metadata->>'followUpDate', '') ~ '^\d{4}-\d{2}-\d{2}$'
              then (waiting_step.step_metadata->>'followUpDate')::date end,
            case when coalesce(waiting_step.step_metadata->>'dueDate', '') ~ '^\d{4}-\d{2}-\d{2}$'
              then (waiting_step.step_metadata->>'dueDate')::date end,
            waiting_lane.due_date
          ) > v_today
      ) as has_future_external_wait
    from active_matters matter
  ),
  health_rows as (
    select
      evidence.transaction_id,
      case
        when evidence.risk_status = 'critical'
          or evidence.operational_state = 'critical'
          or evidence.has_overdue_blocker
          or evidence.has_overdue_blocking_task
          or (
            not evidence.has_future_external_wait
            and timezone('Africa/Johannesburg', evidence.last_activity_at)::date <= v_today - 21
          ) then 'critical'
        when evidence.has_open_blocker
          or evidence.has_task_due_soon
          or (
            not evidence.has_future_external_wait
            and timezone('Africa/Johannesburg', evidence.last_activity_at)::date <= v_today - 14
          ) then 'attention'
        else 'on_track'
      end as health_status
    from health_evidence evidence
  ),
  health_summary as (
    select
      count(*) as total,
      count(*) filter (where health_status = 'critical') as critical_count,
      count(*) filter (where health_status = 'attention') as attention_count,
      count(*) filter (where health_status = 'on_track') as on_track_count
    from health_rows
  ),
  registration_rows as (
    select
      matter.transaction_id,
      matter.registered_on,
      timezone('Africa/Johannesburg', matter.accepted_at)::date as accepted_on
    from scoped_matters matter
    where matter.accepted_at is not null
      and matter.registered_on >= v_period_start
      and matter.registered_on < v_period_end
      and matter.lifecycle_state not in ('cancelled', 'deleted')
      and matter.registered_on >= timezone('Africa/Johannesburg', matter.accepted_at)::date
  ),
  terminal_outcomes as (
    select matter.transaction_id, 'registered'::text as outcome
    from scoped_matters matter
    where matter.accepted_at is not null
      and matter.registered_on >= v_period_start
      and matter.registered_on < v_period_end
      and matter.lifecycle_state not in ('cancelled', 'deleted')
    union all
    select matter.transaction_id, 'cancelled'::text as outcome
    from scoped_matters matter
    where matter.accepted_at is not null
      and matter.lifecycle_state = 'cancelled'
      and matter.cancelled_on >= v_period_start
      and matter.cancelled_on < v_period_end
  ),
  document_turnaround_rows as (
    select
      request.id,
      request.transaction_id,
      timezone('Africa/Johannesburg', request.completed_at)::date
        - timezone('Africa/Johannesburg', request.created_at)::date as turnaround_days
    from public.document_requests request
    join scoped_matters matter on matter.transaction_id = request.transaction_id
    where lower(coalesce(request.requested_from, request.assigned_to_role, '')) in (
      'buyer', 'seller', 'client', 'purchaser', 'buyer_and_seller'
    )
      and request.status in ('approved', 'completed', 'reviewed')
      and request.completed_at is not null
      and request.completed_at >= request.created_at
      and timezone('Africa/Johannesburg', request.completed_at)::date >= v_period_start
      and timezone('Africa/Johannesburg', request.completed_at)::date < v_period_end
  ),
  forecast_rows as (
    select matter.transaction_id, matter.target_registration_date
    from active_matters matter
    where matter.target_registration_date is not null
  ),
  distribution_rows as (
    select
      matter.transaction_id,
      case matter.primary_role
        when 'bond_attorney' then 'Bond'
        when 'cancellation_attorney' then 'Cancellation'
        else 'Transfer'
      end as label
    from active_matters matter
  )
  select jsonb_build_object(
    'sourceStatus', 'available',
    'roleView', v_role_view,
    'reportingPeriod', jsonb_build_object('start', v_period_start, 'endExclusive', v_period_end),
    'matterHealth', jsonb_build_object(
      'total', (select total from health_summary),
      'onTrack', jsonb_build_object(
        'count', (select on_track_count from health_summary),
        'percentage', coalesce(round(100.0 * (select on_track_count from health_summary) / nullif((select total from health_summary), 0), 1), 0),
        'matterIds', coalesce((select jsonb_agg(transaction_id order by transaction_id) from health_rows where health_status = 'on_track'), '[]'::jsonb)
      ),
      'attention', jsonb_build_object(
        'count', (select attention_count from health_summary),
        'percentage', coalesce(round(100.0 * (select attention_count from health_summary) / nullif((select total from health_summary), 0), 1), 0),
        'matterIds', coalesce((select jsonb_agg(transaction_id order by transaction_id) from health_rows where health_status = 'attention'), '[]'::jsonb)
      ),
      'critical', jsonb_build_object(
        'count', (select critical_count from health_summary),
        'percentage', coalesce(round(100.0 * (select critical_count from health_summary) / nullif((select total from health_summary), 0), 1), 0),
        'matterIds', coalesce((select jsonb_agg(transaction_id order by transaction_id) from health_rows where health_status = 'critical'), '[]'::jsonb)
      )
    ),
    'conveyancingPerformance', jsonb_build_object(
      'averageDaysToRegistration', (select round(avg(registered_on - accepted_on), 1) from registration_rows),
      'registrationSampleSize', (select count(*) from registration_rows),
      'registrationMatterIds', coalesce((select jsonb_agg(transaction_id order by transaction_id) from registration_rows), '[]'::jsonb),
      'registrationSuccessRate', (
        select round(100.0 * count(*) filter (where outcome = 'registered') / nullif(count(*), 0), 1)
        from terminal_outcomes
      ),
      'registrationOutcomeSampleSize', (select count(*) from terminal_outcomes),
      'registrationOutcomeMatterIds', coalesce((select jsonb_agg(transaction_id order by transaction_id) from terminal_outcomes), '[]'::jsonb),
      'averageDocumentTurnaroundDays', (select round(avg(turnaround_days)::numeric, 1) from document_turnaround_rows),
      'documentTurnaroundSampleSize', (select count(*) from document_turnaround_rows),
      'documentTurnaroundMatterIds', coalesce((select jsonb_agg(distinct transaction_id order by transaction_id) from document_turnaround_rows), '[]'::jsonb),
      'registrationForecast', jsonb_build_object(
        'thisWeek', (select count(*) from forecast_rows where target_registration_date >= v_week_start and target_registration_date < v_week_start + 7),
        'thisWeekMatterIds', coalesce((select jsonb_agg(transaction_id order by transaction_id) from forecast_rows where target_registration_date >= v_week_start and target_registration_date < v_week_start + 7), '[]'::jsonb),
        'nextWeek', (select count(*) from forecast_rows where target_registration_date >= v_week_start + 7 and target_registration_date < v_week_start + 14),
        'nextWeekMatterIds', coalesce((select jsonb_agg(transaction_id order by transaction_id) from forecast_rows where target_registration_date >= v_week_start + 7 and target_registration_date < v_week_start + 14), '[]'::jsonb),
        'thisMonth', (select count(*) from forecast_rows where target_registration_date >= date_trunc('month', v_today)::date and target_registration_date < (date_trunc('month', v_today) + interval '1 month')::date),
        'thisMonthMatterIds', coalesce((select jsonb_agg(transaction_id order by transaction_id) from forecast_rows where target_registration_date >= date_trunc('month', v_today)::date and target_registration_date < (date_trunc('month', v_today) + interval '1 month')::date), '[]'::jsonb)
      ),
      'matterDistribution', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'label', grouped.label,
            'count', grouped.matter_count,
            'percentage', round(100.0 * grouped.matter_count / nullif((select count(*) from distribution_rows), 0), 1),
            'matterIds', grouped.matter_ids
          ) order by case grouped.label when 'Transfer' then 0 when 'Bond' then 1 else 2 end
        )
        from (
          select label, count(*) as matter_count, jsonb_agg(transaction_id order by transaction_id) as matter_ids
          from distribution_rows
          group by label
        ) grouped
      ), '[]'::jsonb)
    )
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.get_attorney_dashboard_health_performance_snapshot(uuid, text, date, date) from public, anon;
grant execute on function public.get_attorney_dashboard_health_performance_snapshot(uuid, text, date, date) to authenticated;

comment on function public.get_attorney_dashboard_health_performance_snapshot(uuid, text, date, date) is
  'Returns mutually exclusive full-firm matter health and evidence-based conveyancing performance metrics for an attorney dashboard reporting period.';

create or replace function public.bridge_emit_attorney_health_performance_refresh_signal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_transaction_id uuid;
  target_subprocess_id uuid;
begin
  if tg_table_name = 'transactions' then
    target_transaction_id := case when tg_op = 'DELETE' then old.id else new.id end;
  elsif tg_table_name in ('document_requests', 'transaction_attorney_assignments') then
    target_transaction_id := case when tg_op = 'DELETE' then old.transaction_id else new.transaction_id end;
  elsif tg_table_name = 'transaction_subprocess_steps' then
    target_subprocess_id := case when tg_op = 'DELETE' then old.subprocess_id else new.subprocess_id end;
    select lane.transaction_id into target_transaction_id
    from public.transaction_subprocesses lane
    where lane.id = target_subprocess_id;
  end if;

  if target_transaction_id is not null then
    insert into public.transaction_refresh_signals (
      transaction_id, version, command_receipt_id, canonical_event_id, changed_at
    ) values (
      target_transaction_id, 1, null, null, now()
    )
    on conflict (transaction_id) do update set
      version = public.transaction_refresh_signals.version + 1,
      command_receipt_id = null,
      canonical_event_id = null,
      changed_at = excluded.changed_at;
  end if;

  return null;
end;
$$;

revoke all on function public.bridge_emit_attorney_health_performance_refresh_signal() from public;

drop trigger if exists bridge_attorney_health_performance_transaction_refresh on public.transactions;
create trigger bridge_attorney_health_performance_transaction_refresh
  after update of risk_status, operational_state, registered_at, registration_date, cancelled_at
  on public.transactions for each row
  execute function public.bridge_emit_attorney_health_performance_refresh_signal();

drop trigger if exists bridge_attorney_health_performance_document_request_refresh on public.document_requests;
create trigger bridge_attorney_health_performance_document_request_refresh
  after update of completed_at on public.document_requests for each row
  execute function public.bridge_emit_attorney_health_performance_refresh_signal();

drop trigger if exists bridge_attorney_health_performance_assignment_refresh on public.transaction_attorney_assignments;
create trigger bridge_attorney_health_performance_assignment_refresh
  after update of attorney_role, is_primary on public.transaction_attorney_assignments for each row
  execute function public.bridge_emit_attorney_health_performance_refresh_signal();

drop trigger if exists bridge_attorney_health_performance_step_refresh on public.transaction_subprocess_steps;
create trigger bridge_attorney_health_performance_step_refresh
  after insert or update of status, due_date, step_metadata, subprocess_id or delete
  on public.transaction_subprocess_steps for each row
  execute function public.bridge_emit_attorney_health_performance_refresh_signal();

commit;
