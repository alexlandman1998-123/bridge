begin;

-- Shared/client-safe attorney updates used to write a lane note and a raw event
-- separately. That left the shared journey and activity projections stale until
-- a later fetch. Publish the update and its canonical transaction command in
-- one transaction instead.
insert into public.transaction_sync_action_catalog (
  action_key, owner_role, canonical_event_type, affected_lane, source_table,
  default_visibility, client_safe_projection_required
) values
  ('TRANSFER_ATTORNEY_UPDATE_PUBLISHED', 'transfer_attorney', 'TransferAttorneyUpdatePublished', 'transfer', 'transaction_attorney_lane_updates', 'client_visible', true),
  ('BOND_ATTORNEY_UPDATE_PUBLISHED', 'bond_attorney', 'BondAttorneyUpdatePublished', 'bond_registration', 'transaction_attorney_lane_updates', 'client_visible', true),
  ('CANCELLATION_ATTORNEY_UPDATE_PUBLISHED', 'cancellation_attorney', 'CancellationAttorneyUpdatePublished', 'seller_bond_cancellation', 'transaction_attorney_lane_updates', 'client_visible', true)
on conflict (action_key) do update set
  owner_role = excluded.owner_role,
  canonical_event_type = excluded.canonical_event_type,
  affected_lane = excluded.affected_lane,
  source_table = excluded.source_table,
  default_visibility = excluded.default_visibility,
  client_safe_projection_required = excluded.client_safe_projection_required,
  updated_at = now();

-- Forward command reconciliation. The catalogue is maintained by the separate
-- reconcile_attorney_journey_catalogue migration; do not replay the historical
-- insert that omitted NOT NULL phase columns.
create or replace function public.bridge_add_attorney_lane_update_and_sync_v1(
  p_transaction_id uuid,
  p_lane_key text,
  p_update_type text,
  p_visibility text,
  p_message text,
  p_client_recipients jsonb,
  p_metadata jsonb,
  p_idempotency_key text,
  p_professional_title text,
  p_professional_description text,
  p_client_title text default null,
  p_client_description text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_lane public.transaction_subprocesses%rowtype;
  v_update public.transaction_attorney_lane_updates%rowtype;
  v_existing public.transaction_sync_command_receipts%rowtype;
  v_lane_key text := lower(trim(coalesce(p_lane_key, '')));
  v_visibility text := lower(trim(coalesce(p_visibility, '')));
  v_action_key text;
  v_role text;
  v_audience jsonb;
  v_sync jsonb;
begin
  if p_transaction_id is null then
    raise exception 'Transaction id is required.' using errcode = '22023';
  end if;
  if v_lane_key not in ('transfer', 'bond', 'cancellation') then
    raise exception 'Invalid attorney lane.' using errcode = '22023';
  end if;
  if v_visibility not in ('professional_shared', 'client_visible') then
    raise exception 'Only shared or client-visible updates use this command.' using errcode = '22023';
  end if;
  if nullif(trim(coalesce(p_update_type, '')), '') is null
     or nullif(trim(coalesce(p_message, '')), '') is null then
    raise exception 'An update type and message are required.' using errcode = '22023';
  end if;
  if char_length(trim(coalesce(p_idempotency_key, ''))) not between 16 and 160
     or trim(p_idempotency_key) !~ '^[A-Za-z0-9._:-]+$' then
    raise exception 'A stable attorney update idempotency key is required.' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_client_recipients, '[]'::jsonb)) <> 'array' then
    raise exception 'Client recipients must be an array.' using errcode = '22023';
  end if;
  if v_visibility = 'client_visible' and not (coalesce(p_client_recipients, '[]'::jsonb) ?| array['buyer', 'seller']) then
    raise exception 'Choose at least one client recipient before publishing an update.' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_transaction_id::text || ':' || trim(p_idempotency_key), 0)
  );
  select * into v_existing
  from public.transaction_sync_command_receipts receipt
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

  select * into v_lane
  from public.transaction_subprocesses lane
  where lane.transaction_id = p_transaction_id
    and lane.process_type = v_lane_key
  limit 1;
  if v_lane.id is null then
    raise exception 'Attorney lane not found.' using errcode = 'P0001';
  end if;

  v_action_key := case v_lane_key
    when 'bond' then 'BOND_ATTORNEY_UPDATE_PUBLISHED'
    when 'cancellation' then 'CANCELLATION_ATTORNEY_UPDATE_PUBLISHED'
    else 'TRANSFER_ATTORNEY_UPDATE_PUBLISHED'
  end;
  v_role := case v_lane_key
    when 'bond' then 'bond_attorney'
    when 'cancellation' then 'cancellation_attorney'
    else 'transfer_attorney'
  end;
  v_audience := case
    when v_visibility = 'client_visible' then
      coalesce(p_client_recipients, '[]'::jsonb) ||
      case v_lane_key
        when 'cancellation' then '["agent","bond_originator","transfer_attorney","bond_attorney","cancellation_attorney"]'::jsonb
        else '["agent","bond_originator","transfer_attorney","bond_attorney","cancellation_attorney"]'::jsonb
      end
    when v_lane_key = 'cancellation' then
      '["seller","agent","bond_originator","transfer_attorney","bond_attorney","cancellation_attorney"]'::jsonb
    else '["buyer","seller","agent","bond_originator","transfer_attorney","bond_attorney","cancellation_attorney"]'::jsonb
  end;

  insert into public.transaction_attorney_lane_updates (
    transaction_id, subprocess_id, lane_key, attorney_role, update_type,
    visibility, message, created_by, client_recipients, metadata
  ) values (
    p_transaction_id, v_lane.id, v_lane_key, v_role, trim(p_update_type),
    v_visibility, trim(p_message), auth.uid(), coalesce(p_client_recipients, '[]'::jsonb),
    jsonb_strip_nulls(coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object('sharedJourneyAtomic', true))
  ) returning * into v_update;

  v_sync := public.bridge_commit_transaction_sync_command_phase2(
    p_transaction_id,
    v_action_key,
    trim(p_idempotency_key),
    'transaction_attorney_lane_updates',
    v_update.id::text,
    v_visibility,
    v_audience,
    trim(p_professional_title),
    trim(p_professional_description),
    nullif(trim(coalesce(p_client_title, '')), ''),
    nullif(trim(coalesce(p_client_description, '')), ''),
    jsonb_build_object(
      'laneKey', v_lane_key,
      'attorneyRole', v_role,
      'updateType', trim(p_update_type),
      'clientRecipients', coalesce(p_client_recipients, '[]'::jsonb)
    )
  );

  return jsonb_build_object('duplicate', false, 'updateId', v_update.id, 'transactionId', p_transaction_id, 'sync', v_sync);
end;
$$;

revoke all on function public.bridge_add_attorney_lane_update_and_sync_v1(
  uuid,text,text,text,text,jsonb,jsonb,text,text,text,text,text
) from public, anon, authenticated, service_role;
grant execute on function public.bridge_add_attorney_lane_update_and_sync_v1(
  uuid,text,text,text,text,jsonb,jsonb,text,text,text,text,text
) to authenticated, service_role;

notify pgrst, 'reload schema';
commit;
