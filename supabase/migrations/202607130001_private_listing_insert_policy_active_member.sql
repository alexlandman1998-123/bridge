begin;

alter table if exists public.private_listings enable row level security;

drop policy if exists private_listings_insert_member on public.private_listings;
create policy private_listings_insert_member
on public.private_listings
for insert
to authenticated
with check (public.bridge_is_active_member(organisation_id));

grant insert on public.private_listings to authenticated;

commit;
