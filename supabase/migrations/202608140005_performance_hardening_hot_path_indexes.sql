-- Phase 5: harden workspace boot and first dashboard paint hot paths.
-- These indexes are additive and match existing PostgREST filters/orderings.

do $$
begin
  if to_regclass('public.organisation_users') is not null then
    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'organisation_users'
        and column_name in ('user_id', 'created_at')
      group by table_schema, table_name
      having count(*) = 2
    ) then
      create index if not exists organisation_users_user_created_hot_path_idx
        on public.organisation_users (user_id, created_at)
        where user_id is not null;
    end if;

    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'organisation_users'
        and column_name = 'email'
    ) then
      create index if not exists organisation_users_lower_coalesced_email_hot_path_idx
        on public.organisation_users (lower(coalesce(email, '')));
    end if;
  end if;

  if to_regclass('public.attorney_firm_members') is not null then
    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'attorney_firm_members'
        and column_name in ('user_id', 'created_at')
      group by table_schema, table_name
      having count(*) = 2
    ) then
      create index if not exists attorney_firm_members_user_created_hot_path_idx
        on public.attorney_firm_members (user_id, created_at)
        where user_id is not null;
    end if;
  end if;

  if to_regclass('public.transaction_participants') is not null then
    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'transaction_participants'
        and column_name in ('user_id', 'role_type', 'transaction_id')
      group by table_schema, table_name
      having count(*) = 3
    ) then
      create index if not exists transaction_participants_user_role_tx_hot_path_idx
        on public.transaction_participants (user_id, role_type, transaction_id)
        where user_id is not null;
    end if;

    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'transaction_participants'
        and column_name in ('participant_email', 'role_type', 'transaction_id')
      group by table_schema, table_name
      having count(*) = 3
    ) then
      create index if not exists transaction_participants_email_role_tx_hot_path_idx
        on public.transaction_participants (participant_email, role_type, transaction_id)
        where participant_email is not null;
    end if;
  end if;

  if to_regclass('public.transactions') is not null then
    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'transactions'
        and column_name in ('organisation_id', 'assigned_agent_email')
      group by table_schema, table_name
      having count(*) = 2
    ) then
      create index if not exists transactions_org_assigned_agent_email_hot_path_idx
        on public.transactions (organisation_id, assigned_agent_email)
        where assigned_agent_email is not null;
    end if;

    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'transactions'
        and column_name in ('organisation_id', 'assigned_attorney_email')
      group by table_schema, table_name
      having count(*) = 2
    ) then
      create index if not exists transactions_org_assigned_attorney_email_hot_path_idx
        on public.transactions (organisation_id, assigned_attorney_email)
        where assigned_attorney_email is not null;
    end if;

    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'transactions'
        and column_name in ('organisation_id', 'assigned_bond_originator_email')
      group by table_schema, table_name
      having count(*) = 2
    ) then
      create index if not exists transactions_org_assigned_bond_originator_email_hot_path_idx
        on public.transactions (organisation_id, assigned_bond_originator_email)
        where assigned_bond_originator_email is not null;
    end if;

    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'transactions'
        and column_name in ('organisation_id', 'assigned_agent_id')
      group by table_schema, table_name
      having count(*) = 2
    ) then
      create index if not exists transactions_org_assigned_agent_id_hot_path_idx
        on public.transactions (organisation_id, assigned_agent_id)
        where assigned_agent_id is not null;
    end if;
  end if;

  if to_regclass('public.private_listings') is not null then
    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'private_listings'
        and column_name in ('organisation_id', 'assigned_agent_id', 'updated_at', 'listing_status', 'listing_visibility')
      group by table_schema, table_name
      having count(*) = 5
    ) then
      create index if not exists private_listings_org_agent_updated_visible_hot_path_idx
        on public.private_listings (organisation_id, assigned_agent_id, updated_at desc)
        where assigned_agent_id is not null
          and listing_status <> 'withdrawn'
          and listing_visibility <> 'archived';
    end if;

    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'private_listings'
        and column_name in ('organisation_id', 'updated_at', 'listing_status', 'listing_visibility')
      group by table_schema, table_name
      having count(*) = 4
    ) then
      create index if not exists private_listings_org_updated_visible_hot_path_idx
        on public.private_listings (organisation_id, updated_at desc)
        where listing_status <> 'withdrawn'
          and listing_visibility <> 'archived';
    end if;
  end if;

  if to_regclass('public.transaction_role_players') is not null then
    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'transaction_role_players'
        and column_name in ('organisation_id', 'role_type', 'transaction_id')
      group by table_schema, table_name
      having count(*) = 3
    ) then
      create index if not exists transaction_role_players_org_role_tx_hot_path_idx
        on public.transaction_role_players (organisation_id, role_type, transaction_id)
        where organisation_id is not null;
    end if;
  end if;

  if to_regclass('public.transaction_bond_applications') is not null then
    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'transaction_bond_applications'
        and column_name in ('assigned_user_id', 'transaction_id')
      group by table_schema, table_name
      having count(*) = 2
    ) then
      create index if not exists transaction_bond_applications_assigned_user_tx_hot_path_idx
        on public.transaction_bond_applications (assigned_user_id, transaction_id)
        where assigned_user_id is not null;
    end if;
  end if;

  if to_regclass('public.document_requests') is not null then
    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'document_requests'
        and column_name in ('transaction_id', 'created_at')
      group by table_schema, table_name
      having count(*) = 2
    ) then
      create index if not exists document_requests_transaction_created_hot_path_idx
        on public.document_requests (transaction_id, created_at desc)
        where transaction_id is not null;
    end if;
  end if;
end $$;

notify pgrst, 'reload schema';
