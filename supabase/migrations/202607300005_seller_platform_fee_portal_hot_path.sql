begin;

-- Seller platform-fee acceptance and first seller-portal paint both resolve the
-- transaction from a private listing. Keep those lookups on indexed paths so
-- public token requests do not trip the API statement timeout.
do $$
begin
  if to_regclass('public.transactions') is not null then
    if exists (
      select 1
      from pg_attribute
      where attrelid = 'public.transactions'::regclass
        and attname = 'listing_id'
        and not attisdropped
    ) then
      create index if not exists transactions_listing_id_created_idx
        on public.transactions (listing_id, created_at desc, id)
        where listing_id is not null;
    end if;

    if exists (
      select 1
      from pg_attribute
      where attrelid = 'public.transactions'::regclass
        and attname = 'private_listing_id'
        and not attisdropped
    ) then
      create index if not exists transactions_private_listing_id_created_idx
        on public.transactions (private_listing_id, created_at desc, id)
        where private_listing_id is not null;
    end if;
  end if;
end;
$$;

create or replace function public.bridge_resolve_private_listing_transaction_id(p_private_listing_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_transaction_id uuid;
begin
  if p_private_listing_id is null or to_regclass('public.transactions') is null then
    return null;
  end if;

  if exists (
    select 1
    from pg_attribute
    where attrelid = 'public.transactions'::regclass
      and attname = 'private_listing_id'
      and not attisdropped
  ) then
    execute
      'select id
         from public.transactions
        where private_listing_id = $1
        order by created_at desc nulls last, id
        limit 1'
    using p_private_listing_id
    into v_transaction_id;

    if v_transaction_id is not null then
      return v_transaction_id;
    end if;
  end if;

  if exists (
    select 1
    from pg_attribute
    where attrelid = 'public.transactions'::regclass
      and attname = 'listing_id'
      and not attisdropped
  ) then
    execute
      'select id
         from public.transactions
        where listing_id = $1
        order by created_at desc nulls last, id
        limit 1'
    using p_private_listing_id
    into v_transaction_id;
  end if;

  return v_transaction_id;
end;
$$;

grant execute on function public.bridge_resolve_private_listing_transaction_id(uuid) to authenticated, service_role;

comment on function public.bridge_resolve_private_listing_transaction_id(uuid) is
  'Resolves the newest transaction linked to a private listing using indexed transaction linkage columns.';

notify pgrst, 'reload schema';

commit;
