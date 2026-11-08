-- Durable reconciliation state; no historical transaction values are rewritten.
begin;
alter table public.transactions
 add column deal_setup_terms_version uuid,
 add column deal_setup_sync_status text check(deal_setup_sync_status in ('pending','complete','failed')),
 add column deal_setup_sync_error text;

-- Keep older readers/writers consistent without rewriting historical records.
create function public.transaction_commercial_price_alias_guard() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if tg_op='INSERT' then
   if new.purchase_price is not null and new.sales_price is not null and new.purchase_price<>new.sales_price then
     raise exception 'Purchase price and sales price must agree.' using errcode='23514';
   end if;
   new.purchase_price:=coalesce(new.purchase_price,new.sales_price);
   new.sales_price:=new.purchase_price;
 elsif new.purchase_price is distinct from old.purchase_price and new.sales_price is distinct from old.sales_price then
   if new.purchase_price is distinct from new.sales_price then raise exception 'Purchase price and sales price must agree.' using errcode='23514';end if;
 elsif new.purchase_price is distinct from old.purchase_price then new.sales_price:=new.purchase_price;
 elsif new.sales_price is distinct from old.sales_price then new.purchase_price:=new.sales_price;
 end if;
 return new;
end;
$$;
revoke all on function public.transaction_commercial_price_alias_guard() from public,anon,authenticated;
create trigger transaction_commercial_price_alias_guard before insert or update of purchase_price,sales_price on public.transactions
 for each row execute function public.transaction_commercial_price_alias_guard();
commit;
