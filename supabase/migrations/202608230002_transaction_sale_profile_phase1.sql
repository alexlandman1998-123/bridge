alter table public.transactions
  add column if not exists sale_channel text,
  add column if not exists seller_party_type text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'transactions_sale_channel_check'
      and conrelid = 'public.transactions'::regclass
  ) then
    alter table public.transactions
      add constraint transactions_sale_channel_check
      check (
        sale_channel is null
        or sale_channel in ('developer_direct', 'developer_assigned', 'agency_introduced')
      ) not valid;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'transactions_seller_party_type_check'
      and conrelid = 'public.transactions'::regclass
  ) then
    alter table public.transactions
      add constraint transactions_seller_party_type_check
      check (
        seller_party_type is null
        or seller_party_type in ('developer', 'private_seller')
      ) not valid;
  end if;
end $$;

update public.transactions
set seller_party_type = case
    when lower(coalesce(transaction_type, '')) in ('developer_sale', 'development_sale', 'development')
      or development_id is not null
      then 'developer'
    else 'private_seller'
  end
where seller_party_type is null;

update public.transactions
set sale_channel = case
    when lower(coalesce(transaction_type, '')) in ('developer_sale', 'development_sale', 'development')
      or development_id is not null
      then case
        when assigned_agent is not null or assigned_agent_email is not null then 'developer_assigned'
        else 'developer_direct'
      end
    else null
  end
where sale_channel is null;

create index if not exists transactions_sale_channel_idx
  on public.transactions (sale_channel)
  where sale_channel is not null;

create index if not exists transactions_seller_party_type_idx
  on public.transactions (seller_party_type)
  where seller_party_type is not null;
