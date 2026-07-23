begin;

-- Recovery writes are catch-up data, not new business events.  Keep the existing
-- notification trigger for normal progress changes, but allow the scheduled
-- reconciler to opt out of replaying historic professional updates.
drop trigger if exists trg_transaction_shared_progress_notifications_phase3
  on public.transaction_shared_progress;
create trigger trg_transaction_shared_progress_notifications_phase3
after insert or update on public.transaction_shared_progress
for each row
when (
  current_setting('bridge.suppress_transaction_progress_notifications', true)
    is distinct from 'on'
)
execute function public.bridge_queue_transaction_progress_notifications_phase3();

create table if not exists public.transaction_progress_scheduler_settings_phase8 (
  singleton boolean primary key default true check (singleton),
  notification_dispatch_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.transaction_progress_scheduler_settings_phase8 enable row level security;

insert into public.transaction_progress_scheduler_settings_phase8 (
  singleton,
  notification_dispatch_enabled
) values (true, false)
on conflict (singleton) do nothing;

create or replace function public.bridge_run_transaction_progress_schedule_phase8()
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, vault
as $function$
declare
  project_url text;
  service_role_key text;
  dispatch_enabled boolean := false;
  dispatch_request_id bigint;
  assurance jsonb;
begin
  -- pg_cron has no JWT request context.  The wrapper is not executable by
  -- public roles, so establish the same context used by the protected
  -- assurance RPC before calling it directly.
  perform set_config('request.jwt.claim.role', 'service_role', true);
  perform set_config('bridge.suppress_transaction_progress_notifications', 'on', true);

  assurance := public.bridge_run_transaction_progress_assurance_phase7(
    'production',
    'supabase_cron_phase8',
    1000
  );

  select notification_dispatch_enabled
    into dispatch_enabled
    from public.transaction_progress_scheduler_settings_phase8
   where singleton = true;

  if not coalesce(dispatch_enabled, false) then
    return jsonb_build_object(
      'scheduled', true,
      'notificationDispatch', 'disabled',
      'assurance', assurance
    );
  end if;

  select decrypted_secret
    into project_url
    from vault.decrypted_secrets
   where name = 'arch9_project_url'
   limit 1;

  select decrypted_secret
    into service_role_key
    from vault.decrypted_secrets
   where name = 'arch9_service_role_key'
   limit 1;

  if nullif(trim(project_url), '') is null or nullif(trim(service_role_key), '') is null then
    return jsonb_build_object(
      'scheduled', true,
      'notificationDispatch', 'blocked',
      'reason', 'vault_configuration_missing',
      'assurance', assurance
    );
  end if;

  select net.http_post(
    url := rtrim(project_url, '/') || '/functions/v1/send-email',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_role_key,
      'apikey', service_role_key
    ),
    body := jsonb_build_object(
      'type', 'transaction_progress_dispatch',
      'limit', 100,
      'source', 'supabase_cron_phase8'
    )
  ) into dispatch_request_id;

  return jsonb_build_object(
    'scheduled', true,
    'notificationDispatch', 'queued',
    'dispatchRequestId', dispatch_request_id,
    'assurance', assurance
  );
end;
$function$;

revoke all on function public.bridge_run_transaction_progress_schedule_phase8() from public, anon, authenticated;
grant execute on function public.bridge_run_transaction_progress_schedule_phase8() to service_role;

create or replace function public.bridge_reconcile_transaction_progress_recovery_phase8(
  p_limit integer default 1000,
  p_source text default 'phase8_manual_recovery'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_role text := coalesce(auth.role(), '');
  v_is_admin boolean := false;
begin
  if v_role <> 'service_role' then
    select exists (
      select 1
      from public.profiles profile
      where profile.id = auth.uid()
        and lower(coalesce(profile.role, '')) in ('developer', 'platform_admin', 'internal_admin', 'admin')
    ) into v_is_admin;
    if not v_is_admin then
      raise exception 'Platform administrator access is required.' using errcode = '42501';
    end if;
  end if;

  perform set_config('request.jwt.claim.role', 'service_role', true);
  perform set_config('bridge.suppress_transaction_progress_notifications', 'on', true);

  return public.bridge_reconcile_transaction_progress_phase6(
    null,
    greatest(1, least(coalesce(p_limit, 1000), 1000)),
    coalesce(nullif(trim(p_source), ''), 'phase8_manual_recovery')
  );
end;
$function$;

revoke all on function public.bridge_reconcile_transaction_progress_recovery_phase8(integer, text) from public;
grant execute on function public.bridge_reconcile_transaction_progress_recovery_phase8(integer, text) to authenticated, service_role;

create or replace function public.bridge_set_transaction_progress_rollout_phase7(
  p_environment text,
  p_rollout_mode text,
  p_canary_percent integer default 10,
  p_change_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_environment text := lower(coalesce(nullif(trim(p_environment), ''), 'production'));
  v_next_mode text := lower(coalesce(nullif(trim(p_rollout_mode), ''), 'audit_only'));
  v_reason text := nullif(trim(coalesce(p_change_reason, '')), '');
  v_role text := coalesce(auth.role(), '');
  v_is_admin boolean := false;
  v_previous public.transaction_progress_rollout_settings%rowtype;
  v_health jsonb;
  v_recent_canary_runs integer := 0;
begin
  if v_role <> 'service_role' then
    select exists (
      select 1 from public.profiles profile where profile.id = auth.uid()
        and lower(coalesce(profile.role, '')) in ('developer', 'platform_admin', 'internal_admin', 'admin')
    ) into v_is_admin;
    if not v_is_admin then
      raise exception 'Platform administrator access is required.' using errcode = '42501';
    end if;
  end if;
  if v_next_mode not in ('off', 'audit_only', 'canary', 'full') then
    raise exception 'Invalid rollout mode.' using errcode = '22023';
  end if;
  if v_reason is null or length(v_reason) < 8 then
    raise exception 'A rollout change reason of at least 8 characters is required.' using errcode = '22023';
  end if;

  select * into v_previous
  from public.transaction_progress_rollout_settings setting
  where setting.environment = v_environment
  for update;
  if v_previous.environment is null then
    raise exception 'Unknown rollout environment: %', v_environment using errcode = '22023';
  end if;

  v_health := public.bridge_transaction_progress_propagation_health_phase6(null, 120);
  if (case v_next_mode when 'off' then 0 when 'audit_only' then 1 when 'canary' then 2 else 3 end)
    > (case v_previous.rollout_mode when 'off' then 0 when 'audit_only' then 1 when 'canary' then 2 else 3 end)
  and v_next_mode in ('canary', 'full') and (
    coalesce((v_health->'counts'->>'staleClientVisible')::integer, 0) > v_previous.max_client_review_count
    or coalesce((v_health->'counts'->>'exhaustedEmailNotifications')::integer, 0) > v_previous.max_exhausted_email_count
    or coalesce((v_health->>'gapCount')::integer, 0) > v_previous.max_gap_count
  ) then
    raise exception 'Rollout safety gate failed. Resolve client-visible, email, or propagation thresholds first.' using errcode = '55000';
  end if;

  if v_next_mode = 'full' and v_previous.rollout_mode <> 'full' then
    select count(*)::integer into v_recent_canary_runs
    from public.transaction_progress_rollout_runs run
    where run.environment = v_environment
      and run.rollout_mode = 'canary'
      and run.decision = 'canary_repair'
      and not run.alert_required
      and (
        run.evaluated_transactions > 0
        or coalesce((run.pre_health_json->>'gapCount')::integer, 0) = 0
      )
      and run.created_at >= now() - interval '24 hours';
    if coalesce((v_health->>'gapCount')::integer, 0) <> 0 or v_recent_canary_runs < 3 then
      raise exception 'Full rollout requires zero propagation gaps and three clean canary runs in the last 24 hours.' using errcode = '55000';
    end if;
  end if;

  update public.transaction_progress_rollout_settings
  set rollout_mode = v_next_mode,
      canary_percent = case when v_next_mode = 'full' then 100 else greatest(1, least(coalesce(p_canary_percent, 10), 50)) end,
      auto_repair_enabled = v_next_mode in ('canary', 'full'),
      change_reason = v_reason,
      changed_by = auth.uid(),
      updated_at = now()
  where environment = v_environment;

  insert into public.transaction_progress_rollout_history (
    environment, previous_mode, next_mode, canary_percent,
    change_reason, health_json, changed_by
  ) values (
    v_environment, v_previous.rollout_mode, v_next_mode,
    case when v_next_mode = 'full' then 100 else greatest(1, least(coalesce(p_canary_percent, 10), 50)) end,
    v_reason, v_health, auth.uid()
  );

  return public.bridge_transaction_progress_rollout_state_phase7(v_environment);
end;
$function$;

create or replace function public.bridge_transaction_progress_schedule_health_phase8(
  p_max_age_minutes integer default 10
)
returns jsonb
language plpgsql
security definer
set search_path = public, cron, vault
as $function$
declare
  v_role text := coalesce(auth.role(), '');
  v_is_admin boolean := false;
  v_max_age_minutes integer := greatest(5, least(coalesce(p_max_age_minutes, 10), 60));
  v_cutoff timestamptz;
  v_active_jobs integer := 0;
  v_job jsonb := '{}'::jsonb;
  v_last_success_at timestamptz;
  v_recent_rollout_runs integer := 0;
  v_duplicate_ticks jsonb := '[]'::jsonb;
  v_project_host text;
  v_dispatch_enabled boolean := false;
  v_rollout jsonb := '{}'::jsonb;
  v_healthy boolean := false;
begin
  if v_role <> 'service_role' then
    select exists (
      select 1
      from public.profiles profile
      where profile.id = auth.uid()
        and lower(coalesce(profile.role, '')) in ('developer', 'platform_admin', 'internal_admin', 'admin')
    ) into v_is_admin;
    if not v_is_admin then
      raise exception 'Platform administrator access is required.' using errcode = '42501';
    end if;
  end if;

  v_cutoff := now() - make_interval(mins => v_max_age_minutes);

  select count(*)::integer
    into v_active_jobs
    from cron.job job
   where job.jobname = 'arch9-transaction-progress-recovery-5m'
     and job.active;

  select jsonb_build_object(
    'id', job.jobid,
    'name', job.jobname,
    'schedule', job.schedule,
    'command', job.command,
    'active', job.active
  )
    into v_job
    from cron.job job
   where job.jobname = 'arch9-transaction-progress-recovery-5m'
     and job.active
   order by job.jobid desc
   limit 1;

  select max(run.end_time)
    into v_last_success_at
    from cron.job_run_details run
    join cron.job job on job.jobid = run.jobid
   where job.jobname = 'arch9-transaction-progress-recovery-5m'
     and run.status = 'succeeded';

  select count(*)::integer
    into v_recent_rollout_runs
    from public.transaction_progress_rollout_runs run
   where run.source = 'supabase_cron_phase8'
     and run.created_at >= v_cutoff;

  select coalesce(jsonb_agg(jsonb_build_object(
    'tick', duplicate_tick.tick,
    'count', duplicate_tick.run_count
  ) order by duplicate_tick.tick desc), '[]'::jsonb)
    into v_duplicate_ticks
    from (
      select date_trunc('minute', run.created_at) as tick, count(*)::integer as run_count
      from public.transaction_progress_rollout_runs run
      where run.source = 'supabase_cron_phase8'
        and run.created_at >= v_cutoff
      group by date_trunc('minute', run.created_at)
      having count(*) > 1
    ) duplicate_tick;

  select notification_dispatch_enabled
    into v_dispatch_enabled
    from public.transaction_progress_scheduler_settings_phase8
   where singleton = true;

  select substring(decrypted_secret from '^https?://([^/]+)')
    into v_project_host
    from vault.decrypted_secrets
   where name = 'arch9_project_url'
   limit 1;

  select jsonb_build_object(
    'environment', setting.environment,
    'rolloutMode', setting.rollout_mode,
    'autoRepairEnabled', setting.auto_repair_enabled,
    'maxGapCount', setting.max_gap_count,
    'updatedAt', setting.updated_at
  )
    into v_rollout
    from public.transaction_progress_rollout_settings setting
   where setting.environment = 'production';

  v_healthy := v_active_jobs = 1
    and v_last_success_at is not null
    and v_last_success_at >= v_cutoff
    and v_recent_rollout_runs > 0
    and jsonb_array_length(v_duplicate_ticks) = 0;

  return jsonb_build_object(
    'healthy', v_healthy,
    'maxAgeMinutes', v_max_age_minutes,
    'activeJobCount', v_active_jobs,
    'job', coalesce(v_job, '{}'::jsonb),
    'lastSuccessfulRunAt', v_last_success_at,
    'recentRolloutRuns', v_recent_rollout_runs,
    'duplicateTicks', v_duplicate_ticks,
    'notificationDispatchEnabled', coalesce(v_dispatch_enabled, false),
    'vaultProjectHost', nullif(v_project_host, ''),
    'rollout', coalesce(v_rollout, '{}'::jsonb),
    'checkedAt', now()
  );
end;
$function$;

revoke all on function public.bridge_transaction_progress_schedule_health_phase8(integer) from public;
grant execute on function public.bridge_transaction_progress_schedule_health_phase8(integer) to authenticated, service_role;

do $block$
declare
  existing_job_id bigint;
begin
  for existing_job_id in
    select jobid
      from cron.job
     where jobname in (
       'arch9-transaction-progress-assurance-5m',
       'arch9-transaction-progress-recovery-5m'
     )
        or command ilike '%bridge_run_transaction_progress_schedule_phase7%'
        or command ilike '%bridge_run_transaction_progress_schedule_phase8%'
  loop
    perform cron.unschedule(existing_job_id);
  end loop;
end;
$block$;

select cron.schedule(
  'arch9-transaction-progress-recovery-5m',
  '*/5 * * * *',
  $schedule$select public.bridge_run_transaction_progress_schedule_phase8();$schedule$
);

notify pgrst, 'reload schema';
commit;
