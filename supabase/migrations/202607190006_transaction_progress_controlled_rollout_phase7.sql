begin;

create table if not exists public.transaction_progress_rollout_settings (
  environment text primary key,
  rollout_mode text not null default 'audit_only'
    check (rollout_mode in ('off', 'audit_only', 'canary', 'full')),
  canary_percent integer not null default 10 check (canary_percent between 1 and 100),
  auto_repair_enabled boolean not null default false,
  max_gap_count integer not null default 100 check (max_gap_count between 0 and 10000),
  max_client_review_count integer not null default 0 check (max_client_review_count between 0 and 1000),
  max_exhausted_email_count integer not null default 0 check (max_exhausted_email_count between 0 and 10000),
  change_reason text,
  changed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.transaction_progress_rollout_history (
  id uuid primary key default gen_random_uuid(),
  environment text not null,
  previous_mode text,
  next_mode text not null,
  canary_percent integer not null,
  change_reason text not null,
  health_json jsonb not null default '{}'::jsonb,
  changed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.transaction_progress_rollout_runs (
  id uuid primary key default gen_random_uuid(),
  environment text not null,
  rollout_mode text not null,
  source text not null,
  decision text not null check (decision in ('disabled', 'audit_only', 'canary_repair', 'full_repair', 'blocked')),
  evaluated_transactions integer not null default 0,
  repaired_count integer not null default 0,
  alert_required boolean not null default false,
  pre_health_json jsonb not null default '{}'::jsonb,
  post_health_json jsonb not null default '{}'::jsonb,
  duration_ms integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists transaction_progress_rollout_history_created_idx
  on public.transaction_progress_rollout_history (environment, created_at desc);
create index if not exists transaction_progress_rollout_runs_created_idx
  on public.transaction_progress_rollout_runs (environment, created_at desc);

alter table public.transaction_progress_rollout_settings enable row level security;
alter table public.transaction_progress_rollout_history enable row level security;
alter table public.transaction_progress_rollout_runs enable row level security;

drop policy if exists transaction_progress_rollout_settings_admin_select on public.transaction_progress_rollout_settings;
create policy transaction_progress_rollout_settings_admin_select
  on public.transaction_progress_rollout_settings for select to authenticated
  using (exists (
    select 1 from public.profiles profile where profile.id = auth.uid()
      and lower(coalesce(profile.role, '')) in ('developer', 'platform_admin', 'internal_admin', 'admin')
  ));
drop policy if exists transaction_progress_rollout_history_admin_select on public.transaction_progress_rollout_history;
create policy transaction_progress_rollout_history_admin_select
  on public.transaction_progress_rollout_history for select to authenticated
  using (exists (
    select 1 from public.profiles profile where profile.id = auth.uid()
      and lower(coalesce(profile.role, '')) in ('developer', 'platform_admin', 'internal_admin', 'admin')
  ));
drop policy if exists transaction_progress_rollout_runs_admin_select on public.transaction_progress_rollout_runs;
create policy transaction_progress_rollout_runs_admin_select
  on public.transaction_progress_rollout_runs for select to authenticated
  using (exists (
    select 1 from public.profiles profile where profile.id = auth.uid()
      and lower(coalesce(profile.role, '')) in ('developer', 'platform_admin', 'internal_admin', 'admin')
  ));

grant select on public.transaction_progress_rollout_settings to authenticated;
grant select on public.transaction_progress_rollout_history to authenticated;
grant select on public.transaction_progress_rollout_runs to authenticated;

insert into public.transaction_progress_rollout_settings (
  environment, rollout_mode, canary_percent, auto_repair_enabled,
  max_gap_count, max_client_review_count, max_exhausted_email_count,
  change_reason
) values (
  'production', 'audit_only', 10, false, 100, 0, 0,
  'Phase 7 safe default: observe before enabling repairs.'
)
on conflict (environment) do nothing;

create or replace function public.bridge_transaction_progress_rollout_state_phase7(
  p_environment text default 'production'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_environment text := lower(coalesce(nullif(trim(p_environment), ''), 'production'));
  v_role text := coalesce(auth.role(), '');
  v_is_admin boolean := false;
  v_setting public.transaction_progress_rollout_settings%rowtype;
  v_history jsonb;
  v_runs jsonb;
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

  select * into v_setting
  from public.transaction_progress_rollout_settings setting
  where setting.environment = v_environment;
  if v_setting.environment is null then
    raise exception 'Unknown rollout environment: %', v_environment using errcode = '22023';
  end if;

  select coalesce(jsonb_agg(to_jsonb(item) order by item."createdAt" desc), '[]'::jsonb)
  into v_history
  from (
    select history.id, history.previous_mode as "previousMode", history.next_mode as "nextMode",
      history.canary_percent as "canaryPercent", history.change_reason as "changeReason",
      history.changed_by as "changedBy", history.created_at as "createdAt"
    from public.transaction_progress_rollout_history history
    where history.environment = v_environment
    order by history.created_at desc limit 20
  ) item;

  select coalesce(jsonb_agg(to_jsonb(item) order by item."createdAt" desc), '[]'::jsonb)
  into v_runs
  from (
    select run.id, run.rollout_mode as "rolloutMode", run.source, run.decision,
      run.evaluated_transactions as "evaluatedTransactions", run.repaired_count as "repairedCount",
      run.alert_required as "alertRequired", run.duration_ms as "durationMs", run.created_at as "createdAt"
    from public.transaction_progress_rollout_runs run
    where run.environment = v_environment
    order by run.created_at desc limit 20
  ) item;

  return jsonb_build_object(
    'environment', v_setting.environment,
    'rolloutMode', v_setting.rollout_mode,
    'canaryPercent', v_setting.canary_percent,
    'autoRepairEnabled', v_setting.auto_repair_enabled,
    'thresholds', jsonb_build_object(
      'maxGapCount', v_setting.max_gap_count,
      'maxClientReviewCount', v_setting.max_client_review_count,
      'maxExhaustedEmailCount', v_setting.max_exhausted_email_count
    ),
    'changeReason', v_setting.change_reason,
    'changedBy', v_setting.changed_by,
    'updatedAt', v_setting.updated_at,
    'history', v_history,
    'recentRuns', v_runs
  );
end;
$$;

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
as $$
declare
  v_environment text := lower(coalesce(nullif(trim(p_environment), ''), 'production'));
  v_next_mode text := lower(coalesce(nullif(trim(p_rollout_mode), ''), 'audit_only'));
  v_reason text := nullif(trim(coalesce(p_change_reason, '')), '');
  v_is_admin boolean := false;
  v_previous public.transaction_progress_rollout_settings%rowtype;
  v_health jsonb;
  v_recent_canary_runs integer := 0;
begin
  select exists (
    select 1 from public.profiles profile where profile.id = auth.uid()
      and lower(coalesce(profile.role, '')) in ('developer', 'platform_admin', 'internal_admin', 'admin')
  ) into v_is_admin;
  if not v_is_admin then
    raise exception 'Platform administrator access is required.' using errcode = '42501';
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
$$;

create or replace function public.bridge_run_transaction_progress_assurance_phase7(
  p_environment text default 'production',
  p_source text default 'scheduled_phase7',
  p_limit integer default 50
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_started_at timestamptz := clock_timestamp();
  v_environment text := lower(coalesce(nullif(trim(p_environment), ''), 'production'));
  v_role text := coalesce(auth.role(), '');
  v_is_admin boolean := false;
  v_setting public.transaction_progress_rollout_settings%rowtype;
  v_pre_health jsonb;
  v_post_health jsonb;
  v_repair_result jsonb;
  v_transaction_id uuid;
  v_repaired integer := 0;
  v_evaluated integer := 0;
  v_decision text := 'audit_only';
  v_alert_required boolean := false;
  v_run_id uuid;
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

  select * into v_setting
  from public.transaction_progress_rollout_settings setting
  where setting.environment = v_environment;
  if v_setting.environment is null then
    raise exception 'Unknown rollout environment: %', v_environment using errcode = '22023';
  end if;

  v_pre_health := public.bridge_transaction_progress_propagation_health_phase6(null, 120);
  v_alert_required :=
    coalesce((v_pre_health->'counts'->>'staleClientVisible')::integer, 0) > v_setting.max_client_review_count
    or coalesce((v_pre_health->'counts'->>'exhaustedEmailNotifications')::integer, 0) > v_setting.max_exhausted_email_count
    or coalesce((v_pre_health->>'gapCount')::integer, 0) > v_setting.max_gap_count;

  if v_setting.rollout_mode = 'off' then
    v_decision := 'disabled';
  elsif v_setting.rollout_mode = 'audit_only' or not v_setting.auto_repair_enabled then
    v_decision := 'audit_only';
  elsif v_alert_required then
    v_decision := 'blocked';
  elsif v_setting.rollout_mode = 'canary' then
    v_decision := 'canary_repair';
    for v_transaction_id in
      select distinct (gap.value->>'transactionId')::uuid
      from jsonb_array_elements(coalesce(v_pre_health->'gaps', '[]'::jsonb)) gap(value)
      where coalesce(gap.value->>'transactionId', '') ~ '^[0-9a-fA-F-]{36}$'
        and abs(mod(hashtextextended(gap.value->>'transactionId', 0), 100)) < v_setting.canary_percent
      limit greatest(1, least(coalesce(p_limit, 50), 100))
    loop
      v_evaluated := v_evaluated + 1;
      v_repair_result := public.bridge_reconcile_transaction_progress_phase6(
        v_transaction_id, 25, coalesce(nullif(trim(p_source), ''), 'scheduled_phase7') || ':canary'
      );
      v_repaired := v_repaired + coalesce((v_repair_result->'repairs'->>'total')::integer, 0);
    end loop;
  else
    v_decision := 'full_repair';
    v_repair_result := public.bridge_reconcile_transaction_progress_phase6(
      null, greatest(1, least(coalesce(p_limit, 50), 1000)), coalesce(nullif(trim(p_source), ''), 'scheduled_phase7') || ':full'
    );
    v_evaluated := coalesce((v_pre_health->'counts'->>'activeTransactions')::integer, 0);
    v_repaired := coalesce((v_repair_result->'repairs'->>'total')::integer, 0);
  end if;

  v_post_health := public.bridge_transaction_progress_propagation_health_phase6(null, 120);

  insert into public.transaction_progress_rollout_runs (
    environment, rollout_mode, source, decision, evaluated_transactions,
    repaired_count, alert_required, pre_health_json, post_health_json, duration_ms
  ) values (
    v_environment, v_setting.rollout_mode, coalesce(nullif(trim(p_source), ''), 'scheduled_phase7'),
    v_decision, v_evaluated, v_repaired, v_alert_required, v_pre_health, v_post_health,
    greatest(0, extract(milliseconds from clock_timestamp() - v_started_at)::integer)
  ) returning id into v_run_id;

  return jsonb_build_object(
    'runId', v_run_id,
    'environment', v_environment,
    'rolloutMode', v_setting.rollout_mode,
    'canaryPercent', v_setting.canary_percent,
    'decision', v_decision,
    'evaluatedTransactions', v_evaluated,
    'repairedCount', v_repaired,
    'alertRequired', v_alert_required,
    'preHealth', v_pre_health,
    'postHealth', v_post_health,
    'durationMs', greatest(0, extract(milliseconds from clock_timestamp() - v_started_at)::integer)
  );
end;
$$;

revoke all on function public.bridge_transaction_progress_rollout_state_phase7(text) from public;
revoke all on function public.bridge_set_transaction_progress_rollout_phase7(text, text, integer, text) from public;
revoke all on function public.bridge_run_transaction_progress_assurance_phase7(text, text, integer) from public;
grant execute on function public.bridge_transaction_progress_rollout_state_phase7(text) to authenticated, service_role;
grant execute on function public.bridge_set_transaction_progress_rollout_phase7(text, text, integer, text) to authenticated;
grant execute on function public.bridge_run_transaction_progress_assurance_phase7(text, text, integer) to authenticated, service_role;

notify pgrst, 'reload schema';
commit;
