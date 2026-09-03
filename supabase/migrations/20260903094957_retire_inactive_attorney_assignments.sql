begin;

-- A legal matter is only operational while its source transaction is
-- operational. Keep historical allocations for audit, but remove them from
-- active attorney queues whenever a deal is reset, cancelled, archived or
-- deleted.
update public.transaction_attorney_assignments taa
set
  status = 'removed',
  updated_at = now()
from public.transactions t
where t.id = taa.transaction_id
  and coalesce(taa.status, 'active') in ('pending', 'active', 'paused')
  and (
    t.is_active is false
    or lower(coalesce(t.lifecycle_state, '')) in ('cancelled', 'canceled', 'archived', 'deleted', 'reset', 'withdrawn')
    or t.archived_at is not null
    or t.cancelled_at is not null
  );

-- Backfill only blank property addresses. A development unit inherits the
-- development address; this makes an attorney matter identifiable without
-- overwriting an address captured specifically for a transaction.
update public.transactions t
set
  property_address_line_1 = coalesce(
    nullif(d.formatted_address, ''),
    nullif(d.address, ''),
    nullif(d.street_address, ''),
    nullif(d.address_line_1, ''),
    nullif(d.location, '')
  ),
  updated_at = now()
from public.units u
join public.developments d on d.id = u.development_id
where t.unit_id = u.id
  and t.is_active is distinct from false
  and nullif(trim(coalesce(t.property_address_line_1, '')), '') is null
  and coalesce(
    nullif(d.formatted_address, ''),
    nullif(d.address, ''),
    nullif(d.street_address, ''),
    nullif(d.address_line_1, ''),
    nullif(d.location, '')
  ) is not null;

create or replace function public.bridge_retire_attorney_assignments_for_retired_transaction()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.is_active is false
    or lower(coalesce(new.lifecycle_state, '')) in ('cancelled', 'canceled', 'archived', 'deleted', 'reset', 'withdrawn')
    or new.archived_at is not null
    or new.cancelled_at is not null then
    update public.transaction_attorney_assignments
    set
      status = 'removed',
      updated_at = now()
    where transaction_id = new.id
      and coalesce(status, 'active') in ('pending', 'active', 'paused');
  end if;
  return new;
end;
$$;

revoke all on function public.bridge_retire_attorney_assignments_for_retired_transaction() from public, anon, authenticated;

drop trigger if exists trg_retire_attorney_assignments_for_retired_transaction on public.transactions;
create trigger trg_retire_attorney_assignments_for_retired_transaction
after insert or update of is_active, lifecycle_state, archived_at, cancelled_at
on public.transactions
for each row
execute function public.bridge_retire_attorney_assignments_for_retired_transaction();

commit;
