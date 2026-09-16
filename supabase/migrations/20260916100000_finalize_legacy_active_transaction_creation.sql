-- The transaction-creation lifecycle introduced an inactive "initializing"
-- state. A small number of established creation boundaries still atomically
-- insert their fully active transaction and dependent setup records. Without
-- normalisation those inserts violate transactions_incomplete_creation_inactive_check
-- before the boundary can finish.
--
-- Keep the lifecycle guard intact for the staged creation flow: only an insert
-- that explicitly requests an active transaction is treated as a completed
-- legacy atomic creation.
create or replace function public.bridge_finalize_legacy_active_transaction_creation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.is_active
    and new.creation_status = 'initializing' then
    new.creation_status := 'complete';
    new.creation_completed_at := coalesce(new.creation_completed_at, now());
    new.creation_incomplete_at := null;
    new.creation_error := '{}'::jsonb;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_finalize_legacy_active_transaction_creation on public.transactions;

create trigger trg_finalize_legacy_active_transaction_creation
before insert on public.transactions
for each row
execute function public.bridge_finalize_legacy_active_transaction_creation();
