begin;

create or replace function public.get_attorney_firm_modules_launch_readiness(
  p_firm_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_report jsonb;
begin
  if p_firm_id is null then
    raise exception 'Attorney firm is required.' using errcode = '22023';
  end if;
  if auth.role() is distinct from 'service_role'
    and (
      auth.uid() is null
      or not (
        public.attorney_user_is_firm_admin(p_firm_id)
        or exists (
          select 1 from public.attorney_firms firm
          where firm.id = p_firm_id and firm.created_by = auth.uid()
        )
      )
    )
  then
    raise exception 'Only firm administrators can assess service-module launch readiness.' using errcode = '42501';
  end if;

  with module_metrics as (
    select
      count(*)::integer as module_count,
      count(*) filter (where module.status = 'active')::integer as active_count,
      count(*) filter (where module.status = 'winding_down')::integer as winding_down_count,
      count(*) filter (where module.status = 'inactive')::integer as inactive_count,
      count(*) filter (
        where module.status = 'winding_down'
          and public.attorney_firm_module_open_matter_count(module.firm_id, module.module_key) = 0
      )::integer as ready_to_deactivate_count,
      count(*) filter (
        where module.status = 'inactive'
          and public.attorney_firm_module_open_matter_count(module.firm_id, module.module_key) > 0
      )::integer as inactive_with_open_matters_count,
      count(*) filter (
        where not exists (
          select 1 from public.attorney_firm_module_history history
          where history.firm_id = module.firm_id
            and history.module_key = module.module_key
        )
      )::integer as history_gap_count
    from public.attorney_firm_modules module
    where module.firm_id = p_firm_id
  ),
  installation_metrics as (
    select
      exists (
        select 1
        from pg_trigger trigger_row
        join pg_class relation on relation.oid = trigger_row.tgrelid
        join pg_namespace namespace on namespace.oid = relation.relnamespace
        where namespace.nspname = 'public'
          and relation.relname = 'transaction_attorney_assignments'
          and trigger_row.tgname = 'trg_enforce_attorney_assignment_module_write_guard'
          and not trigger_row.tgisinternal
          and trigger_row.tgenabled <> 'D'
      ) as write_guard_installed,
      to_regprocedure('public.resolve_attorney_public_intake(text)') is not null as public_intake_guard_installed,
      to_regprocedure('public.get_attorney_firm_module_history(uuid,integer)') is not null as lifecycle_history_installed
  ),
  assessment as (
    select
      module_metrics.*,
      installation_metrics.*,
      case
        when module_metrics.module_count <> 3
          or module_metrics.inactive_with_open_matters_count > 0
          or module_metrics.history_gap_count > 0
          or not installation_metrics.write_guard_installed
          or not installation_metrics.public_intake_guard_installed
          or not installation_metrics.lifecycle_history_installed
        then 'BLOCKED'
        when module_metrics.ready_to_deactivate_count > 0 then 'READY_WITH_ACTIONS'
        else 'READY'
      end as readiness_status
    from module_metrics
    cross join installation_metrics
  )
  select jsonb_build_object(
    'status', assessment.readiness_status,
    'assessedAt', now(),
    'releaseReady', assessment.readiness_status in ('READY', 'READY_WITH_ACTIONS'),
    'strictReleaseReady', assessment.readiness_status = 'READY',
    'mutatedData', false,
    'moduleCount', assessment.module_count,
    'expectedModuleCount', 3,
    'activeCount', assessment.active_count,
    'windingDownCount', assessment.winding_down_count,
    'inactiveCount', assessment.inactive_count,
    'readyToDeactivateCount', assessment.ready_to_deactivate_count,
    'inactiveWithOpenMattersCount', assessment.inactive_with_open_matters_count,
    'historyGapCount', assessment.history_gap_count,
    'writeGuardInstalled', assessment.write_guard_installed,
    'publicIntakeGuardInstalled', assessment.public_intake_guard_installed,
    'lifecycleHistoryInstalled', assessment.lifecycle_history_installed,
    'issueCodes', array_remove(array[
      case when assessment.module_count <> 3 then 'incomplete_module_registry' end,
      case when assessment.inactive_with_open_matters_count > 0 then 'inactive_modules_have_open_matters' end,
      case when assessment.history_gap_count > 0 then 'missing_module_history' end,
      case when not assessment.write_guard_installed then 'write_guard_not_installed' end,
      case when not assessment.public_intake_guard_installed then 'public_intake_guard_not_installed' end,
      case when not assessment.lifecycle_history_installed then 'lifecycle_history_not_installed' end,
      case when assessment.ready_to_deactivate_count > 0 then 'wind_down_ready_for_deactivation' end
    ]::text[], null)
  ) into v_report
  from assessment;

  return v_report;
end;
$$;

comment on function public.get_attorney_firm_modules_launch_readiness(uuid) is
  'Phase 8 read-only release assessment for module registry coverage, lifecycle history, write guards, public intake guards, and inactive-matter drift.';

create or replace function public.get_attorney_firm_modules_launch_metrics(
  p_firm_id uuid,
  p_window_hours integer default 24
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_window_hours integer := coalesce(p_window_hours, 24);
  v_window_started_at timestamptz;
  v_readiness jsonb;
  v_activity jsonb;
  v_current_state jsonb;
begin
  if p_firm_id is null then
    raise exception 'Attorney firm is required.' using errcode = '22023';
  end if;
  if v_window_hours < 1 or v_window_hours > 168 then
    raise exception 'Launch telemetry window must be between 1 and 168 hours.' using errcode = '22023';
  end if;
  if auth.role() is distinct from 'service_role'
    and (
      auth.uid() is null
      or not (
        public.attorney_user_is_firm_admin(p_firm_id)
        or exists (
          select 1 from public.attorney_firms firm
          where firm.id = p_firm_id and firm.created_by = auth.uid()
        )
      )
    )
  then
    raise exception 'Only firm administrators can view service-module launch telemetry.' using errcode = '42501';
  end if;

  v_window_started_at := now() - make_interval(hours => v_window_hours);
  v_readiness := public.get_attorney_firm_modules_launch_readiness(p_firm_id);

  select jsonb_build_object(
    'transitions', count(*) filter (where history.change_source <> 'baseline'),
    'activations', count(*) filter (where history.new_status = 'active' and history.previous_status = 'inactive'),
    'reactivations', count(*) filter (where history.new_status = 'active' and history.previous_status = 'winding_down'),
    'windDownsStarted', count(*) filter (where history.new_status = 'winding_down'),
    'deactivations', count(*) filter (where history.new_status = 'inactive'),
    'baselineRecords', count(*) filter (where history.change_source = 'baseline')
  ) into v_activity
  from public.attorney_firm_module_history history
  where history.firm_id = p_firm_id
    and history.changed_at >= v_window_started_at;

  select jsonb_build_object(
    'active', count(*) filter (where module.status = 'active'),
    'windingDown', count(*) filter (where module.status = 'winding_down'),
    'inactive', count(*) filter (where module.status = 'inactive')
  ) into v_current_state
  from public.attorney_firm_modules module
  where module.firm_id = p_firm_id;

  return jsonb_build_object(
    'status', case
      when coalesce((v_readiness->>'releaseReady')::boolean, false) is false then 'BLOCKED'
      when coalesce(v_readiness->>'status', 'BLOCKED') = 'READY_WITH_ACTIONS' then 'ATTENTION'
      else 'HEALTHY'
    end,
    'checkedAt', now(),
    'windowHours', v_window_hours,
    'windowStartedAt', v_window_started_at,
    'mutatedData', false,
    'readiness', v_readiness,
    'currentState', coalesce(v_current_state, '{}'::jsonb),
    'activity', coalesce(v_activity, '{}'::jsonb)
  );
end;
$$;

comment on function public.get_attorney_firm_modules_launch_metrics(uuid, integer) is
  'Phase 8 tenant-safe aggregate launch telemetry. Returns no firm identifiers, matter identifiers, actor identities, or client information.';

revoke all on function public.get_attorney_firm_modules_launch_readiness(uuid) from public, anon;
revoke all on function public.get_attorney_firm_modules_launch_metrics(uuid, integer) from public, anon;
grant execute on function public.get_attorney_firm_modules_launch_readiness(uuid) to authenticated, service_role;
grant execute on function public.get_attorney_firm_modules_launch_metrics(uuid, integer) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
