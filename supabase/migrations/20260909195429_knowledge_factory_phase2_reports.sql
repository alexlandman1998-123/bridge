begin;

-- Report requests deliberately retain only the non-personal property summary
-- needed for canvassing. Supplier payloads, owners, buyers, sellers, bonds,
-- identity details and credit data are never persisted here.
create table public.knowledge_factory_report_requests (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete restrict,
  actor_id uuid not null references auth.users(id) on delete restrict,
  property_id bigint not null check (property_id > 0),
  requested_report_types text[] not null,
  request_purpose text not null check (length(btrim(request_purpose)) between 10 and 500),
  status text not null default 'quoted' check (status in ('quoted', 'submitted', 'ready', 'failed', 'expired')),
  quote_expires_at timestamptz not null default (now() + interval '15 minutes'),
  confirmed_at timestamptz,
  field_cost integer check (field_cost is null or field_cost >= 0),
  type_cost integer check (type_cost is null or type_cost >= 0),
  price_surcharge integer check (price_surcharge is null or price_surcharge >= 0),
  credits_consumed integer check (credits_consumed is null or credits_consumed >= 0),
  vendor_request_id text,
  report_summary jsonb,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint knowledge_factory_report_requests_types_check check (
    requested_report_types <@ array['property_summary', 'municipal_valuation']::text[]
    and cardinality(requested_report_types) > 0
  ),
  constraint knowledge_factory_report_requests_confirmation_check check (
    (status = 'quoted' and confirmed_at is null)
    or (status <> 'quoted' and confirmed_at is not null)
  ),
  constraint knowledge_factory_report_requests_summary_check check (
    report_summary is null or jsonb_typeof(report_summary) = 'object'
  )
);

create index knowledge_factory_report_requests_organisation_created_idx
  on public.knowledge_factory_report_requests (organisation_id, created_at desc);
create index knowledge_factory_report_requests_actor_created_idx
  on public.knowledge_factory_report_requests (actor_id, created_at desc);

alter table public.knowledge_factory_report_requests enable row level security;
revoke all on public.knowledge_factory_report_requests from anon, authenticated;
grant select on public.knowledge_factory_report_requests to authenticated;

create policy knowledge_factory_report_requests_read
on public.knowledge_factory_report_requests
for select to authenticated
using (
  actor_id = (select auth.uid())
  or public.knowledge_factory_is_active_member(
    organisation_id,
    array['principal', 'owner', 'director', 'admin', 'super_admin', 'agency_admin']
  )
);

commit;
