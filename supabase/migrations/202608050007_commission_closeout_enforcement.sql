-- Phase 7 commission close-out enforcement.
--
-- A transaction should not be closed out while canonical commission
-- allocations are still missing, pending, due, approved-but-unpaid, or
-- disputed. This phase adds a finance readiness read model, a controlled
-- close-out RPC, and a direct-update trigger that keeps the transaction
-- lifecycle honest.

begin;

create table if not exists public.commission_closeout_events (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  action text not null,
  from_stage text,
  to_stage text,
  from_current_main_stage text,
  to_current_main_stage text,
  from_lifecycle_state text,
  to_lifecycle_state text,
  active_allocation_count integer not null default 0,
  unresolved_allocation_count integer not null default 0,
  unresolved_amount numeric(14,2) not null default 0,
  reason text,
  actor_id uuid references public.profiles(id) on delete set null,
  actor_email text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint commission_closeout_events_action_check
    check (action in ('blocked', 'closed_out', 'override_closed_out')),
  constraint commission_closeout_events_counts_check
    check (
      active_allocation_count >= 0
      and unresolved_allocation_count >= 0
      and unresolved_amount >= 0
    )
);

create index if not exists commission_closeout_events_transaction_idx
  on public.commission_closeout_events (transaction_id, created_at desc);

create index if not exists commission_closeout_events_org_action_idx
  on public.commission_closeout_events (organisation_id, action, created_at desc);

create or replace function public.bridge_is_transaction_closeout_state(
  p_stage text default null,
  p_current_main_stage text default null,
  p_lifecycle_state text default null
)
returns boolean
language sql
immutable
as $$
  select exists (
    select 1
    from unnest(array[p_stage, p_current_main_stage, p_lifecycle_state]) as state(raw_value)
    where lower(regexp_replace(trim(coalesce(state.raw_value, '')), '[^a-z0-9]+', '_', 'g')) in (
      'registered',
      'registration',
      'post_registration',
      'completed',
      'complete',
      'closed',
      'settled',
      'archived'
    )
  );
$$;

create or replace view public.transaction_commission_closeout_readiness_v1 as
select
  tx.id as transaction_id,
  tx.organisation_id,
  tx.transaction_reference,
  tx.property_address_line_1,
  tx.purchase_price,
  tx.sales_price,
  tx.stage,
  tx.current_main_stage,
  tx.lifecycle_state,
  public.bridge_is_transaction_closeout_state(tx.stage, tx.current_main_stage, tx.lifecycle_state) as is_closeout_state,
  count(allocation.id)::integer as allocation_count,
  count(allocation.id) filter (where allocation.status <> 'cancelled')::integer as active_allocation_count,
  count(allocation.id) filter (
    where allocation.status not in ('paid', 'waived', 'cancelled')
  )::integer as unresolved_allocation_count,
  count(allocation.id) filter (
    where allocation.status = 'pending_approval'
      or (allocation.requires_approval = true and allocation.status = 'projected')
  )::integer as pending_review_count,
  count(allocation.id) filter (where allocation.status = 'approved')::integer as approved_unpaid_count,
  count(allocation.id) filter (where allocation.status = 'due')::integer as due_count,
  count(allocation.id) filter (where allocation.status = 'disputed')::integer as disputed_count,
  count(allocation.id) filter (where allocation.status = 'paid')::integer as paid_count,
  count(allocation.id) filter (where allocation.status = 'waived')::integer as waived_count,
  coalesce(sum(coalesce(allocation.approved_amount, allocation.calculated_amount, allocation.fixed_amount, 0)) filter (
    where allocation.status not in ('paid', 'waived', 'cancelled')
  ), 0)::numeric(14,2) as unresolved_amount,
  coalesce(sum(coalesce(allocation.approved_amount, allocation.calculated_amount, allocation.fixed_amount, 0)) filter (
    where allocation.status in ('approved', 'due')
  ), 0)::numeric(14,2) as approved_unpaid_amount,
  (
    count(allocation.id) filter (where allocation.status <> 'cancelled') > 0
    and count(allocation.id) filter (where allocation.status not in ('paid', 'waived', 'cancelled')) = 0
  ) as closeout_ready,
  max(allocation.updated_at) as latest_allocation_updated_at
from public.transactions tx
left join public.transaction_commission_allocations allocation
  on allocation.transaction_id = tx.id
group by
  tx.id,
  tx.organisation_id,
  tx.transaction_reference,
  tx.property_address_line_1,
  tx.purchase_price,
  tx.sales_price,
  tx.stage,
  tx.current_main_stage,
  tx.lifecycle_state;

create or replace function public.bridge_validate_transaction_commission_closeout(
  p_transaction_id uuid,
  p_allow_override boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  tx_row public.transactions%rowtype;
  readiness_row public.transaction_commission_closeout_readiness_v1%rowtype;
  v_is_admin boolean := false;
begin
  if p_transaction_id is null then
    return jsonb_build_object('success', false, 'code', 'transaction_id_required');
  end if;

  select *
    into tx_row
  from public.transactions
  where id = p_transaction_id
  limit 1;

  if tx_row.id is null then
    return jsonb_build_object('success', false, 'code', 'transaction_not_found');
  end if;

  v_is_admin := public.bridge_is_org_admin(tx_row.organisation_id)
    or coalesce(auth.role(), '') = 'service_role';

  if not (
    v_is_admin
    or public.bridge_is_active_member(tx_row.organisation_id)
  ) then
    return jsonb_build_object('success', false, 'code', 'forbidden');
  end if;

  select *
    into readiness_row
  from public.transaction_commission_closeout_readiness_v1
  where transaction_id = p_transaction_id
  limit 1;

  if coalesce(readiness_row.active_allocation_count, 0) = 0 then
    return jsonb_build_object(
      'success', false,
      'code', 'commission_allocations_missing',
      'transaction_id', p_transaction_id,
      'organisation_id', tx_row.organisation_id,
      'active_allocation_count', 0,
      'unresolved_allocation_count', 0,
      'unresolved_amount', 0
    );
  end if;

  if coalesce(readiness_row.unresolved_allocation_count, 0) > 0 then
    if p_allow_override then
      if not v_is_admin then
        return jsonb_build_object(
          'success', false,
          'code', 'admin_required',
          'transaction_id', p_transaction_id,
          'active_allocation_count', readiness_row.active_allocation_count,
          'unresolved_allocation_count', readiness_row.unresolved_allocation_count,
          'unresolved_amount', readiness_row.unresolved_amount
        );
      end if;

      return jsonb_build_object(
        'success', true,
        'code', 'commission_closeout_override_allowed',
        'transaction_id', p_transaction_id,
        'organisation_id', tx_row.organisation_id,
        'active_allocation_count', readiness_row.active_allocation_count,
        'unresolved_allocation_count', readiness_row.unresolved_allocation_count,
        'unresolved_amount', readiness_row.unresolved_amount,
        'pending_review_count', readiness_row.pending_review_count,
        'approved_unpaid_count', readiness_row.approved_unpaid_count,
        'due_count', readiness_row.due_count,
        'disputed_count', readiness_row.disputed_count
      );
    end if;

    return jsonb_build_object(
      'success', false,
      'code', 'commission_closeout_blocked',
      'transaction_id', p_transaction_id,
      'organisation_id', tx_row.organisation_id,
      'active_allocation_count', readiness_row.active_allocation_count,
      'unresolved_allocation_count', readiness_row.unresolved_allocation_count,
      'unresolved_amount', readiness_row.unresolved_amount,
      'pending_review_count', readiness_row.pending_review_count,
      'approved_unpaid_count', readiness_row.approved_unpaid_count,
      'due_count', readiness_row.due_count,
      'disputed_count', readiness_row.disputed_count
    );
  end if;

  return jsonb_build_object(
    'success', true,
    'code', 'commission_closeout_ready',
    'transaction_id', p_transaction_id,
    'organisation_id', tx_row.organisation_id,
    'active_allocation_count', readiness_row.active_allocation_count,
    'unresolved_allocation_count', 0,
    'unresolved_amount', 0,
    'paid_count', readiness_row.paid_count,
    'waived_count', readiness_row.waived_count
  );
end;
$$;

create or replace function public.bridge_enforce_transaction_commission_closeout()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_active_count integer := 0;
  v_unresolved_count integer := 0;
  v_unresolved_amount numeric(14,2) := 0;
begin
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

drop trigger if exists trg_transactions_commission_closeout_enforcement on public.transactions;
create trigger trg_transactions_commission_closeout_enforcement
before update of stage, current_main_stage, lifecycle_state on public.transactions
for each row
execute function public.bridge_enforce_transaction_commission_closeout();

create or replace function public.bridge_closeout_transaction_with_commission_check(
  p_transaction_id uuid,
  p_stage text default 'Registered',
  p_lifecycle_state text default 'completed',
  p_override boolean default false,
  p_override_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  tx_row public.transactions%rowtype;
  updated_tx_row public.transactions%rowtype;
  v_validation jsonb;
  v_reason text := nullif(trim(coalesce(p_override_reason, '')), '');
  v_actor_id uuid := auth.uid();
  v_actor_email text := public.bridge_current_email();
  v_action text;
begin
  if p_transaction_id is null then
    return jsonb_build_object('success', false, 'code', 'transaction_id_required');
  end if;

  select *
    into tx_row
  from public.transactions
  where id = p_transaction_id
  for update;

  if tx_row.id is null then
    return jsonb_build_object('success', false, 'code', 'transaction_not_found');
  end if;

  if not public.bridge_is_transaction_closeout_state(p_stage, p_stage, p_lifecycle_state) then
    return jsonb_build_object('success', false, 'code', 'invalid_closeout_state');
  end if;

  if p_override and v_reason is null then
    return jsonb_build_object('success', false, 'code', 'override_reason_required');
  end if;

  v_validation := public.bridge_validate_transaction_commission_closeout(p_transaction_id, p_override);

  if coalesce((v_validation->>'success')::boolean, false) = false then
    insert into public.commission_closeout_events (
      transaction_id,
      organisation_id,
      action,
      from_stage,
      to_stage,
      from_current_main_stage,
      to_current_main_stage,
      from_lifecycle_state,
      to_lifecycle_state,
      active_allocation_count,
      unresolved_allocation_count,
      unresolved_amount,
      reason,
      actor_id,
      actor_email,
      metadata
    )
    values (
      tx_row.id,
      tx_row.organisation_id,
      'blocked',
      tx_row.stage,
      p_stage,
      tx_row.current_main_stage,
      p_stage,
      tx_row.lifecycle_state,
      p_lifecycle_state,
      coalesce((v_validation->>'active_allocation_count')::integer, 0),
      coalesce((v_validation->>'unresolved_allocation_count')::integer, 0),
      coalesce((v_validation->>'unresolved_amount')::numeric, 0),
      coalesce(v_reason, v_validation->>'code'),
      v_actor_id,
      v_actor_email,
      jsonb_build_object('validation', v_validation)
    );

    return v_validation;
  end if;

  v_action := case
    when p_override and coalesce((v_validation->>'unresolved_allocation_count')::integer, 0) > 0 then 'override_closed_out'
    else 'closed_out'
  end;

  if v_action = 'override_closed_out' then
    perform set_config('bridge.commission_closeout_override_transaction_id', p_transaction_id::text, true);
  end if;

  update public.transactions
    set stage = p_stage,
        current_main_stage = p_stage,
        lifecycle_state = p_lifecycle_state,
        updated_at = now()
  where id = p_transaction_id
  returning * into updated_tx_row;

  insert into public.commission_closeout_events (
    transaction_id,
    organisation_id,
    action,
    from_stage,
    to_stage,
    from_current_main_stage,
    to_current_main_stage,
    from_lifecycle_state,
    to_lifecycle_state,
    active_allocation_count,
    unresolved_allocation_count,
    unresolved_amount,
    reason,
    actor_id,
    actor_email,
    metadata
  )
  values (
    updated_tx_row.id,
    updated_tx_row.organisation_id,
    v_action,
    tx_row.stage,
    updated_tx_row.stage,
    tx_row.current_main_stage,
    updated_tx_row.current_main_stage,
    tx_row.lifecycle_state,
    updated_tx_row.lifecycle_state,
    coalesce((v_validation->>'active_allocation_count')::integer, 0),
    coalesce((v_validation->>'unresolved_allocation_count')::integer, 0),
    coalesce((v_validation->>'unresolved_amount')::numeric, 0),
    v_reason,
    v_actor_id,
    v_actor_email,
    jsonb_build_object(
      'validation', v_validation,
      'override', p_override,
      'requested_stage', p_stage,
      'requested_lifecycle_state', p_lifecycle_state
    )
  );

  return jsonb_build_object(
    'success', true,
    'code', v_action,
    'transaction_id', updated_tx_row.id,
    'organisation_id', updated_tx_row.organisation_id,
    'stage', updated_tx_row.stage,
    'current_main_stage', updated_tx_row.current_main_stage,
    'lifecycle_state', updated_tx_row.lifecycle_state,
    'validation', v_validation
  );
end;
$$;

alter table public.commission_closeout_events enable row level security;

drop policy if exists commission_closeout_events_member_select on public.commission_closeout_events;
create policy commission_closeout_events_member_select on public.commission_closeout_events
for select to authenticated
using (public.bridge_is_active_member(organisation_id));

drop policy if exists commission_closeout_events_admin_insert on public.commission_closeout_events;
create policy commission_closeout_events_admin_insert on public.commission_closeout_events
for insert to authenticated
with check (public.bridge_is_org_admin(organisation_id));

grant select, insert on table public.commission_closeout_events to authenticated;
grant select on public.transaction_commission_closeout_readiness_v1 to authenticated;
grant execute on function public.bridge_is_transaction_closeout_state(text, text, text) to authenticated;
grant execute on function public.bridge_validate_transaction_commission_closeout(uuid, boolean) to authenticated;
grant execute on function public.bridge_closeout_transaction_with_commission_check(uuid, text, text, boolean, text) to authenticated;

commit;
