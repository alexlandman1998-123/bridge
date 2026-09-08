-- A unit may have historical transaction rows, but a new or reassigned sale
-- must not create a second live transaction alongside an existing one.
--
-- This is a trigger instead of a partial unique index because production has
-- legacy duplicates that need individual, audited reconciliation. The trigger
-- leaves those rows editable so they can be retired safely, while preventing
-- any new duplicate from being introduced.

create or replace function public.bridge_prevent_active_unit_transaction_duplicate()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.unit_id is null
    or new.deleted_at is not null
    or coalesce(new.lifecycle_state, 'active') in ('archived', 'cancelled', 'completed') then
    return new;
  end if;

  -- Existing legacy duplicates must remain editable until they are reconciled.
  if tg_op = 'UPDATE' and new.unit_id is not distinct from old.unit_id then
    return new;
  end if;

  if exists (
    select 1
    from public.transactions existing_transaction
    where existing_transaction.unit_id = new.unit_id
      and existing_transaction.id <> new.id
      and existing_transaction.deleted_at is null
      and coalesce(existing_transaction.lifecycle_state, 'active') not in ('archived', 'cancelled', 'completed')
  ) then
    raise exception using
      errcode = '23505',
      message = 'An active transaction already exists for this unit.',
      detail = format('unit_id=%s', new.unit_id),
      hint = 'Open or continue the existing transaction instead of creating a duplicate.';
  end if;

  return new;
end;
$$;

drop trigger if exists bridge_prevent_active_unit_transaction_duplicate on public.transactions;

create trigger bridge_prevent_active_unit_transaction_duplicate
before insert or update of unit_id, lifecycle_state, deleted_at
on public.transactions
for each row
execute function public.bridge_prevent_active_unit_transaction_duplicate();
