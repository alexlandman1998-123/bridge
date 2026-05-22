alter table if exists public.appointments
  add column if not exists offer_invite_id uuid;

alter table if exists public.offers
  add column if not exists offer_token text;

do $$
begin
  if to_regclass('public.offers') is null then
    raise notice 'Skipping offers_offer_token_idx because public.offers does not exist yet.';
  else
    execute 'create unique index if not exists offers_offer_token_idx on public.offers (offer_token) where offer_token is not null';
  end if;
end $$;

do $$
begin
  if to_regclass('public.appointments') is not null and to_regclass('public.offers') is not null then
    alter table public.appointments
      drop constraint if exists appointments_offer_invite_id_fkey;

    alter table public.appointments
      add constraint appointments_offer_invite_id_fkey
      foreign key (offer_invite_id)
      references public.offers(id)
      on delete set null;
  end if;
end $$;

drop policy if exists offers_public_token_select on public.offers;
create policy offers_public_token_select
  on public.offers
  for select
  using (
    offer_token is not null
    and status in ('draft', 'submitted', 'under_review', 'countered')
    and (expiry_date is null or expiry_date >= current_date)
  );

drop policy if exists offers_public_token_update on public.offers;
create policy offers_public_token_update
  on public.offers
  for update
  using (
    offer_token is not null
    and status in ('draft', 'countered')
    and (expiry_date is null or expiry_date >= current_date)
  )
  with check (
    offer_token is not null
    and status in ('submitted', 'under_review')
  );

do $$
begin
  if to_regclass('public.appointments') is null then
    raise notice 'Skipping appointments_offer_invite_id_idx because public.appointments does not exist yet.';
  else
    execute 'create index if not exists appointments_offer_invite_id_idx on public.appointments (offer_invite_id)';
  end if;
end $$;
