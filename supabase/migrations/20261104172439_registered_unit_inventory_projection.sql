-- Keep developer stock aligned atomically with the owning organisation's sale.
-- No backfill: historical inventory requires a separate reviewed repair.
create or replace function journey_private.project_registered_unit_inventory()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_unit uuid; v_latest uuid;
begin
 if new.unit_id is null or new.development_id is null then return new; end if;
 -- A transaction's foreign key alone never grants another tenant's stock write.
 select u.id into v_unit from public.units u
 join public.developments d on d.id=u.development_id
 where u.id=new.unit_id and u.development_id=new.development_id
   and d.organisation_id=new.organisation_id for update of u;
 if v_unit is null then return new; end if;
 select t.id into v_latest from public.transactions t
 where t.unit_id=v_unit and t.development_id=new.development_id
   and t.organisation_id=new.organisation_id
 order by t.created_at desc,t.id desc limit 1;
 if v_latest is distinct from new.id then return new; end if;
 if new.registered_at is not null and coalesce(new.lifecycle_state,'active') not in ('cancelled','withdrawn') then
   update public.units set status='Registered' where id=v_unit and status is distinct from 'Registered';
 elsif tg_op='UPDATE' and old.registered_at is not null and new.registered_at is null then
   update public.units set status='Transfer in Progress' where id=v_unit and status='Registered';
 end if;
 return new;
end;
$$;
revoke all on function journey_private.project_registered_unit_inventory() from public,anon,authenticated;
create trigger transaction_registered_unit_inventory
after insert or update of registered_at,unit_id,development_id,lifecycle_state on public.transactions
for each row execute function journey_private.project_registered_unit_inventory();

-- A delayed reservation callback must not overwrite a completed registration.
create or replace function journey_private.preserve_registered_unit_inventory()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_registered boolean;
begin
 select t.registered_at is not null and coalesce(t.lifecycle_state,'active') not in ('cancelled','withdrawn')
 into v_registered from public.transactions t
 join public.developments d on d.id=new.development_id and d.organisation_id=t.organisation_id
 where t.unit_id=new.id and t.development_id=new.development_id
 order by t.created_at desc,t.id desc limit 1;
 if v_registered then new.status:='Registered'; end if;
 return new;
end;
$$;
revoke all on function journey_private.preserve_registered_unit_inventory() from public,anon,authenticated;
create trigger unit_preserve_registered_inventory
before update of status on public.units
for each row execute function journey_private.preserve_registered_unit_inventory();
