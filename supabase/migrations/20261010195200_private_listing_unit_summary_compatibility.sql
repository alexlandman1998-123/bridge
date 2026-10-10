begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Listing summaries and the development stock editor read this nullable link.
-- Existing listings keep their current data and publication state.
alter table public.private_listings
  add column if not exists unit_id uuid references public.units(id) on delete set null;

create index if not exists private_listings_unit_id_idx
  on public.private_listings(unit_id) where unit_id is not null;

comment on column public.private_listings.unit_id is
  'Optional development stock unit linked to the private listing.';

notify pgrst, 'reload schema';
commit;
