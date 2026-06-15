create extension if not exists "pgcrypto";
create or replace function public.bridge_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
create table if not exists public.appointment_viewed_listings (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  appointment_id uuid not null references public.appointments(appointment_id) on delete cascade,
  lead_id uuid references public.leads(lead_id) on delete set null,
  listing_id uuid not null,
  agent_id uuid references public.profiles(id) on delete set null,
  viewed_at timestamptz,
  outcome text,
  buyer_feedback text,
  agent_notes text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint appointment_viewed_listings_unique_listing
    unique (organisation_id, appointment_id, listing_id)
);
do $$
begin
  if to_regclass('public.private_listings') is not null then
    alter table public.appointment_viewed_listings
      drop constraint if exists appointment_viewed_listings_listing_id_fkey;

    alter table public.appointment_viewed_listings
      add constraint appointment_viewed_listings_listing_id_fkey
      foreign key (listing_id)
      references public.private_listings(id)
      on delete cascade;
  end if;
end $$;
create index if not exists appointment_viewed_listings_org_idx
  on public.appointment_viewed_listings (organisation_id, updated_at desc);
create index if not exists appointment_viewed_listings_appointment_idx
  on public.appointment_viewed_listings (appointment_id, viewed_at desc);
create index if not exists appointment_viewed_listings_lead_idx
  on public.appointment_viewed_listings (lead_id, viewed_at desc);
create index if not exists appointment_viewed_listings_listing_idx
  on public.appointment_viewed_listings (listing_id, viewed_at desc);
create index if not exists appointment_viewed_listings_agent_idx
  on public.appointment_viewed_listings (agent_id, viewed_at desc);
drop trigger if exists appointment_viewed_listings_set_updated_at on public.appointment_viewed_listings;
create trigger appointment_viewed_listings_set_updated_at
before update on public.appointment_viewed_listings
for each row
execute function public.bridge_set_updated_at();
alter table public.appointment_viewed_listings enable row level security;
drop policy if exists appointment_viewed_listings_org_members_select on public.appointment_viewed_listings;
create policy appointment_viewed_listings_org_members_select
  on public.appointment_viewed_listings
  for select
  using (public.bridge_is_active_member(organisation_id));
drop policy if exists appointment_viewed_listings_org_members_insert on public.appointment_viewed_listings;
create policy appointment_viewed_listings_org_members_insert
  on public.appointment_viewed_listings
  for insert
  with check (public.bridge_is_active_member(organisation_id));
drop policy if exists appointment_viewed_listings_org_members_update on public.appointment_viewed_listings;
create policy appointment_viewed_listings_org_members_update
  on public.appointment_viewed_listings
  for update
  using (public.bridge_is_active_member(organisation_id))
  with check (public.bridge_is_active_member(organisation_id));
drop policy if exists appointment_viewed_listings_org_members_delete on public.appointment_viewed_listings;
create policy appointment_viewed_listings_org_members_delete
  on public.appointment_viewed_listings
  for delete
  using (public.bridge_is_active_member(organisation_id));
grant select, insert, update, delete on public.appointment_viewed_listings to authenticated;
notify pgrst, 'reload schema';
