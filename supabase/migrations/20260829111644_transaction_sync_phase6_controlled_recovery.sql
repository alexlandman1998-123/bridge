begin;

create table if not exists public.transaction_sync_recovery_runs (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  requested_reason text not null,
  status text not null check (status in ('repaired', 'no_op')),
  repairs_json jsonb not null default '[]'::jsonb,
  before_json jsonb not null default '{}'::jsonb,
  after_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint transaction_sync_recovery_runs_reason_check
    check (char_length(trim(requested_reason)) between 12 and 500)
);

create index if not exists transaction_sync_recovery_runs_transaction_idx
  on public.transaction_sync_recovery_runs (transaction_id, created_at desc);

alter table public.transaction_sync_recovery_runs enable row level security;

drop policy if exists transaction_sync_recovery_runs_internal_read
  on public.transaction_sync_recovery_runs;
create policy transaction_sync_recovery_runs_internal_read
  on public.transaction_sync_recovery_runs for select to authenticated
  using (
    public.bridge_transaction_scope_is_internal_user()
    and public.bridge_can_access_transaction_spine(transaction_id)
  );

revoke all on table public.transaction_sync_recovery_runs from public, anon, authenticated;
grant select on table public.transaction_sync_recovery_runs to authenticated;
grant select, insert on table public.transaction_sync_recovery_runs to service_role;
grant select on table public.transactions, public.transaction_sync_action_catalog,
  public.transaction_sync_command_receipts, public.transaction_events,
  public.transaction_activity_projections, public.transaction_rollups,
  public.transaction_subprocesses to service_role;
grant select, insert, update on table public.transaction_sync_projection_queue,
  public.transaction_refresh_signals to service_role;

create or replace function public.bridge_reconcile_transaction_sync_metadata_phase6(
  p_transaction_id uuid,
  p_apply boolean default false,
  p_reason text default ''
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_role text := coalesce(current_setting('request.jwt.claim.role', true), '');
  v_action_count integer := 0;
  v_lane_count integer := 0;
  v_rollup_exists boolean := false;
  v_receipt_count integer := 0;
  v_queue_repair_count integer := 0;
  v_latest_receipt public.transaction_sync_command_receipts%rowtype;
  v_signal public.transaction_refresh_signals%rowtype;
  v_receipt public.transaction_sync_command_receipts%rowtype;
  v_activity public.transaction_activity_projections%rowtype;
  v_event_exists boolean;
  v_signal_repair boolean := false;
  v_blockers jsonb := '[]'::jsonb;
  v_repairs jsonb := '[]'::jsonb;
  v_before jsonb;
  v_after jsonb;
  v_run_id uuid;
  v_rows integer := 0;
begin
  if v_role <> 'service_role' then
    raise exception 'Phase 6 recovery requires the service role.' using errcode = '42501';
  end if;
  if p_transaction_id is null then
    raise exception 'Transaction id is required.' using errcode = '22023';
  end if;
  if char_length(trim(coalesce(p_reason, ''))) not between 12 and 500 then
    raise exception 'A recovery reason between 12 and 500 characters is required.' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('transaction-sync-phase6:' || p_transaction_id::text, 0));

  if not exists (select 1 from public.transactions where id = p_transaction_id) then
    raise exception 'Transaction not found.' using errcode = 'P0002';
  end if;

  select count(*) into v_action_count from public.transaction_sync_action_catalog;
  select count(*) into v_lane_count from public.transaction_subprocesses where transaction_id = p_transaction_id;
  select exists(select 1 from public.transaction_rollups where transaction_id = p_transaction_id) into v_rollup_exists;
  select count(*) into v_receipt_count from public.transaction_sync_command_receipts where transaction_id = p_transaction_id;

  if v_action_count <> 29 then
    v_blockers := v_blockers || jsonb_build_array(jsonb_build_object('code', 'action_catalog_incomplete', 'actual', v_action_count, 'expected', 29));
  end if;
  if not v_rollup_exists then
    v_blockers := v_blockers || jsonb_build_array(jsonb_build_object('code', 'rollup_missing'));
  end if;
  if v_lane_count = 0 then
    v_blockers := v_blockers || jsonb_build_array(jsonb_build_object('code', 'lane_state_missing'));
  end if;
  if v_receipt_count = 0 then
    v_blockers := v_blockers || jsonb_build_array(jsonb_build_object('code', 'canonical_path_not_exercised'));
  end if;

  for v_receipt in
    select * from public.transaction_sync_command_receipts
    where transaction_id = p_transaction_id
    order by transaction_version desc nulls last, created_at desc
  loop
    if v_receipt.status <> 'projected' then
      v_blockers := v_blockers || jsonb_build_array(jsonb_build_object(
        'code', 'receipt_not_projected', 'receiptId', v_receipt.id, 'status', v_receipt.status
      ));
      continue;
    end if;
    if not (coalesce(v_receipt.outputs_json, '{}'::jsonb) ?& array[
      'transaction_event','lane_state','transaction_rollup','activity_projection','refresh_signal','audit_record'
    ])
      or nullif(v_receipt.outputs_json->>'transaction_event', '') is null
      or nullif(v_receipt.outputs_json->>'lane_state', '') is null
      or nullif(v_receipt.outputs_json->>'transaction_rollup', '') is null
      or nullif(v_receipt.outputs_json->>'activity_projection', '') is null
      or nullif(v_receipt.outputs_json->>'refresh_signal', '') is null
      or nullif(v_receipt.outputs_json->>'audit_record', '') is null then
      v_blockers := v_blockers || jsonb_build_array(jsonb_build_object(
        'code', 'receipt_outputs_incomplete', 'receiptId', v_receipt.id
      ));
      continue;
    end if;

    select exists(
      select 1 from public.transaction_events event
      where event.id = v_receipt.canonical_event_id and event.transaction_id = p_transaction_id
    ) into v_event_exists;
    select * into v_activity from public.transaction_activity_projections activity
      where activity.command_receipt_id = v_receipt.id
        and activity.transaction_id = p_transaction_id;

    if not v_event_exists then
      v_blockers := v_blockers || jsonb_build_array(jsonb_build_object(
        'code', 'canonical_event_missing', 'receiptId', v_receipt.id
      ));
    elsif v_activity.id is null then
      v_blockers := v_blockers || jsonb_build_array(jsonb_build_object(
        'code', 'activity_projection_missing', 'receiptId', v_receipt.id
      ));
    elsif v_receipt.transaction_version is null
       or v_activity.canonical_event_id <> v_receipt.canonical_event_id
       or v_receipt.outputs_json->>'transaction_event' <> v_receipt.canonical_event_id::text
       or v_receipt.outputs_json->>'activity_projection' <> v_activity.id::text
       or v_receipt.outputs_json->>'audit_record' <> v_receipt.id::text
       or v_receipt.outputs_json->>'refresh_signal' <> v_receipt.transaction_version::text then
      v_blockers := v_blockers || jsonb_build_array(jsonb_build_object(
        'code', 'receipt_evidence_mismatch', 'receiptId', v_receipt.id
      ));
    end if;
  end loop;

  select * into v_latest_receipt from public.transaction_sync_command_receipts
    where transaction_id = p_transaction_id and status = 'projected'
    order by transaction_version desc nulls last, created_at desc
    limit 1;
  select * into v_signal from public.transaction_refresh_signals where transaction_id = p_transaction_id;

  if v_signal.version is not null and v_latest_receipt.transaction_version is not null
     and v_signal.version > v_latest_receipt.transaction_version then
    v_blockers := v_blockers || jsonb_build_array(jsonb_build_object(
      'code', 'refresh_version_ahead', 'signalVersion', v_signal.version,
      'latestReceiptVersion', v_latest_receipt.transaction_version
    ));
  elsif v_latest_receipt.id is not null and (
    v_signal.transaction_id is null
    or v_signal.version < v_latest_receipt.transaction_version
    or v_signal.command_receipt_id is distinct from v_latest_receipt.id
    or v_signal.canonical_event_id is distinct from v_latest_receipt.canonical_event_id
  ) then
    v_signal_repair := true;
    v_repairs := v_repairs || jsonb_build_array(jsonb_build_object(
      'type', 'refresh_signal', 'version', v_latest_receipt.transaction_version,
      'receiptId', v_latest_receipt.id
    ));
  end if;

  select count(*) into v_queue_repair_count
  from public.transaction_sync_command_receipts receipt
  join public.transaction_activity_projections activity on activity.command_receipt_id = receipt.id
  left join public.transaction_sync_projection_queue queue on queue.command_receipt_id = receipt.id
  where receipt.transaction_id = p_transaction_id
    and receipt.status = 'projected'
    and (queue.id is null or queue.status <> 'completed');
  if v_queue_repair_count > 0 then
    v_repairs := v_repairs || jsonb_build_array(jsonb_build_object(
      'type', 'projection_queue_receipts', 'count', v_queue_repair_count
    ));
  end if;

  v_before := jsonb_build_object(
    'receiptCount', v_receipt_count,
    'laneCount', v_lane_count,
    'actionCatalogCount', v_action_count,
    'refreshVersion', v_signal.version,
    'refreshReceiptId', v_signal.command_receipt_id,
    'queueRepairCount', v_queue_repair_count
  );

  if jsonb_array_length(v_blockers) > 0 then
    return jsonb_build_object(
      'transactionId', p_transaction_id,
      'mode', case when p_apply then 'apply' else 'plan' end,
      'status', 'blocked',
      'blockers', v_blockers,
      'repairs', v_repairs,
      'before', v_before
    );
  end if;

  if not p_apply then
    return jsonb_build_object(
      'transactionId', p_transaction_id,
      'mode', 'plan',
      'status', case when jsonb_array_length(v_repairs) = 0 then 'no_op' else 'repairable' end,
      'blockers', '[]'::jsonb,
      'repairs', v_repairs,
      'before', v_before
    );
  end if;

  insert into public.transaction_sync_projection_queue (
    transaction_id, command_receipt_id, projection_type, status, attempt_count,
    last_error, available_at, completed_at, updated_at
  )
  select
    receipt.transaction_id, receipt.id, 'activity_and_refresh', 'completed',
    coalesce(queue.attempt_count, 0) + 1, null, now(), now(), now()
  from public.transaction_sync_command_receipts receipt
  join public.transaction_activity_projections activity on activity.command_receipt_id = receipt.id
  left join public.transaction_sync_projection_queue queue on queue.command_receipt_id = receipt.id
  where receipt.transaction_id = p_transaction_id
    and receipt.status = 'projected'
    and (queue.id is null or queue.status <> 'completed')
  on conflict (command_receipt_id) do update set
    status = 'completed',
    attempt_count = public.transaction_sync_projection_queue.attempt_count + 1,
    last_error = null,
    completed_at = now(),
    updated_at = now()
  where public.transaction_sync_projection_queue.status <> 'completed';
  get diagnostics v_rows = row_count;

  if v_signal_repair then
    insert into public.transaction_refresh_signals (
      transaction_id, version, command_receipt_id, canonical_event_id, changed_at
    ) values (
      p_transaction_id, v_latest_receipt.transaction_version, v_latest_receipt.id,
      v_latest_receipt.canonical_event_id, now()
    )
    on conflict (transaction_id) do update set
      version = excluded.version,
      command_receipt_id = excluded.command_receipt_id,
      canonical_event_id = excluded.canonical_event_id,
      changed_at = excluded.changed_at
    where public.transaction_refresh_signals.version <= excluded.version;
  end if;

  select * into v_signal from public.transaction_refresh_signals where transaction_id = p_transaction_id;
  v_after := jsonb_build_object(
    'refreshVersion', v_signal.version,
    'refreshReceiptId', v_signal.command_receipt_id,
    'queueRowsChanged', v_rows
  );

  insert into public.transaction_sync_recovery_runs (
    transaction_id, requested_reason, status, repairs_json, before_json, after_json
  ) values (
    p_transaction_id, trim(p_reason),
    case when jsonb_array_length(v_repairs) = 0 then 'no_op' else 'repaired' end,
    v_repairs, v_before, v_after
  ) returning id into v_run_id;

  return jsonb_build_object(
    'transactionId', p_transaction_id,
    'mode', 'apply',
    'status', case when jsonb_array_length(v_repairs) = 0 then 'no_op' else 'repaired' end,
    'recoveryRunId', v_run_id,
    'blockers', '[]'::jsonb,
    'repairs', v_repairs,
    'before', v_before,
    'after', v_after
  );
end;
$$;

revoke all on function public.bridge_reconcile_transaction_sync_metadata_phase6(uuid,boolean,text)
  from public, anon, authenticated, service_role;
grant execute on function public.bridge_reconcile_transaction_sync_metadata_phase6(uuid,boolean,text)
  to service_role;

notify pgrst, 'reload schema';
commit;
