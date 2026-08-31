begin;

-- Transaction creation needs a private listing as the seller-portal scope,
-- but that internal workspace must not be treated as a live market listing
-- until the existing canonical mandate guard allows activation.
create or replace function public.bridge_keep_private_transaction_listing_internal()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if coalesce(new.listing_reference, '') like 'TX-%'
     and lower(coalesce(new.listing_status, '')) in (
       'seller_lead',
       'onboarding_sent',
       'transaction_created'
     ) then
    new.listing_status := 'onboarding_sent';
    new.is_active := false;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_000_private_transaction_listing_internal
  on public.private_listings;
create trigger trg_000_private_transaction_listing_internal
before insert or update of listing_reference, listing_status, is_active
on public.private_listings
for each row execute function public.bridge_keep_private_transaction_listing_internal();

revoke all on function public.bridge_keep_private_transaction_listing_internal()
  from public, anon, authenticated;

comment on function public.bridge_keep_private_transaction_listing_internal() is
  'Keeps transaction-generated private listings internal during seller onboarding; the canonical mandate workflow remains the only activation path.';

commit;
