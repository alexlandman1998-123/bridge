-- Phase 6: an organisation-scoped, immutable record of website domain changes.
-- Publication history remains in website_publication_events; this ledger covers
-- domain operations without retaining DNS secrets, visitor data, or form content.
create table public.website_management_events (
  id uuid primary key default gen_random_uuid(),
  website_site_id uuid not null,
  organisation_id uuid not null,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null check (action in (
    'domain_connected',
    'domain_verification_requested',
    'domain_verified',
    'domain_primary_changed',
    'domain_removed'
  )),
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint website_management_events_metadata_object_check check (jsonb_typeof(metadata_json) = 'object'),
  constraint website_management_events_site_organisation_fkey
    foreign key (website_site_id, organisation_id)
    references public.website_sites(id, organisation_id)
    on delete cascade
);

create index website_management_events_site_created_idx
  on public.website_management_events (website_site_id, created_at desc);
create index website_management_events_org_created_idx
  on public.website_management_events (organisation_id, created_at desc);

create or replace function public.website_reject_management_event_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Website management events are immutable.' using errcode = '55000';
end;
$$;

create trigger trg_website_management_events_immutable
before update or delete on public.website_management_events
for each row execute function public.website_reject_management_event_mutation();

alter table public.website_management_events enable row level security;
revoke all on table public.website_management_events from public, anon, authenticated, service_role;
grant select on table public.website_management_events to authenticated;
grant select, insert on table public.website_management_events to service_role;

create policy website_management_events_admin_select
on public.website_management_events
for select
to authenticated
using ((select public.bridge_is_org_admin(organisation_id)));

comment on table public.website_management_events is
  'Immutable, organisation-scoped website domain operation history. Metadata contains the hostname only, never DNS secrets or form data.';
