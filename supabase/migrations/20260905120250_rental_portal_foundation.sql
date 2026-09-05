-- Rental tenant and landlord portals are accessed only through token-validated
-- server endpoints. Keep portal-token rows and submitted requests unavailable to
-- anon/authenticated Data API callers; the endpoints use the service role after
-- validating the hashed, expiring token.

-- This helper originated in the unmanaged Rental foundation SQL. Keep this
-- definition here so the portal migration remains executable wherever the
-- managed migration history is the source of truth.
create or replace function public.rental_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create table if not exists public.rental_tenant_portal_access_tokens (
  id uuid primary key default gen_random_uuid(),
  tenancy_id uuid not null references public.rental_tenancies(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  last_accessed_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists rental_tenant_portal_access_lookup_idx
  on public.rental_tenant_portal_access_tokens (token_hash)
  where revoked_at is null;

create table if not exists public.rental_tenant_portal_requests (
  id uuid primary key default gen_random_uuid(),
  tenancy_id uuid not null references public.rental_tenancies(id) on delete cascade,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  request_type text not null check (request_type in ('maintenance', 'access', 'general')),
  message text not null check (char_length(message) between 10 and 4000),
  status text not null default 'submitted' check (status in ('submitted', 'acknowledged', 'closed')),
  submitted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists rental_tenant_portal_requests_tenancy_idx
  on public.rental_tenant_portal_requests (tenancy_id, submitted_at desc);

create table if not exists public.rental_landlord_portal_access (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.rental_properties(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  last_accessed_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists rental_landlord_portal_access_lookup_idx
  on public.rental_landlord_portal_access (token_hash)
  where revoked_at is null;

create table if not exists public.rental_landlord_portal_decisions (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.rental_properties(id) on delete cascade,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  decision_type text not null check (decision_type in ('maintenance_approval', 'listing_instruction', 'general')),
  message text not null check (char_length(message) between 10 and 4000),
  status text not null default 'submitted' check (status in ('submitted', 'acknowledged', 'closed')),
  submitted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists rental_landlord_portal_decisions_property_idx
  on public.rental_landlord_portal_decisions (property_id, submitted_at desc);

alter table public.rental_tenant_portal_access_tokens enable row level security;
alter table public.rental_tenant_portal_requests enable row level security;
alter table public.rental_landlord_portal_access enable row level security;
alter table public.rental_landlord_portal_decisions enable row level security;

revoke all on table public.rental_tenant_portal_access_tokens,
  public.rental_tenant_portal_requests,
  public.rental_landlord_portal_access,
  public.rental_landlord_portal_decisions from anon, authenticated;

drop trigger if exists trg_rental_tenant_portal_requests_updated_at
  on public.rental_tenant_portal_requests;
create trigger trg_rental_tenant_portal_requests_updated_at
  before update on public.rental_tenant_portal_requests
  for each row execute function public.rental_set_updated_at();

drop trigger if exists trg_rental_landlord_portal_decisions_updated_at
  on public.rental_landlord_portal_decisions;
create trigger trg_rental_landlord_portal_decisions_updated_at
  before update on public.rental_landlord_portal_decisions
  for each row execute function public.rental_set_updated_at();
