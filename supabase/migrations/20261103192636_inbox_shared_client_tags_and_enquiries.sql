-- Primary workspace: shared client organisation, including phone-only contacts.
-- No marketing subscriptions or WhatsApp consent are changed.
begin;
create table public.agency_client_tags (
  organisation_id uuid not null,
  client_id uuid not null,
  tag text not null check (tag=lower(btrim(tag)) and length(tag) between 1 and 60),
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  primary key (organisation_id,client_id,tag),
  foreign key (organisation_id,client_id) references public.agency_client_profiles(organisation_id,id)
);
create table public.agency_client_property_enquiries (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  client_id uuid not null,
  listing_id uuid references public.private_listings(id),
  development_id uuid references public.developments(id),
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  check (num_nonnulls(listing_id,development_id)=1),
  foreign key (organisation_id,client_id) references public.agency_client_profiles(organisation_id,id)
);
create unique index agency_client_listing_enquiry_key on public.agency_client_property_enquiries(client_id,listing_id) where listing_id is not null;
create unique index agency_client_development_enquiry_key on public.agency_client_property_enquiries(client_id,development_id) where development_id is not null;
create index agency_client_enquiry_scope on public.agency_client_property_enquiries(organisation_id,client_id);
alter table public.agency_client_tags enable row level security;
alter table public.agency_client_property_enquiries enable row level security;
revoke all on public.agency_client_tags,public.agency_client_property_enquiries from public,anon,authenticated;
grant select,insert,delete on public.agency_client_tags,public.agency_client_property_enquiries to authenticated;
grant all on public.agency_client_tags,public.agency_client_property_enquiries to service_role;
create policy client_tags_read on public.agency_client_tags for select to authenticated using (arch9_client_private.can_read_client(client_id));
create policy client_tags_add on public.agency_client_tags for insert to authenticated with check (
  created_by=(select auth.uid()) and exists(select 1 from public.agency_client_profiles p where p.id=client_id and p.organisation_id=agency_client_tags.organisation_id and p.merged_into is null) and arch9_client_private.can_read_client(client_id));
create policy client_tags_remove on public.agency_client_tags for delete to authenticated using (arch9_client_private.can_read_client(client_id));
create policy client_enquiries_read on public.agency_client_property_enquiries for select to authenticated using (
  arch9_client_private.can_read_client(client_id) and
  (listing_id is null or exists(select 1 from public.private_listings l where l.id=listing_id)) and
  (development_id is null or exists(select 1 from public.developments d where d.id=development_id)));
create policy client_enquiries_add on public.agency_client_property_enquiries for insert to authenticated with check (
  created_by=(select auth.uid()) and arch9_client_private.can_read_client(client_id) and
  exists(select 1 from public.agency_client_profiles p where p.id=client_id and p.organisation_id=agency_client_property_enquiries.organisation_id and p.merged_into is null) and
  (listing_id is null or exists(select 1 from public.private_listings l where l.id=listing_id)) and
  (development_id is null or exists(select 1 from public.developments d where d.id=development_id)));
create policy client_enquiries_remove on public.agency_client_property_enquiries for delete to authenticated using (arch9_client_private.can_read_client(client_id));
-- Existing reviewed merges flatten profile redirects. Reads include redirected
-- client IDs, retaining these records without changing the audited merge routine.
commit;
