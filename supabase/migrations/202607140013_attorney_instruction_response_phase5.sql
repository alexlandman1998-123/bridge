begin;

alter table if exists public.private_listing_role_players
  add column if not exists instruction_accepted_at timestamptz,
  add column if not exists instruction_accepted_by uuid references auth.users(id) on delete set null,
  add column if not exists instruction_declined_at timestamptz,
  add column if not exists instruction_declined_by uuid references auth.users(id) on delete set null,
  add column if not exists instruction_decision_note text,
  add column if not exists instruction_decision_source text;

create or replace function public.bridge_sync_transfer_instruction_decision()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_listing_id uuid;
  v_decided_at timestamptz := now();
begin
  if not (
       coalesce(new.attorney_role, '') = 'transfer_attorney'
       or coalesce(new.assignment_type, '') in ('transfer', 'transfer_and_bond')
       or coalesce(new.matter_type, '') in ('transfer', 'transfer_and_bond')
     )
     or new.instruction_status not in ('accepted', 'declined')
     or new.instruction_status is not distinct from old.instruction_status then
    return new;
  end if;

  select tx.listing_id
  into v_listing_id
  from public.transactions tx
  where tx.id = new.transaction_id;

  if new.instruction_status = 'accepted' then
    update public.transaction_role_players roleplayer
    set
      status = 'active',
      assignment_status = 'active',
      updated_at = v_decided_at
    where roleplayer.transaction_id = new.transaction_id
      and roleplayer.role_type = 'transfer_attorney';

    update public.private_listing_role_players allocation
    set
      allocation_status = 'converted',
      transaction_id = new.transaction_id,
      instruction_accepted_at = coalesce(new.instruction_accepted_at, v_decided_at),
      instruction_accepted_by = new.instruction_accepted_by,
      instruction_decision_note = new.instruction_decision_note,
      instruction_decision_source = coalesce(new.instruction_decision_source, 'attorney_incoming_queue'),
      updated_at = v_decided_at
    where allocation.role_type = 'transfer_attorney'
      and (
        allocation.transaction_id = new.transaction_id
        or (v_listing_id is not null and allocation.private_listing_id = v_listing_id)
      )
      and allocation.allocation_status in ('awaiting_buyer', 'under_offer', 'instructed', 'converted');
  else
    update public.transaction_role_players roleplayer
    set
      status = 'removed',
      assignment_status = 'removed',
      removed_at = coalesce(roleplayer.removed_at, v_decided_at),
      updated_at = v_decided_at
    where roleplayer.transaction_id = new.transaction_id
      and roleplayer.role_type = 'transfer_attorney';

    update public.private_listing_role_players allocation
    set
      allocation_status = 'withdrawn',
      instruction_declined_at = coalesce(new.instruction_declined_at, v_decided_at),
      instruction_declined_by = new.instruction_declined_by,
      instruction_decision_note = new.instruction_decision_note,
      instruction_decision_source = coalesce(new.instruction_decision_source, 'attorney_incoming_queue'),
      updated_at = v_decided_at
    where allocation.role_type = 'transfer_attorney'
      and (
        allocation.transaction_id = new.transaction_id
        or (v_listing_id is not null and allocation.private_listing_id = v_listing_id)
      )
      and allocation.allocation_status in ('awaiting_buyer', 'under_offer', 'instructed', 'converted');
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sync_transfer_instruction_decision on public.transaction_attorney_assignments;
create trigger trg_sync_transfer_instruction_decision
after update of instruction_status
on public.transaction_attorney_assignments
for each row
execute function public.bridge_sync_transfer_instruction_decision();

comment on function public.bridge_sync_transfer_instruction_decision() is
  'Phase 5 converts an accepted instruction into the active matter lifecycle, or removes a declined attorney so the agent can reassign safely.';

commit;
