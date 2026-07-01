create or replace function public.bridge_normalize_transaction_role(role_type text, legal_role text default null, transaction_role text default null)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when lower(coalesce(transaction_role, '')) in (
      'listing_agent',
      'selling_agent',
      'transfer_attorney',
      'bond_attorney',
      'cancellation_attorney',
      'bond_originator',
      'buyer',
      'seller',
      'developer_contact',
      'external_collaborator'
    ) then lower(transaction_role)
    when lower(coalesce(role_type, '')) in ('transfer_attorney', 'conveyancer', 'attorney') and lower(coalesce(legal_role, '')) = 'bond' then 'bond_attorney'
    when lower(coalesce(role_type, '')) in ('transfer_attorney', 'conveyancer', 'attorney') and lower(coalesce(legal_role, '')) = 'cancellation' then 'cancellation_attorney'
    when lower(coalesce(role_type, '')) in ('transfer_attorney', 'conveyancer', 'attorney') then 'transfer_attorney'
    when lower(coalesce(role_type, '')) = 'bond_attorney' then 'bond_attorney'
    when lower(coalesce(role_type, '')) = 'cancellation_attorney' then 'cancellation_attorney'
    when lower(coalesce(role_type, '')) in ('agent', 'sales_agent', 'listing_agent') then 'listing_agent'
    when lower(coalesce(role_type, '')) = 'selling_agent' then 'selling_agent'
    when lower(coalesce(role_type, '')) in ('bond_originator', 'bondoriginator') then 'bond_originator'
    when lower(coalesce(role_type, '')) in ('developer', 'developer_rep', 'developer_contact') then 'developer_contact'
    when lower(coalesce(role_type, '')) in ('buyer', 'client') then 'buyer'
    when lower(coalesce(role_type, '')) = 'seller' then 'seller'
    else 'external_collaborator'
  end;
$$;

create or replace function public.bridge_transaction_participants_sync_transaction_role()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_transaction_role text;
  v_role_type text;
begin
  v_transaction_role := public.bridge_normalize_transaction_role(new.role_type, new.legal_role, new.transaction_role);
  v_role_type := lower(coalesce(new.role_type, ''));

  new.transaction_role := v_transaction_role;
  if v_transaction_role = 'transfer_attorney' then
    new.role_type := 'attorney';
    new.legal_role := 'transfer';
  elsif v_transaction_role = 'bond_attorney' then
    new.role_type := 'attorney';
    new.legal_role := 'bond';
  elsif v_transaction_role = 'cancellation_attorney' then
    new.role_type := 'attorney';
    new.legal_role := 'cancellation';
  elsif v_transaction_role in ('listing_agent', 'selling_agent') then
    new.role_type := 'agent';
    new.legal_role := 'none';
  elsif v_transaction_role = 'bond_originator' then
    new.role_type := 'bond_originator';
    new.legal_role := 'none';
  elsif v_transaction_role = 'developer_contact' then
    new.role_type := 'developer';
    new.legal_role := 'none';
  elsif v_transaction_role = 'buyer' then
    if v_role_type = 'client' then
      new.role_type := 'client';
    else
      new.role_type := 'buyer';
    end if;
    new.legal_role := 'none';
  elsif v_transaction_role = 'seller' then
    new.role_type := 'seller';
    new.legal_role := 'none';
  else
    if v_role_type in ('developer', 'agent', 'attorney', 'bond_originator', 'client', 'buyer', 'seller', 'internal_admin') then
      new.role_type := v_role_type;
    else
      new.role_type := 'client';
    end if;
    new.legal_role := 'none';
  end if;

  return new;
end;
$$;

drop trigger if exists transaction_participants_sync_transaction_role on public.transaction_participants;
create trigger transaction_participants_sync_transaction_role
before insert or update of role_type, legal_role, transaction_role on public.transaction_participants
for each row
execute function public.bridge_transaction_participants_sync_transaction_role();

update public.transaction_participants
set
  role_type = case public.bridge_normalize_transaction_role(role_type, legal_role, transaction_role)
    when 'transfer_attorney' then 'attorney'
    when 'bond_attorney' then 'attorney'
    when 'cancellation_attorney' then 'attorney'
    when 'listing_agent' then 'agent'
    when 'selling_agent' then 'agent'
    when 'bond_originator' then 'bond_originator'
    when 'developer_contact' then 'developer'
    when 'buyer' then case when lower(coalesce(role_type, '')) = 'client' then 'client' else 'buyer' end
    when 'seller' then 'seller'
    else case
      when lower(coalesce(role_type, '')) in ('developer', 'agent', 'attorney', 'bond_originator', 'client', 'buyer', 'seller', 'internal_admin')
        then lower(role_type)
      else 'client'
    end
  end,
  legal_role = case public.bridge_normalize_transaction_role(role_type, legal_role, transaction_role)
    when 'transfer_attorney' then 'transfer'
    when 'bond_attorney' then 'bond'
    when 'cancellation_attorney' then 'cancellation'
    else 'none'
  end,
  transaction_role = public.bridge_normalize_transaction_role(role_type, legal_role, transaction_role)
where role_type is not null;

alter table if exists public.transaction_participants
  drop constraint if exists transaction_participants_role_type_check;

alter table if exists public.transaction_participants
  add constraint transaction_participants_role_type_check
  check (role_type in ('developer', 'agent', 'attorney', 'bond_originator', 'client', 'buyer', 'seller', 'internal_admin'));

alter table if exists public.transaction_participants
  drop constraint if exists transaction_participants_legal_role_check;

alter table if exists public.transaction_participants
  add constraint transaction_participants_legal_role_check
  check (legal_role in ('none', 'transfer', 'bond', 'cancellation'));

alter table if exists public.transaction_participants
  drop constraint if exists transaction_participants_role_legal_assignment_check;

alter table if exists public.transaction_participants
  add constraint transaction_participants_role_legal_assignment_check
  check (
    (
      role_type = 'attorney'
      and legal_role in ('transfer', 'bond', 'cancellation')
      and transaction_role in ('transfer_attorney', 'bond_attorney', 'cancellation_attorney')
    )
    or (
      role_type <> 'attorney'
      and legal_role = 'none'
    )
  );

create index if not exists transaction_participants_role_shape_idx
  on public.transaction_participants (transaction_id, role_type, legal_role, transaction_role, status);
