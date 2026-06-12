begin;

create or replace function public.bridge_sync_offer_conversion_listing_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.listing_id is null then
    return new;
  end if;

  if coalesce(new.status, '') = 'converted_to_transaction' and new.transaction_id is not null then
    update public.private_listings
       set listing_status = case
         when coalesce(listing_status, '') in ('sold', 'sold_archived', 'withdrawn', 'archived', 'deleted') then listing_status
         else 'under_offer'
       end,
           updated_at = now()
     where id = new.listing_id;
  end if;

  return new;
end;
$$;

drop trigger if exists bridge_offer_conversion_listing_status_trigger on public.offers;

create trigger bridge_offer_conversion_listing_status_trigger
after insert or update of status, transaction_id, listing_id
on public.offers
for each row
execute function public.bridge_sync_offer_conversion_listing_status();

update public.private_listings as listing
   set listing_status = case
     when coalesce(listing.listing_status, '') in ('sold', 'sold_archived', 'withdrawn', 'archived', 'deleted') then listing.listing_status
     else 'under_offer'
   end,
       updated_at = now()
 where exists (
   select 1
     from public.offers as offer
    where offer.listing_id = listing.id
      and offer.status = 'converted_to_transaction'
      and offer.transaction_id is not null
 );

do $$
begin
  if to_regclass('public.transactions') is null then
    return;
  end if;

  if not exists (
    select 1
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'transactions'
       and column_name = 'accepted_offer_id'
  ) then
    return;
  end if;

  if exists (
    select accepted_offer_id
      from public.transactions
     where accepted_offer_id is not null
     group by accepted_offer_id
    having count(*) > 1
  ) then
    return;
  end if;

  if not exists (
    select 1
      from pg_indexes
     where schemaname = 'public'
       and indexname = 'transactions_accepted_offer_id_unique_idx'
  ) then
    create unique index transactions_accepted_offer_id_unique_idx
      on public.transactions (accepted_offer_id)
      where accepted_offer_id is not null;
  end if;
end;
$$;

commit;
