begin;

create or replace function public.get_attorney_matter_numbering_launch_metrics(
  p_attorney_firm_id uuid,
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
begin
  if p_attorney_firm_id is null then
    raise exception 'Attorney firm is required.' using errcode = '22023';
  end if;
  if v_window_hours < 1 or v_window_hours > 168 then
    raise exception 'Launch telemetry window must be between 1 and 168 hours.' using errcode = '22023';
  end if;
  if auth.role() is distinct from 'service_role'
    and (
      auth.uid() is null
      or not public.attorney_user_is_firm_lead(p_attorney_firm_id)
    )
  then
    raise exception 'Only firm administrators and directors can view matter-number launch telemetry.' using errcode = '42501';
  end if;

  v_window_started_at := now() - make_interval(hours => v_window_hours);
  v_readiness := public.get_attorney_matter_numbering_readiness(p_attorney_firm_id);

  select jsonb_build_object(
    'filesOpened', (
      select count(*)
      from public.attorney_matter_files matter_file
      where matter_file.attorney_firm_id = p_attorney_firm_id
        and matter_file.created_at >= v_window_started_at
    ),
    'referencesGenerated', count(*) filter (where history.change_type = 'generated'),
    'referencesConfirmed', count(*) filter (where history.change_type = 'confirmed'),
    'referencesChanged', count(*) filter (where history.change_type = 'changed'),
    'referencesCleared', count(*) filter (where history.change_type = 'cleared'),
    'referencesBackfilled', count(*) filter (where history.change_type = 'backfilled'),
    'distinctActors', count(distinct history.changed_by) filter (where history.changed_by is not null),
    'settingChanges', (
      select count(*)
      from public.attorney_matter_number_setting_history setting_history
      where setting_history.attorney_firm_id = p_attorney_firm_id
        and setting_history.changed_at >= v_window_started_at
    )
  )
  into v_activity
  from public.attorney_matter_reference_history history
  join public.attorney_matter_files matter_file
    on matter_file.id = history.attorney_matter_file_id
  where matter_file.attorney_firm_id = p_attorney_firm_id
    and history.changed_at >= v_window_started_at;

  return jsonb_build_object(
    'status', case
      when coalesce(v_readiness->>'status', 'BLOCKED') = 'READY' then 'HEALTHY'
      when coalesce((v_readiness->>'releaseReady')::boolean, false) then 'ATTENTION'
      else 'BLOCKED'
    end,
    'checkedAt', now(),
    'windowHours', v_window_hours,
    'windowStartedAt', v_window_started_at,
    'mutatedData', false,
    'readiness', v_readiness,
    'activity', coalesce(v_activity, '{}'::jsonb)
  );
end;
$$;

comment on function public.get_attorney_matter_numbering_launch_metrics(uuid, integer) is
  'Phase 8 tenant-safe aggregate launch telemetry. Returns no matter references, transaction identifiers, or actor identities.';

revoke all on function public.get_attorney_matter_numbering_launch_metrics(uuid, integer) from public, anon;
grant execute on function public.get_attorney_matter_numbering_launch_metrics(uuid, integer) to authenticated;
grant execute on function public.get_attorney_matter_numbering_launch_metrics(uuid, integer) to service_role;

notify pgrst, 'reload schema';

commit;
