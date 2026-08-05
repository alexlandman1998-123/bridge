-- Phase 6 commission review and approval.
--
-- The canonical allocation ledger now needs a controlled finance lifecycle:
-- review, approval, due, paid, waived, and disputed actions with an audit
-- trail. This phase keeps transaction_commission_allocations as the source of
-- truth and adds review RPCs/read models around it.

begin;

create table if not exists public.commission_allocation_review_events (
  id uuid primary key default gen_random_uuid(),
  allocation_id uuid not null references public.transaction_commission_allocations(id) on delete cascade,
  transaction_id uuid references public.transactions(id) on delete cascade,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  source_referral_id uuid references public.lead_referrals(id) on delete set null,
  action text not null,
  from_status text,
  to_status text not null,
  previous_approved_amount numeric(14,2),
  approved_amount numeric(14,2),
  calculated_amount_snapshot numeric(14,2),
  reason text,
  payment_reference text,
  actor_id uuid references public.profiles(id) on delete set null,
  actor_email text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint commission_allocation_review_events_action_check
    check (action in (
      'submitted_for_review',
      'approved',
      'marked_due',
      'marked_paid',
      'waived',
      'disputed',
      'reopened',
      'adjusted'
    )),
  constraint commission_allocation_review_events_status_check
    check (to_status in (
      'projected',
      'pending_approval',
      'approved',
      'due',
      'paid',
      'waived',
      'disputed',
      'cancelled'
    )),
  constraint commission_allocation_review_events_amount_check
    check (
      (previous_approved_amount is null or previous_approved_amount >= 0)
      and (approved_amount is null or approved_amount >= 0)
      and (calculated_amount_snapshot is null or calculated_amount_snapshot >= 0)
    )
);

create index if not exists commission_allocation_review_events_allocation_idx
  on public.commission_allocation_review_events (allocation_id, created_at desc);

create index if not exists commission_allocation_review_events_org_action_idx
  on public.commission_allocation_review_events (organisation_id, action, created_at desc);

create index if not exists commission_allocation_review_events_transaction_idx
  on public.commission_allocation_review_events (transaction_id, created_at desc)
  where transaction_id is not null;

create index if not exists transaction_commission_allocations_review_queue_idx
  on public.transaction_commission_allocations (
    organisation_id,
    requires_approval,
    status,
    updated_at desc
  )
  where status in ('projected', 'pending_approval', 'approved', 'due', 'disputed');

create or replace function public.bridge_sync_commission_allocation_review_sources(
  p_allocation_id uuid,
  p_actor_id uuid default auth.uid()
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  allocation_row public.transaction_commission_allocations%rowtype;
  v_referral_status text;
  v_referral_lifecycle_status text;
begin
  select *
    into allocation_row
  from public.transaction_commission_allocations
  where id = p_allocation_id
  limit 1;

  if allocation_row.id is null then
    return jsonb_build_object('success', false, 'code', 'allocation_not_found');
  end if;

  if allocation_row.source_referral_id is not null then
    v_referral_status := case allocation_row.status
      when 'paid' then 'paid'
      when 'due' then 'due'
      when 'waived' then 'waived'
      when 'disputed' then 'disputed'
      when 'approved' then 'pending'
      when 'pending_approval' then 'pending'
      else null
    end;
    v_referral_lifecycle_status := case allocation_row.status
      when 'paid' then 'paid'
      when 'due' then 'commission_due'
      else null
    end;

    update public.lead_referrals
      set referral_commission_amount = coalesce(referral_commission_amount, allocation_row.approved_amount, allocation_row.calculated_amount),
          commission_status = coalesce(v_referral_status, commission_status),
          commission_due_at = case when allocation_row.status = 'due' then coalesce(commission_due_at, allocation_row.due_at, now()) else commission_due_at end,
          commission_paid_at = case when allocation_row.status = 'paid' then coalesce(commission_paid_at, allocation_row.paid_at, now()) else commission_paid_at end,
          commission_payment_reference = case when allocation_row.status = 'paid' then coalesce(allocation_row.payment_reference, commission_payment_reference) else commission_payment_reference end,
          status = coalesce(v_referral_lifecycle_status, status),
          updated_at = now()
    where id = allocation_row.source_referral_id;
  end if;

  update public.transaction_commissions commission
    set status = case
          when exists (
            select 1
            from public.transaction_commission_allocations allocation
            where allocation.transaction_id = allocation_row.transaction_id
              and allocation.status = 'disputed'
          ) then 'disputed'
          when exists (
            select 1
            from public.transaction_commission_allocations allocation
            where allocation.transaction_id = allocation_row.transaction_id
              and allocation.status = 'paid'
          ) and not exists (
            select 1
            from public.transaction_commission_allocations allocation
            where allocation.transaction_id = allocation_row.transaction_id
              and allocation.status not in ('paid', 'waived', 'cancelled')
          ) then 'paid'
          when exists (
            select 1
            from public.transaction_commission_allocations allocation
            where allocation.transaction_id = allocation_row.transaction_id
              and allocation.status = 'due'
          ) then 'due'
          when exists (
            select 1
            from public.transaction_commission_allocations allocation
            where allocation.transaction_id = allocation_row.transaction_id
              and allocation.status = 'approved'
          ) then 'approved'
          else commission.status
        end,
        updated_at = now()
  where commission.transaction_id = allocation_row.transaction_id;

  return jsonb_build_object(
    'success', true,
    'code', 'synced',
    'allocation_id', allocation_row.id,
    'transaction_id', allocation_row.transaction_id,
    'source_referral_id', allocation_row.source_referral_id
  );
end;
$$;

create or replace function public.bridge_review_commission_allocation(
  p_allocation_id uuid,
  p_action text,
  p_approved_amount numeric default null,
  p_reason text default null,
  p_payment_reference text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  allocation_row public.transaction_commission_allocations%rowtype;
  updated_row public.transaction_commission_allocations%rowtype;
  v_action text := lower(trim(coalesce(p_action, '')));
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_payment_reference text := nullif(trim(coalesce(p_payment_reference, '')), '');
  v_actor_id uuid := auth.uid();
  v_actor_email text := public.bridge_current_email();
  v_approved_amount numeric(14,2);
  v_to_status text;
  v_requires_admin boolean := true;
begin
  if p_allocation_id is null then
    return jsonb_build_object('success', false, 'code', 'allocation_id_required');
  end if;

  if v_action not in ('submit', 'submit_for_review', 'approve', 'mark_due', 'due', 'mark_paid', 'paid', 'waive', 'dispute', 'reopen') then
    return jsonb_build_object('success', false, 'code', 'invalid_action');
  end if;

  select *
    into allocation_row
  from public.transaction_commission_allocations
  where id = p_allocation_id
  for update;

  if allocation_row.id is null then
    return jsonb_build_object('success', false, 'code', 'allocation_not_found');
  end if;

  if allocation_row.status = 'cancelled' then
    return jsonb_build_object('success', false, 'code', 'allocation_cancelled');
  end if;

  if allocation_row.status in ('paid', 'waived') and v_action not in ('dispute', 'reopen') then
    return jsonb_build_object('success', false, 'code', 'allocation_locked');
  end if;

  v_requires_admin := v_action not in ('dispute');

  if v_requires_admin and not (
    public.bridge_is_org_admin(allocation_row.organisation_id)
    or coalesce(auth.role(), '') = 'service_role'
  ) then
    return jsonb_build_object('success', false, 'code', 'admin_required');
  end if;

  if not v_requires_admin and not (
    public.bridge_is_org_admin(allocation_row.organisation_id)
    or public.bridge_is_active_member(allocation_row.organisation_id)
    or allocation_row.participant_user_id = v_actor_id
    or lower(coalesce(allocation_row.participant_email, '')) = lower(coalesce(v_actor_email, ''))
    or coalesce(auth.role(), '') = 'service_role'
  ) then
    return jsonb_build_object('success', false, 'code', 'forbidden');
  end if;

  if v_action in ('waive', 'dispute', 'reopen') and v_reason is null then
    return jsonb_build_object('success', false, 'code', 'reason_required');
  end if;

  v_approved_amount := coalesce(p_approved_amount, allocation_row.approved_amount, allocation_row.calculated_amount);
  if v_action in ('approve', 'mark_due', 'due', 'mark_paid', 'paid') and v_approved_amount is null then
    return jsonb_build_object('success', false, 'code', 'amount_required');
  end if;

  if v_approved_amount is not null and v_approved_amount < 0 then
    return jsonb_build_object('success', false, 'code', 'invalid_amount');
  end if;

  v_to_status := case v_action
    when 'submit' then 'pending_approval'
    when 'submit_for_review' then 'pending_approval'
    when 'approve' then 'approved'
    when 'mark_due' then 'due'
    when 'due' then 'due'
    when 'mark_paid' then 'paid'
    when 'paid' then 'paid'
    when 'waive' then 'waived'
    when 'dispute' then 'disputed'
    when 'reopen' then 'pending_approval'
    else allocation_row.status
  end;

  update public.transaction_commission_allocations
    set status = v_to_status,
        approved_amount = case
          when v_to_status in ('approved', 'due', 'paid') then v_approved_amount
          when v_to_status = 'pending_approval' and v_action = 'reopen' then null
          else approved_amount
        end,
        approved_by = case
          when v_to_status in ('approved', 'due', 'paid') then coalesce(approved_by, v_actor_id)
          when v_action = 'reopen' then null
          else approved_by
        end,
        approved_at = case
          when v_to_status in ('approved', 'due', 'paid') then coalesce(approved_at, now())
          when v_action = 'reopen' then null
          else approved_at
        end,
        due_at = case
          when v_to_status in ('due', 'paid') then coalesce(due_at, now())
          when v_action = 'reopen' then null
          else due_at
        end,
        paid_at = case
          when v_to_status = 'paid' then coalesce(paid_at, now())
          when v_action = 'reopen' then null
          else paid_at
        end,
        payment_reference = case
          when v_to_status = 'paid' then coalesce(v_payment_reference, payment_reference)
          when v_action = 'reopen' then null
          else payment_reference
        end,
        waived_at = case
          when v_to_status = 'waived' then coalesce(waived_at, now())
          when v_action = 'reopen' then null
          else waived_at
        end,
        waived_by = case
          when v_to_status = 'waived' then coalesce(waived_by, v_actor_id)
          when v_action = 'reopen' then null
          else waived_by
        end,
        dispute_reason = case
          when v_to_status = 'disputed' then v_reason
          when v_action = 'reopen' then null
          else dispute_reason
        end,
        override_reason = case
          when v_action in ('approve', 'mark_due', 'due', 'mark_paid', 'paid', 'waive', 'reopen')
               and (
                 v_reason is not null
                 or p_approved_amount is not null
                    and allocation_row.calculated_amount is not null
                    and p_approved_amount <> allocation_row.calculated_amount
               )
            then v_reason
          else override_reason
        end,
        locked_at = case
          when v_to_status in ('paid', 'waived') then coalesce(locked_at, now())
          when v_action = 'reopen' then null
          else locked_at
        end,
        metadata = coalesce(metadata, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
          'last_review_action', v_action,
          'last_reviewed_by', v_actor_id,
          'last_reviewed_at', now(),
          'last_review_reason', v_reason
        )),
        updated_at = now()
  where id = allocation_row.id
  returning * into updated_row;

  insert into public.commission_allocation_review_events (
    allocation_id,
    transaction_id,
    organisation_id,
    source_referral_id,
    action,
    from_status,
    to_status,
    previous_approved_amount,
    approved_amount,
    calculated_amount_snapshot,
    reason,
    payment_reference,
    actor_id,
    actor_email,
    metadata
  )
  values (
    updated_row.id,
    updated_row.transaction_id,
    updated_row.organisation_id,
    updated_row.source_referral_id,
    case v_action
      when 'submit' then 'submitted_for_review'
      when 'submit_for_review' then 'submitted_for_review'
      when 'approve' then 'approved'
      when 'mark_due' then 'marked_due'
      when 'due' then 'marked_due'
      when 'mark_paid' then 'marked_paid'
      when 'paid' then 'marked_paid'
      when 'waive' then 'waived'
      when 'dispute' then 'disputed'
      when 'reopen' then 'reopened'
      else 'adjusted'
    end,
    allocation_row.status,
    updated_row.status,
    allocation_row.approved_amount,
    updated_row.approved_amount,
    updated_row.calculated_amount,
    v_reason,
    v_payment_reference,
    v_actor_id,
    v_actor_email,
    coalesce(p_metadata, '{}'::jsonb)
  );

  perform public.bridge_sync_commission_allocation_review_sources(updated_row.id, v_actor_id);

  return jsonb_build_object(
    'success', true,
    'code', 'review_action_applied',
    'allocation_id', updated_row.id,
    'transaction_id', updated_row.transaction_id,
    'from_status', allocation_row.status,
    'to_status', updated_row.status,
    'approved_amount', updated_row.approved_amount
  );
end;
$$;

create or replace view public.commission_allocation_review_queue_v1 as
select
  allocation.id as allocation_id,
  allocation.organisation_id,
  allocation.transaction_id,
  allocation.source_referral_id,
  allocation.transaction_referral_link_id,
  allocation.commission_structure_id,
  structure.name as commission_structure_name,
  allocation.allocation_type,
  allocation.scope,
  allocation.participant_role,
  allocation.participant_user_id,
  allocation.participant_organisation_id,
  participant_org.name as participant_organisation_name,
  allocation.participant_branch_id,
  allocation.participant_name,
  allocation.participant_email,
  allocation.calculation_basis,
  allocation.allocation_pool,
  allocation.percentage,
  allocation.fixed_amount,
  allocation.gross_commission_amount_snapshot,
  allocation.basis_amount_snapshot,
  allocation.calculated_amount,
  allocation.approved_amount,
  allocation.status,
  allocation.requires_approval,
  allocation.approved_by,
  allocation.approved_at,
  allocation.due_at,
  allocation.paid_at,
  allocation.payment_reference,
  allocation.waived_at,
  allocation.waived_by,
  allocation.dispute_reason,
  allocation.override_reason,
  allocation.locked_at,
  latest_event.action as latest_review_action,
  latest_event.actor_id as latest_review_actor_id,
  latest_event.actor_email as latest_review_actor_email,
  latest_event.reason as latest_review_reason,
  latest_event.created_at as latest_reviewed_at,
  tx.transaction_reference,
  tx.property_address_line_1,
  tx.purchase_price,
  tx.sales_price,
  allocation.created_at,
  allocation.updated_at
from public.transaction_commission_allocations allocation
left join public.commission_structures structure
  on structure.id = allocation.commission_structure_id
left join public.organisations participant_org
  on participant_org.id = allocation.participant_organisation_id
left join public.transactions tx
  on tx.id = allocation.transaction_id
left join lateral (
  select event.*
  from public.commission_allocation_review_events event
  where event.allocation_id = allocation.id
  order by event.created_at desc
  limit 1
) latest_event on true
where allocation.status in ('projected', 'pending_approval', 'approved', 'due', 'disputed')
  or allocation.requires_approval = true;

create or replace view public.commission_allocation_review_summary_v1 as
select
  organisation_id,
  count(*)::integer as allocation_count,
  count(*) filter (where status = 'pending_approval' or (requires_approval = true and status = 'projected'))::integer as pending_review_count,
  count(*) filter (where status = 'approved')::integer as approved_count,
  count(*) filter (where status = 'due')::integer as due_count,
  count(*) filter (where status = 'paid')::integer as paid_count,
  count(*) filter (where status = 'waived')::integer as waived_count,
  count(*) filter (where status = 'disputed')::integer as disputed_count,
  coalesce(sum(calculated_amount), 0)::numeric(14,2) as calculated_total,
  coalesce(sum(approved_amount) filter (where status in ('approved', 'due', 'paid')), 0)::numeric(14,2) as approved_total,
  coalesce(sum(approved_amount) filter (where status = 'due'), 0)::numeric(14,2) as due_total,
  coalesce(sum(approved_amount) filter (where status = 'paid'), 0)::numeric(14,2) as paid_total
from public.transaction_commission_allocations
where status <> 'cancelled'
group by organisation_id;

alter table public.commission_allocation_review_events enable row level security;

drop policy if exists commission_allocation_review_events_member_select on public.commission_allocation_review_events;
create policy commission_allocation_review_events_member_select on public.commission_allocation_review_events
for select to authenticated
using (
  public.bridge_is_active_member(organisation_id)
  or exists (
    select 1
    from public.transaction_commission_allocations allocation
    where allocation.id = commission_allocation_review_events.allocation_id
      and (
        allocation.participant_user_id = auth.uid()
        or lower(coalesce(allocation.participant_email, '')) = lower(coalesce(public.bridge_current_email(), ''))
      )
  )
);

drop policy if exists commission_allocation_review_events_admin_insert on public.commission_allocation_review_events;
create policy commission_allocation_review_events_admin_insert on public.commission_allocation_review_events
for insert to authenticated
with check (public.bridge_is_org_admin(organisation_id));

grant select, insert on table public.commission_allocation_review_events to authenticated;
grant execute on function public.bridge_sync_commission_allocation_review_sources(uuid, uuid) to authenticated;
grant execute on function public.bridge_review_commission_allocation(uuid, text, numeric, text, text, jsonb) to authenticated;
grant select on public.commission_allocation_review_queue_v1 to authenticated;
grant select on public.commission_allocation_review_summary_v1 to authenticated;

commit;
