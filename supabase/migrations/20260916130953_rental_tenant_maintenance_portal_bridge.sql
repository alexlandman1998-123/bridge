begin;

-- A tenant opening a public portal link is authorised by a scoped, expiring
-- portal token rather than an auth.users session. Keep that provenance
-- explicit instead of incorrectly attributing the report to the staff member
-- who created the link.
alter table public.rental_maintenance_requests
  alter column reported_by drop not null,
  add column if not exists tenant_portal_token_id uuid references public.rental_tenant_portal_access_tokens(id) on delete set null,
  add column if not exists tenant_area text,
  add column if not exists tenant_access_preference text,
  add column if not exists tenant_availability text;

alter table public.rental_maintenance_requests
  drop constraint if exists rental_maintenance_requests_reporter_source_check;
alter table public.rental_maintenance_requests
  add constraint rental_maintenance_requests_reporter_source_check
  check (reported_by is not null or tenant_portal_token_id is not null);

create index if not exists rental_maintenance_requests_tenancy_reported_idx
  on public.rental_maintenance_requests (tenancy_id, reported_at desc);

create table if not exists public.rental_maintenance_tenant_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.rental_maintenance_requests(id) on delete cascade,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  event_type text not null check (event_type in ('submitted', 'status_updated', 'appointment', 'message', 'completion_requested', 'reopened')),
  tenant_visible_status text,
  tenant_message text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists rental_maintenance_tenant_events_request_idx
  on public.rental_maintenance_tenant_events (request_id, created_at desc);

alter table public.rental_maintenance_tenant_events enable row level security;
revoke all on public.rental_maintenance_tenant_events from anon, authenticated;
grant select, insert on public.rental_maintenance_tenant_events to authenticated;

create policy rental_maintenance_tenant_events_staff_access
  on public.rental_maintenance_tenant_events
  for all to authenticated
  using (
    exists (
      select 1
      from public.rental_maintenance_requests request
      join public.rental_properties property on property.id = request.property_id
      where request.id = rental_maintenance_tenant_events.request_id
        and public.rental_branch_access(property.organisation_id, property.branch_id)
    )
  )
  with check (
    exists (
      select 1
      from public.rental_maintenance_requests request
      join public.rental_properties property on property.id = request.property_id
      where request.id = rental_maintenance_tenant_events.request_id
        and public.rental_branch_access(property.organisation_id, property.branch_id)
    )
  );

commit;
