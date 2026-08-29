begin;

create or replace function public.bridge_record_bond_originator_progress_and_sync_phase3(
  p_export_package_id uuid,
  p_event_type text,
  p_status text,
  p_title text,
  p_summary text,
  p_idempotency_key text,
  p_internal_note text default null,
  p_visible_to_buyer boolean default true,
  p_visible_to_agent boolean default true,
  p_visible_to_originator boolean default true,
  p_progress_category text default 'operational_update'
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_event_id uuid;
  v_event public.transaction_bond_originator_progress_events%rowtype;
  v_sync jsonb;
begin
  if char_length(trim(coalesce(p_idempotency_key, ''))) not between 16 and 160
     or trim(p_idempotency_key) !~ '^[A-Za-z0-9._:-]+$' then
    raise exception 'A stable originator progress idempotency key is required.' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_export_package_id::text || ':' || trim(p_idempotency_key), 0)
  );

  v_event_id := public.bridge_record_bond_originator_workspace_progress_update(
    p_export_package_id,
    p_event_type,
    p_status,
    p_title,
    p_summary,
    p_internal_note,
    p_visible_to_buyer,
    p_visible_to_agent,
    p_visible_to_originator,
    p_progress_category,
    auth.uid(),
    p_idempotency_key
  );

  select * into v_event from public.transaction_bond_originator_progress_events where id = v_event_id;
  if v_event.id is null then raise exception 'Originator progress event was not persisted.' using errcode = 'P0001'; end if;

  v_sync := public.bridge_commit_transaction_sync_command_phase2(
    v_event.transaction_id,
    'ORIGINATOR_PROGRESS_UPDATED',
    trim(p_idempotency_key),
    'transaction_bond_originator_progress_events',
    v_event.id::text,
    'professional_shared',
    '["buyer","seller","agent","bond_originator","transfer_attorney","bond_attorney"]'::jsonb,
    trim(p_title),
    trim(p_summary),
    null,
    null,
    jsonb_build_object(
      'progressEventType', v_event.event_type,
      'status', v_event.status,
      'progressCategory', v_event.progress_category,
      'bankWorkflowUnchanged', true,
      'offerWorkflowUnchanged', true,
      'grantWorkflowUnchanged', true
    )
  );

  return jsonb_build_object('progressEventId', v_event.id, 'transactionId', v_event.transaction_id, 'sync', v_sync);
end;
$$;

create or replace function public.bridge_add_attorney_comment_and_sync_phase3(
  p_transaction_id uuid,
  p_lane_key text,
  p_message text,
  p_idempotency_key text
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

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_transaction_id::text || ':' || trim(p_idempotency_key), 0)
  );

  select * into v_existing from public.transaction_sync_command_receipts receipt
  where receipt.transaction_id = p_transaction_id
    and receipt.idempotency_key = trim(p_idempotency_key);
  if v_existing.id is not null then
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
    jsonb_build_object('updateTypeLabel','Internal note','updateCategory','note','phase3Atomic',true)
  ) returning * into v_update;

  v_sync := public.bridge_commit_transaction_sync_command_phase2(
    p_transaction_id,
    v_action_key,
    trim(p_idempotency_key),
    'transaction_attorney_lane_updates',
    v_update.id::text,
    'internal',
    case v_lane.process_type
      when 'cancellation' then '["seller","agent","bond_originator","transfer_attorney","bond_attorney","cancellation_attorney"]'::jsonb
      else '["buyer","seller","agent","bond_originator","transfer_attorney","bond_attorney","cancellation_attorney"]'::jsonb
    end,
    v_label || ' note added',
    'An internal legal workflow note was added.',
    null,
    null,
    jsonb_build_object('laneKey', v_lane.process_type, 'updateType', 'internal_note')
  );

  return jsonb_build_object('updateId', v_update.id, 'transactionId', p_transaction_id, 'sync', v_sync);
end;
$$;

revoke all on function public.bridge_record_bond_originator_progress_and_sync_phase3(
  uuid,text,text,text,text,text,text,boolean,boolean,boolean,text
) from public, anon, authenticated, service_role;
grant execute on function public.bridge_record_bond_originator_progress_and_sync_phase3(
  uuid,text,text,text,text,text,text,boolean,boolean,boolean,text
) to authenticated, service_role;

revoke all on function public.bridge_add_attorney_comment_and_sync_phase3(uuid,text,text,text)
  from public, anon, authenticated, service_role;
grant execute on function public.bridge_add_attorney_comment_and_sync_phase3(uuid,text,text,text)
  to authenticated, service_role;

notify pgrst, 'reload schema';
commit;
