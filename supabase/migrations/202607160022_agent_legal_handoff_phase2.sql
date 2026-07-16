begin;

create or replace function public.bridge_prepare_agent_legal_handoff(p_transaction_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_transaction public.transactions%rowtype;
  v_profile jsonb := '{}'::jsonb;
  v_required_lanes text[] := array['transfer']::text[];
  v_required_roles text[] := array['transfer_attorney']::text[];
  v_assigned_roles text[] := array[]::text[];
  v_missing_roles text[] := array[]::text[];
  v_lane text;
  v_role text;
  v_first_stage text;
  v_created_count integer := 0;
begin
  if p_transaction_id is null then
    raise exception 'Transaction id is required.';
  end if;

  select * into v_transaction
  from public.transactions
  where id = p_transaction_id;

  if v_transaction.id is null then
    raise exception 'Transaction not found or access denied.';
  end if;

  v_profile := coalesce(v_transaction.routing_profile_json, '{}'::jsonb);

  if lower(coalesce(v_profile->>'financeType', v_transaction.finance_type, '')) in ('bond', 'hybrid', 'combination')
     or coalesce((v_profile->>'requiresBondAttorney')::boolean, false) then
    v_required_lanes := array_append(v_required_lanes, 'bond');
    v_required_roles := array_append(v_required_roles, 'bond_attorney');
  end if;

  if coalesce(v_transaction.cancellation_required, false)
     or coalesce(v_transaction.seller_has_existing_bond, false)
     or coalesce(v_transaction.existing_bond, false)
     or coalesce((v_profile->>'requiresCancellationAttorney')::boolean, false)
     or coalesce((v_profile->>'sellerHasExistingBond')::boolean, false) then
    v_required_lanes := array_append(v_required_lanes, 'cancellation');
    v_required_roles := array_append(v_required_roles, 'cancellation_attorney');
  end if;

  foreach v_lane in array v_required_lanes loop
    v_role := case v_lane
      when 'bond' then 'bond_attorney'
      when 'cancellation' then 'cancellation_attorney'
      else 'transfer_attorney'
    end;
    v_first_stage := case v_lane
      when 'bond' then 'instruction_received'
      when 'cancellation' then 'instruction_received'
      else 'instruction_received'
    end;

    insert into public.transaction_subprocesses (
      transaction_id,
      process_type,
      owner_type,
      status,
      attorney_role,
      current_stage,
      lane_status,
      lane_metadata
    ) values (
      p_transaction_id,
      v_lane,
      'attorney',
      'not_started',
      v_role,
      v_first_stage,
      'not_started',
      jsonb_build_object('source', 'agent_legal_handoff_phase2', 'transactionId', p_transaction_id)
    )
    on conflict (transaction_id, process_type) do nothing;

    get diagnostics v_created_count = row_count;
    if v_created_count > 0 then
      insert into public.transaction_events (
        transaction_id,
        event_type,
        event_data,
        created_by,
        created_by_role,
        visibility_scope
      ) values (
        p_transaction_id,
        'AttorneyLaneCreated',
        jsonb_build_object('laneKey', v_lane, 'attorneyRole', v_role, 'source', 'agent_legal_handoff_phase2'),
        auth.uid(),
        'agent',
        'internal'
      );
    end if;
  end loop;

  select coalesce(array_agg(distinct attorney_role), array[]::text[])
  into v_assigned_roles
  from public.transaction_attorney_assignments
  where transaction_id = p_transaction_id
    and coalesce(assignment_status, status, 'active') not in ('removed', 'declined', 'cancelled');

  select coalesce(array_agg(role_name), array[]::text[])
  into v_missing_roles
  from unnest(v_required_roles) role_name
  where not (role_name = any(v_assigned_roles));

  return jsonb_build_object(
    'prepared', true,
    'transactionId', p_transaction_id,
    'requiredLaneKeys', to_jsonb(v_required_lanes),
    'assignedAttorneyRoles', to_jsonb(v_assigned_roles),
    'missingAttorneyRoles', to_jsonb(v_missing_roles),
    'laneCount', cardinality(v_required_lanes)
  );
end;
$$;

grant execute on function public.bridge_prepare_agent_legal_handoff(uuid) to authenticated;

comment on function public.bridge_prepare_agent_legal_handoff(uuid) is
  'Idempotently materialises the transfer, bond, and cancellation lanes required by one canonical transaction and reports outstanding attorney assignments.';

commit;
