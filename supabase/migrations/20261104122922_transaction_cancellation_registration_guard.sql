-- Ordinary sale cancellation must not overwrite a recorded registration or
-- completed/archived outcome. Use the existing reviewed reversal/reopen route.
create or replace function journey_private.guard_registered_sale_cancellation()
returns trigger language plpgsql set search_path='' as $$
begin
 if new.lifecycle_state='cancelled' and old.lifecycle_state is distinct from 'cancelled' then
   if old.registered_at is not null or old.completed_at is not null
      or old.lifecycle_state in ('registered','completed','archived') then
     raise exception 'Undo registration or reopen the archived transaction before cancelling it.' using errcode='23514';
   end if;
   if nullif(btrim(new.cancelled_reason),'') is null or new.cancelled_at is null then
     raise exception 'A cancellation reason and timestamp are required.' using errcode='23514';
   end if;
 end if;
 return new;
end;
$$;
revoke all on function journey_private.guard_registered_sale_cancellation() from public,anon,authenticated;
create trigger guard_registered_sale_cancellation before update of lifecycle_state on public.transactions
for each row execute function journey_private.guard_registered_sale_cancellation();
