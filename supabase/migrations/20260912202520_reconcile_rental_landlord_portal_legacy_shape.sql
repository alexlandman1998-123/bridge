begin;

-- Forward-only convergence for the two historical rental portal foundation
-- migrations.  Those migrations used CREATE TABLE IF NOT EXISTS even though
-- the earlier landlord-decision feature had already claimed the same table
-- names with a staff-access shape.  Do not alter that history: retain the
-- staff columns and add only the token-portal columns required by the current
-- portal repository.
--
-- Existing staff access remains valid.  Legacy rows deliberately keep a NULL
-- token_hash; only newly issued opaque-token links participate in the unique
-- lookup index.

do $$
begin
  if to_regclass('public.rental_landlord_portal_access') is not null then
    alter table public.rental_landlord_portal_access
      add column if not exists token_hash text,
      add column if not exists expires_at timestamptz,
      add column if not exists last_accessed_at timestamptz,
      add column if not exists created_by uuid references auth.users(id) on delete set null;

    alter table public.rental_landlord_portal_access enable row level security;
    revoke all on table public.rental_landlord_portal_access from anon, authenticated;

    execute 'create unique index if not exists rental_landlord_portal_access_token_hash_unique_idx
      on public.rental_landlord_portal_access (token_hash)
      where token_hash is not null';
    execute 'create index if not exists rental_landlord_portal_access_lookup_idx
      on public.rental_landlord_portal_access (token_hash)
      where token_hash is not null and revoked_at is null';
  end if;

  if to_regclass('public.rental_landlord_portal_decisions') is not null then
    alter table public.rental_landlord_portal_decisions
      add column if not exists submitted_at timestamptz default now();

    update public.rental_landlord_portal_decisions
      set submitted_at = coalesce(submitted_at, created_at, now())
      where submitted_at is null;

    alter table public.rental_landlord_portal_decisions enable row level security;
    revoke all on table public.rental_landlord_portal_decisions from anon, authenticated;

    execute 'create index if not exists rental_landlord_portal_decisions_property_idx
      on public.rental_landlord_portal_decisions (property_id, submitted_at desc)';

    if to_regprocedure('public.rental_set_updated_at()') is not null
       and exists (
         select 1 from information_schema.columns
         where table_schema = 'public'
           and table_name = 'rental_landlord_portal_decisions'
           and column_name = 'updated_at'
       ) then
      drop trigger if exists trg_rental_landlord_portal_decisions_updated_at
        on public.rental_landlord_portal_decisions;
      create trigger trg_rental_landlord_portal_decisions_updated_at
        before update on public.rental_landlord_portal_decisions
        for each row execute function public.rental_set_updated_at();
    end if;
  end if;
end;
$$;

commit;
