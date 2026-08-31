begin;

-- Production migration ledger version: 20260831151112.

-- Quarantine is not a commercial close-out. The seed quarantine RPC archives
-- a transaction only after creating a service-only processing batch and
-- binding the row to that batch. Permit that narrow atomic transition while
-- retaining commission enforcement for every normal archived/completed state.
create or replace function public.bridge_enforce_transaction_commission_closeout()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_active_count integer := 0;
  v_unresolved_count integer := 0;
  v_unresolved_amount numeric(14,2) := 0;
begin
  if new.quarantine_batch_id is not null
     and new.quarantined_at is not null
     and new.is_active is false
     and new.is_demo_data is true
     and exists (
       select 1
       from public.transaction_quarantine_batches batch
       where batch.id = new.quarantine_batch_id
         and batch.status = 'processing'
     ) then
    return new;
  end if;

  if not public.bridge_is_transaction_closeout_state(new.stage, new.current_main_stage, new.lifecycle_state) then
    return new;
  end if;

  if public.bridge_is_transaction_closeout_state(old.stage, old.current_main_stage, old.lifecycle_state)
     and new.stage is not distinct from old.stage
     and new.current_main_stage is not distinct from old.current_main_stage
     and new.lifecycle_state is not distinct from old.lifecycle_state then
    return new;
  end if;

  if current_setting('bridge.commission_closeout_override_transaction_id', true) = new.id::text then
    return new;
  end if;

  select
    count(*) filter (where allocation.status <> 'cancelled')::integer,
    count(*) filter (where allocation.status not in ('paid', 'waived', 'cancelled'))::integer,
    coalesce(sum(coalesce(allocation.approved_amount, allocation.calculated_amount, allocation.fixed_amount, 0)) filter (
      where allocation.status not in ('paid', 'waived', 'cancelled')
    ), 0)::numeric(14,2)
    into v_active_count, v_unresolved_count, v_unresolved_amount
  from public.transaction_commission_allocations allocation
  where allocation.transaction_id = new.id;

  if coalesce(v_active_count, 0) = 0 then
    raise exception 'Transaction cannot be closed out until canonical commission allocations exist.'
      using errcode = 'P0001',
            detail = 'commission_allocations_missing';
  end if;

  if coalesce(v_unresolved_count, 0) > 0 then
    raise exception 'Transaction cannot be closed out while commission allocations remain unresolved.'
      using errcode = 'P0001',
            detail = jsonb_build_object(
              'code', 'commission_closeout_blocked',
              'transaction_id', new.id,
              'unresolved_allocation_count', v_unresolved_count,
              'unresolved_amount', v_unresolved_amount
            )::text;
  end if;

  return new;
end;
$$;

comment on function public.bridge_enforce_transaction_commission_closeout() is
  'Enforces commission settlement for commercial close-out. Allows only service-led seed quarantine rows bound to a processing quarantine batch.';

commit;
