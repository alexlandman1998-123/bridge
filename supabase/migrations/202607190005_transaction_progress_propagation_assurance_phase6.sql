begin;

create table if not exists public.transaction_progress_propagation_audits (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'manual',
  status text not null check (status in ('healthy', 'warning', 'critical')),
  gap_count integer not null default 0 check (gap_count >= 0),
  repaired_count integer not null default 0 check (repaired_count >= 0),
  health_json jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists transaction_progress_propagation_audits_created_idx
  on public.transaction_progress_propagation_audits (created_at desc);

alter table public.transaction_progress_propagation_audits enable row level security;

drop policy if exists transaction_progress_propagation_audits_admin_select
  on public.transaction_progress_propagation_audits;
create policy transaction_progress_propagation_audits_admin_select
  on public.transaction_progress_propagation_audits
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles profile
      where profile.id = auth.uid()
        and lower(coalesce(profile.role, '')) in ('developer', 'platform_admin', 'internal_admin', 'admin')
    )
  );

grant select on public.transaction_progress_propagation_audits to authenticated;

create or replace function public.bridge_normalize_progress_status_phase6(p_status text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case lower(coalesce(trim(p_status), ''))
    when 'complete' then 'completed'
    when 'completed' then 'completed'
    when 'blocked' then 'blocked'
    when 'waiting' then 'waiting'
    when 'waiting_on_party' then 'waiting'
    when 'active' then 'in_progress'
    when 'pending' then 'in_progress'
    when 'in_progress' then 'in_progress'
    else 'not_started'
  end;
$$;

create or replace function public.bridge_transaction_progress_propagation_health_phase6(
  p_transaction_id uuid default null,
  p_stale_seconds integer default 120
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := coalesce(auth.role(), '');
  v_is_admin boolean := false;
  v_health jsonb;
begin
  if v_role <> 'service_role' then
    select exists (
      select 1 from public.profiles profile
      where profile.id = auth.uid()
        and lower(coalesce(profile.role, '')) in ('developer', 'platform_admin', 'internal_admin', 'admin')
    ) into v_is_admin;
    if not v_is_admin then
      raise exception 'Platform administrator access is required.' using errcode = '42501';
    end if;
  end if;

  with active_transactions as (
    select tx.id
    from public.transactions tx
    where coalesce(tx.is_active, true)
      and lower(coalesce(tx.lifecycle_state, '')) not in ('archived', 'cancelled')
      and (p_transaction_id is null or tx.id = p_transaction_id)
  ), lane_state as (
    select distinct on (
      lane.transaction_id,
      case when lane.process_type = 'attorney' then 'transfer' else lower(lane.process_type) end
    )
      lane.id,
      lane.transaction_id,
      case when lane.process_type = 'attorney' then 'transfer' else lower(lane.process_type) end as process_key,
      coalesce(nullif(lane.current_stage, ''), 'not_started') as step_key,
      public.bridge_normalize_progress_status_phase6(coalesce(lane.lane_status, lane.status)) as status,
      lane.updated_at
    from public.transaction_subprocesses lane
    join active_transactions tx on tx.id = lane.transaction_id
    order by
      lane.transaction_id,
      case when lane.process_type = 'attorney' then 'transfer' else lower(lane.process_type) end,
      lane.updated_at desc nulls last
  ), missing_baseline as (
    select tx.id as transaction_id, 'transaction'::text as process_key, null::uuid as lane_id, 'missing_baseline'::text as gap_type
    from active_transactions tx
    where not exists (
      select 1 from public.transaction_shared_progress progress
      where progress.transaction_id = tx.id and progress.process_key = 'transaction'
    )
  ), missing_lanes as (
    select lane.transaction_id, lane.process_key, lane.id as lane_id, 'missing_lane_progress'::text as gap_type
    from lane_state lane
    where lane.status <> 'not_started'
      and not exists (
        select 1 from public.transaction_shared_progress progress
        where progress.transaction_id = lane.transaction_id and progress.process_key = lane.process_key
      )
  ), stale_progress as (
    select lane.transaction_id,
      lane.process_key,
      lane.id as lane_id,
      case when progress.visibility = 'client_visible' then 'stale_client_visible' else 'stale_professional' end as gap_type
    from lane_state lane
    join public.transaction_shared_progress progress
      on progress.transaction_id = lane.transaction_id and progress.process_key = lane.process_key
    where lane.updated_at > progress.updated_at + make_interval(secs => greatest(30, least(coalesce(p_stale_seconds, 120), 86400)))
      and progress.visibility <> 'internal'
      and (progress.step_key is distinct from lane.step_key or progress.status is distinct from lane.status)
  ), gaps as (
    select * from missing_baseline
    union all select * from missing_lanes
    union all select * from stale_progress
  ), counts as (
    select
      (select count(*) from active_transactions)::integer as active_transactions,
      (select count(*) from public.transaction_shared_progress progress join active_transactions tx on tx.id = progress.transaction_id)::integer as shared_rows,
      count(*) filter (where gap_type = 'missing_baseline')::integer as missing_baseline,
      count(*) filter (where gap_type = 'missing_lane_progress')::integer as missing_lane_progress,
      count(*) filter (where gap_type = 'stale_professional')::integer as stale_professional,
      count(*) filter (where gap_type = 'stale_client_visible')::integer as stale_client_visible
    from gaps
  ), notification_health as (
    select
      count(*) filter (where event.status = 'failed')::integer as failed,
      count(*) filter (
        where event.status = 'failed' and event.dispatch_attempt_count >= event.max_dispatch_attempts
      )::integer as exhausted
    from public.notification_events event
    join active_transactions tx on tx.id = event.transaction_id
    where event.automation_key = 'transaction_progress_changed' and event.channel = 'email'
  ), sample as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'transactionId', item.transaction_id,
      'processKey', item.process_key,
      'laneId', item.lane_id,
      'gapType', item.gap_type
    ) order by item.gap_type, item.transaction_id) filter (where item.transaction_id is not null), '[]'::jsonb) as rows
    from (select * from gaps limit 50) item
  )
  select jsonb_build_object(
    'status', case
      when counts.stale_client_visible > 0 or notification_health.exhausted > 0 then 'critical'
      when counts.missing_baseline + counts.missing_lane_progress + counts.stale_professional = 0 then 'healthy'
      else 'warning'
    end,
    'generatedAt', now(),
    'transactionId', p_transaction_id,
    'staleAfterSeconds', greatest(30, least(coalesce(p_stale_seconds, 120), 86400)),
    'gapCount', counts.missing_baseline + counts.missing_lane_progress + counts.stale_professional + counts.stale_client_visible,
    'counts', jsonb_build_object(
      'activeTransactions', counts.active_transactions,
      'sharedProgressRows', counts.shared_rows,
      'missingBaseline', counts.missing_baseline,
      'missingLaneProgress', counts.missing_lane_progress,
      'staleProfessional', counts.stale_professional,
      'staleClientVisible', counts.stale_client_visible,
      'failedEmailNotifications', notification_health.failed,
      'exhaustedEmailNotifications', notification_health.exhausted
    ),
    'manualReviewRequired', counts.stale_client_visible > 0 or notification_health.exhausted > 0,
    'gaps', sample.rows
  ) into v_health
  from counts cross join notification_health cross join sample;

  return coalesce(v_health, jsonb_build_object('status', 'healthy', 'gapCount', 0, 'counts', '{}'::jsonb, 'gaps', '[]'::jsonb));
end;
$$;

create or replace function public.bridge_reconcile_transaction_progress_phase6(
  p_transaction_id uuid default null,
  p_limit integer default 250,
  p_source text default 'scheduled_phase6'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := coalesce(auth.role(), '');
  v_is_admin boolean := false;
  v_missing_baseline integer := 0;
  v_missing_lanes integer := 0;
  v_stale_professional integer := 0;
  v_health jsonb;
  v_repaired integer := 0;
begin
  if v_role <> 'service_role' then
    select exists (
      select 1 from public.profiles profile
      where profile.id = auth.uid()
        and lower(coalesce(profile.role, '')) in ('developer', 'platform_admin', 'internal_admin', 'admin')
    ) into v_is_admin;
    if not v_is_admin then
      raise exception 'Platform administrator access is required.' using errcode = '42501';
    end if;
  end if;

  insert into public.transaction_shared_progress (
    transaction_id, process_key, process_label, step_key, status,
    responsible_role, blocked, visibility, professional_title,
    professional_description, source_type, source_id, updated_by, updated_at
  )
  select
    tx.id, 'transaction', 'Transaction',
    lower(regexp_replace(coalesce(nullif(tx.current_main_stage, ''), nullif(tx.stage, ''), 'not_started'), '[^a-zA-Z0-9]+', '_', 'g')),
    case
      when lower(coalesce(tx.lifecycle_state, '')) in ('completed', 'registered') then 'completed'
      when coalesce(tx.current_main_stage, tx.stage) is null then 'not_started'
      else 'in_progress'
    end,
    coalesce(nullif(tx.waiting_on_role, ''), 'transaction_team'), false,
    'professional_shared', coalesce(nullif(tx.current_main_stage, ''), nullif(tx.stage, ''), 'Transaction opened'),
    'Transaction is currently at ' || coalesce(nullif(tx.current_main_stage, ''), nullif(tx.stage, ''), 'the opening stage') || '.',
    'phase6_reconciliation', tx.id::text, auth.uid(), now()
  from public.transactions tx
  where coalesce(tx.is_active, true)
    and lower(coalesce(tx.lifecycle_state, '')) not in ('archived', 'cancelled')
    and (p_transaction_id is null or tx.id = p_transaction_id)
    and not exists (
      select 1 from public.transaction_shared_progress progress
      where progress.transaction_id = tx.id and progress.process_key = 'transaction'
    )
  order by tx.updated_at desc nulls last
  limit greatest(1, least(coalesce(p_limit, 250), 1000))
  on conflict (transaction_id, process_key) do nothing;
  get diagnostics v_missing_baseline = row_count;

  with candidates as (
    select distinct on (
      lane.transaction_id,
      case when lane.process_type = 'attorney' then 'transfer' else lower(lane.process_type) end
    )
      lane.id, lane.transaction_id,
      case when lane.process_type = 'attorney' then 'transfer' else lower(lane.process_type) end as process_key,
      initcap(replace(case when lane.process_type = 'attorney' then 'transfer' else lower(lane.process_type) end, '_', ' ')) as process_label,
      coalesce(nullif(lane.current_stage, ''), 'not_started') as step_key,
      public.bridge_normalize_progress_status_phase6(coalesce(lane.lane_status, lane.status)) as status,
      lane.updated_at
    from public.transaction_subprocesses lane
    join public.transactions tx on tx.id = lane.transaction_id
    where coalesce(tx.is_active, true)
      and lower(coalesce(tx.lifecycle_state, '')) not in ('archived', 'cancelled')
      and (p_transaction_id is null or lane.transaction_id = p_transaction_id)
    order by
      lane.transaction_id,
      case when lane.process_type = 'attorney' then 'transfer' else lower(lane.process_type) end,
      lane.updated_at desc nulls last
  ), missing as (
    select candidate.*
    from candidates candidate
    where candidate.status <> 'not_started'
      and not exists (
        select 1 from public.transaction_shared_progress progress
        where progress.transaction_id = candidate.transaction_id and progress.process_key = candidate.process_key
      )
    order by candidate.updated_at desc nulls last
    limit greatest(1, least(coalesce(p_limit, 250), 1000))
  )
  insert into public.transaction_shared_progress (
    transaction_id, process_key, process_label, step_key, status,
    responsible_role, blocked, visibility, professional_title,
    professional_description, source_type, source_id, updated_by, updated_at
  )
  select
    missing.transaction_id, missing.process_key, missing.process_label,
    missing.step_key, missing.status,
    case missing.process_key
      when 'finance' then 'bond_originator'
      when 'bond' then 'bond_attorney'
      when 'transfer' then 'transfer_attorney'
      when 'cancellation' then 'cancellation_attorney'
      when 'agent_oversight' then 'agent'
      else 'transaction_team'
    end,
    missing.status = 'blocked', 'professional_shared',
    initcap(replace(missing.step_key, '_', ' ')),
    missing.process_label || ' is currently at ' || initcap(replace(missing.step_key, '_', ' ')) || '.',
    'phase6_reconciliation', missing.id::text, auth.uid(), now()
  from missing
  on conflict (transaction_id, process_key) do nothing;
  get diagnostics v_missing_lanes = row_count;

  with lane_state as (
    select distinct on (
      lane.transaction_id,
      case when lane.process_type = 'attorney' then 'transfer' else lower(lane.process_type) end
    )
      lane.id, lane.transaction_id,
      case when lane.process_type = 'attorney' then 'transfer' else lower(lane.process_type) end as process_key,
      coalesce(nullif(lane.current_stage, ''), 'not_started') as step_key,
      public.bridge_normalize_progress_status_phase6(coalesce(lane.lane_status, lane.status)) as status,
      lane.updated_at
    from public.transaction_subprocesses lane
    join public.transactions tx on tx.id = lane.transaction_id
    where coalesce(tx.is_active, true)
      and lower(coalesce(tx.lifecycle_state, '')) not in ('archived', 'cancelled')
      and (p_transaction_id is null or lane.transaction_id = p_transaction_id)
    order by
      lane.transaction_id,
      case when lane.process_type = 'attorney' then 'transfer' else lower(lane.process_type) end,
      lane.updated_at desc nulls last
  ), stale as (
    select progress.id, lane.step_key, lane.status, lane.id as lane_id
    from lane_state lane
    join public.transaction_shared_progress progress
      on progress.transaction_id = lane.transaction_id and progress.process_key = lane.process_key
    where progress.visibility = 'professional_shared'
      and lane.updated_at > progress.updated_at + interval '2 minutes'
      and (progress.step_key is distinct from lane.step_key or progress.status is distinct from lane.status)
    order by lane.updated_at desc nulls last
    limit greatest(1, least(coalesce(p_limit, 250), 1000))
  )
  update public.transaction_shared_progress progress
  set step_key = stale.step_key,
      status = stale.status,
      blocked = stale.status = 'blocked',
      professional_title = initcap(replace(stale.step_key, '_', ' ')),
      professional_description = progress.process_label || ' is currently at ' || initcap(replace(stale.step_key, '_', ' ')) || '.',
      source_type = 'phase6_reconciliation',
      source_id = stale.lane_id::text,
      updated_by = auth.uid(),
      updated_at = now()
  from stale
  where progress.id = stale.id;
  get diagnostics v_stale_professional = row_count;

  v_repaired := v_missing_baseline + v_missing_lanes + v_stale_professional;
  v_health := public.bridge_transaction_progress_propagation_health_phase6(p_transaction_id, 120);

  insert into public.transaction_progress_propagation_audits (
    source, status, gap_count, repaired_count, health_json, created_by
  ) values (
    coalesce(nullif(trim(p_source), ''), 'scheduled_phase6'),
    coalesce(v_health->>'status', 'warning'),
    coalesce((v_health->>'gapCount')::integer, 0),
    v_repaired,
    v_health || jsonb_build_object('repairs', jsonb_build_object(
      'missingBaseline', v_missing_baseline,
      'missingLaneProgress', v_missing_lanes,
      'staleProfessional', v_stale_professional,
      'total', v_repaired
    )),
    auth.uid()
  );

  return v_health || jsonb_build_object('repairs', jsonb_build_object(
    'missingBaseline', v_missing_baseline,
    'missingLaneProgress', v_missing_lanes,
    'staleProfessional', v_stale_professional,
    'total', v_repaired
  ));
end;
$$;

revoke all on function public.bridge_normalize_progress_status_phase6(text) from public;
revoke all on function public.bridge_transaction_progress_propagation_health_phase6(uuid, integer) from public;
revoke all on function public.bridge_reconcile_transaction_progress_phase6(uuid, integer, text) from public;
grant execute on function public.bridge_transaction_progress_propagation_health_phase6(uuid, integer) to authenticated, service_role;
grant execute on function public.bridge_reconcile_transaction_progress_phase6(uuid, integer, text) to authenticated, service_role;

notify pgrst, 'reload schema';
commit;
