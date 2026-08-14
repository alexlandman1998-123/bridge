-- Add short-lived compatibility aliases for deployed clients that still read
-- pre-canonical column names. Canonical application code should continue to
-- use assigned_branch_id, assigned_agent_id, partner_name, organisation_id,
-- and created_at.

create or replace function public.bridge_sync_backend_drift_transaction_branch()
returns trigger
language plpgsql
as $$
begin
  if new.assigned_branch_id is not null then
    new.branch_id := new.assigned_branch_id;
  elsif new.branch_id is not null then
    new.assigned_branch_id := new.branch_id;
  end if;

  return new;
end;
$$;

create or replace function public.bridge_sync_backend_drift_private_listing_agent_email()
returns trigger
language plpgsql
as $$
declare
  v_agent_email text;
  v_should_sync boolean := false;
begin
  if new.assigned_agent_id is not null then
    if tg_op = 'INSERT' then
      v_should_sync := true;
    else
      v_should_sync :=
        new.assigned_agent_id is distinct from old.assigned_agent_id
        or new.assigned_agent_email is null;
    end if;
  end if;

  if v_should_sync then
    select p.email
      into v_agent_email
      from public.profiles p
     where p.id = new.assigned_agent_id
     limit 1;

    if v_agent_email is not null then
      new.assigned_agent_email := v_agent_email;
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.bridge_sync_backend_drift_role_player_aliases()
returns trigger
language plpgsql
as $$
begin
  if new.organisation_id is not null then
    new.workspace_id := new.organisation_id;
  elsif new.workspace_id is not null then
    new.organisation_id := new.workspace_id;
  end if;

  if new.partner_name is not null then
    new.organisation_name := new.partner_name;
  elsif new.organisation_name is not null then
    new.partner_name := new.organisation_name;
  end if;

  return new;
end;
$$;

create or replace function public.bridge_sync_backend_drift_document_uploaded_at()
returns trigger
language plpgsql
as $$
begin
  if new.uploaded_at is null then
    new.uploaded_at := new.created_at;
  elsif new.created_at is null then
    new.created_at := new.uploaded_at;
  end if;

  return new;
end;
$$;

do $$
begin
  if to_regclass('public.transactions') is not null then
    alter table public.transactions
      add column if not exists assigned_branch_id uuid,
      add column if not exists branch_id uuid;

    update public.transactions
       set branch_id = assigned_branch_id
     where branch_id is null
       and assigned_branch_id is not null;

    create index if not exists transactions_branch_id_compat_idx
      on public.transactions (branch_id)
      where branch_id is not null;

    drop trigger if exists trg_sync_backend_drift_transaction_branch on public.transactions;
    create trigger trg_sync_backend_drift_transaction_branch
      before insert or update of branch_id, assigned_branch_id
      on public.transactions
      for each row
      execute function public.bridge_sync_backend_drift_transaction_branch();
  end if;

  if to_regclass('public.private_listings') is not null then
    alter table public.private_listings
      add column if not exists assigned_agent_email text;

    update public.private_listings pl
       set assigned_agent_email = p.email
      from public.profiles p
     where pl.assigned_agent_email is null
       and pl.assigned_agent_id = p.id
       and p.email is not null;

    create index if not exists private_listings_assigned_agent_email_compat_idx
      on public.private_listings (organisation_id, lower(assigned_agent_email))
      where assigned_agent_email is not null;

    drop trigger if exists trg_sync_backend_drift_private_listing_agent_email on public.private_listings;
    create trigger trg_sync_backend_drift_private_listing_agent_email
      before insert or update of assigned_agent_id, assigned_agent_email
      on public.private_listings
      for each row
      execute function public.bridge_sync_backend_drift_private_listing_agent_email();
  end if;

  if to_regclass('public.transaction_role_players') is not null then
    alter table public.transaction_role_players
      add column if not exists organisation_name text,
      add column if not exists workspace_id uuid;

    update public.transaction_role_players
       set organisation_name = partner_name
     where organisation_name is null
       and partner_name is not null;

    update public.transaction_role_players trp
       set organisation_name = coalesce(
             nullif(o.display_name, ''),
             nullif(o.name, '')
           )
      from public.organisations o
     where trp.organisation_name is null
       and trp.organisation_id = o.id
       and coalesce(nullif(o.display_name, ''), nullif(o.name, '')) is not null;

    update public.transaction_role_players
       set workspace_id = organisation_id
     where workspace_id is null
       and organisation_id is not null;

    create index if not exists transaction_role_players_workspace_id_compat_idx
      on public.transaction_role_players (workspace_id)
      where workspace_id is not null;

    drop trigger if exists trg_sync_backend_drift_role_player_aliases on public.transaction_role_players;
    create trigger trg_sync_backend_drift_role_player_aliases
      before insert or update of organisation_id, workspace_id, partner_name, organisation_name
      on public.transaction_role_players
      for each row
      execute function public.bridge_sync_backend_drift_role_player_aliases();
  end if;

  if to_regclass('public.documents') is not null then
    alter table public.documents
      add column if not exists uploaded_at timestamptz;

    update public.documents
       set uploaded_at = created_at
     where uploaded_at is null
       and created_at is not null;

    create index if not exists documents_uploaded_at_compat_idx
      on public.documents (transaction_id, uploaded_at desc)
      where uploaded_at is not null;

    drop trigger if exists trg_sync_backend_drift_document_uploaded_at on public.documents;
    create trigger trg_sync_backend_drift_document_uploaded_at
      before insert or update of created_at, uploaded_at
      on public.documents
      for each row
      execute function public.bridge_sync_backend_drift_document_uploaded_at();
  end if;
end $$;

notify pgrst, 'reload schema';
