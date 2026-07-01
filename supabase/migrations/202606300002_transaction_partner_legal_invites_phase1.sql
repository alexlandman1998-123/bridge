alter table if exists public.transaction_partner_invitations
  drop constraint if exists transaction_partner_invitations_role_type_check;

alter table if exists public.transaction_partner_invitations
  add constraint transaction_partner_invitations_role_type_check
  check (role_type in (
    'transfer_attorney',
    'bond_attorney',
    'cancellation_attorney',
    'bond_originator',
    'developer',
    'other'
  ));

alter table if exists public.transaction_user_access
  drop constraint if exists transaction_user_access_access_role_check;

alter table if exists public.transaction_user_access
  add constraint transaction_user_access_access_role_check
  check (access_role in (
    'transfer_attorney',
    'bond_attorney',
    'cancellation_attorney',
    'bond_originator',
    'developer',
    'other'
  ));

create or replace function public.bridge_transaction_partner_invite_role_shape(p_role_type text)
returns table(role_type text, legal_role text, transaction_role text, profile_role text, role_label text)
language sql
stable
as $$
  select
    case
      when p_role_type in ('transfer_attorney', 'bond_attorney', 'cancellation_attorney') then 'attorney'
      when p_role_type = 'bond_originator' then 'bond_originator'
      when p_role_type = 'developer' then 'developer'
      else 'external_collaborator'
    end,
    case
      when p_role_type = 'transfer_attorney' then 'transfer'
      when p_role_type = 'bond_attorney' then 'bond'
      when p_role_type = 'cancellation_attorney' then 'cancellation'
      else 'none'
    end,
    case
      when p_role_type = 'transfer_attorney' then 'transfer_attorney'
      when p_role_type = 'bond_attorney' then 'bond_attorney'
      when p_role_type = 'cancellation_attorney' then 'cancellation_attorney'
      when p_role_type = 'bond_originator' then 'bond_originator'
      when p_role_type = 'developer' then 'developer_contact'
      else 'external_collaborator'
    end,
    case
      when p_role_type in ('transfer_attorney', 'bond_attorney', 'cancellation_attorney') then 'attorney'
      when p_role_type = 'bond_originator' then 'bond_originator'
      when p_role_type = 'developer' then 'developer'
      else 'viewer'
    end,
    case
      when p_role_type = 'transfer_attorney' then 'Transfer Attorney'
      when p_role_type = 'bond_attorney' then 'Bond Attorney'
      when p_role_type = 'cancellation_attorney' then 'Cancellation Attorney'
      when p_role_type = 'bond_originator' then 'Bond Originator'
      when p_role_type = 'developer' then 'Developer'
      else 'Transaction Partner'
    end
$$;

create or replace function public.bridge_partner_prospect_role(p_role_type text)
returns text
language sql
immutable
as $$
  select case
    when lower(trim(coalesce(p_role_type, ''))) in (
      'transfer_attorney',
      'bond_attorney',
      'cancellation_attorney',
      'attorney',
      'conveyancer',
      'conveyancing_secretary'
    ) then 'attorney'
    when lower(trim(coalesce(p_role_type, ''))) in ('bond_originator', 'originator', 'bond') then 'bond_originator'
    when lower(trim(coalesce(p_role_type, ''))) in ('developer', 'developer_contact') then 'developer'
    else 'other'
  end
$$;
