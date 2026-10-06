begin;

-- Keep task comments internal and atomic without changing legacy lane notes.
create or replace function public.bridge_add_attorney_task_comment_and_sync_v1(
  p_transaction_id uuid,
  p_lane_key text,
  p_message text,
  p_idempotency_key text,
  p_task_key text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_lane public.transaction_subprocesses%rowtype;
  v_update public.transaction_attorney_lane_updates%rowtype;
  v_action_key text;
  v_role text;
  v_label text;
  v_sync jsonb;
  v_existing public.transaction_sync_command_receipts%rowtype;
begin
  if char_length(trim(coalesce(p_idempotency_key, ''))) not between 16 and 160
     or trim(p_idempotency_key) !~ '^[A-Za-z0-9._:-]+$' then
    raise exception 'A stable attorney comment idempotency key is required.' using errcode = '22023';
  end if;
  if nullif(trim(coalesce(p_message, '')), '') is null then
    raise exception 'Attorney comment text is required.' using errcode = '22023';
  end if;
  if lower(trim(coalesce(p_lane_key, ''))) not in ('transfer','bond','cancellation') then
    raise exception 'Invalid attorney lane.' using errcode = '22023';
  end if;

  v_role := lower(trim(p_lane_key)) || '_attorney';
  if not public.bridge_can_mutate_attorney_lane(p_transaction_id, v_role, 'internal_notes') then
    raise exception 'You do not have permission to add a task comment.' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.transaction_subprocess_steps step
    join public.transaction_subprocesses lane on lane.id = step.subprocess_id
    where lane.transaction_id = p_transaction_id and lane.process_type = lower(trim(p_lane_key))
      and step.step_key = p_task_key
  ) then
    raise exception 'The task does not belong to this matter and lane.' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_transaction_id::text || ':' || trim(p_idempotency_key), 0)
  );

  select * into v_existing from public.transaction_sync_command_receipts receipt
  where receipt.transaction_id = p_transaction_id
    and receipt.idempotency_key = trim(p_idempotency_key);
  if v_existing.id is not null then
    if not exists (
      select 1 from public.transaction_attorney_lane_updates saved
      where saved.id::text = v_existing.source_record_id
        and saved.transaction_id = p_transaction_id and saved.lane_key = lower(trim(p_lane_key))
        and saved.created_by = auth.uid() and saved.visibility = 'internal'
        and saved.message = trim(p_message)
        and saved.metadata->'workPacket'->>'stageKey' = p_task_key
    ) then
      raise exception 'This comment command was already used for different work.' using errcode = '22023';
    end if;
    return jsonb_build_object(
      'duplicate', true,
      'updateId', v_existing.source_record_id,
      'transactionId', p_transaction_id,
      'sync', jsonb_build_object(
        'receiptId', v_existing.id,
        'eventId', v_existing.canonical_event_id,
        'transactionVersion', v_existing.transaction_version,
        'status', v_existing.status,
        'outputs', v_existing.outputs_json
      )
    );
  end if;

  select * into v_lane from public.transaction_subprocesses lane
  where lane.transaction_id = p_transaction_id
    and lane.process_type = lower(trim(p_lane_key))
  limit 1;
  if v_lane.id is null then raise exception 'Attorney lane not found.' using errcode = 'P0001'; end if;

  v_action_key := case v_lane.process_type
    when 'bond' then 'BOND_ATTORNEY_COMMENT_ADDED'
    when 'cancellation' then 'CANCELLATION_ATTORNEY_COMMENT_ADDED'
    else 'TRANSFER_ATTORNEY_COMMENT_ADDED' end;
  v_role := case v_lane.process_type
    when 'bond' then 'bond_attorney'
    when 'cancellation' then 'cancellation_attorney'
    else 'transfer_attorney' end;
  v_label := case v_lane.process_type
    when 'bond' then 'Bond attorney'
    when 'cancellation' then 'Cancellation attorney'
    else 'Transfer attorney' end;

  insert into public.transaction_attorney_lane_updates (
    transaction_id, subprocess_id, lane_key, attorney_role, update_type,
    visibility, message, created_by, client_recipients, metadata
  ) values (
    p_transaction_id, v_lane.id, v_lane.process_type, v_role, 'internal_note',
    'internal', trim(p_message), auth.uid(), '[]'::jsonb,
    jsonb_build_object('updateTypeLabel','Internal note','updateCategory','note','phase3Atomic',true,
      'workPacket', jsonb_build_object('laneKey', v_lane.process_type, 'stageKey', p_task_key, 'commandType', 'add_note'))
  ) returning * into v_update;

  v_sync := public.bridge_commit_transaction_sync_command_phase2(
    p_transaction_id,
    v_action_key,
    trim(p_idempotency_key),
    'transaction_attorney_lane_updates',
    v_update.id::text,
    'internal',
    jsonb_build_array(v_role),
    v_label || ' note added',
    'An internal legal workflow note was added.',
    null,
    null,
    jsonb_build_object('laneKey', v_lane.process_type, 'stepKey', p_task_key, 'updateType', 'internal_note')
  );

  return jsonb_build_object('updateId', v_update.id, 'transactionId', p_transaction_id, 'sync', v_sync);
end;
$$;

revoke all on function public.bridge_add_attorney_task_comment_and_sync_v1(uuid,text,text,text,text) from public, anon;
grant execute on function public.bridge_add_attorney_task_comment_and_sync_v1(uuid,text,text,text,text) to authenticated;
notify pgrst, 'reload schema';
commit;
