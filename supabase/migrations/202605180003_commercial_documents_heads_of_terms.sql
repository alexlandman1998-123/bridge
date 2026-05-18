begin;

create extension if not exists "pgcrypto";

create table if not exists public.commercial_documents (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  entity_type text not null,
  entity_id uuid not null,
  document_name text not null,
  category text,
  status text not null default 'uploaded',
  notes text,
  file_name text,
  file_path text,
  file_bucket text default 'documents',
  file_size bigint,
  mime_type text,
  uploaded_by uuid references auth.users(id) on delete set null,
  uploaded_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  constraint commercial_documents_entity_type_not_blank check (length(trim(entity_type)) > 0),
  constraint commercial_documents_name_not_blank check (length(trim(document_name)) > 0)
);

create table if not exists public.commercial_document_requests (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  entity_type text not null,
  entity_id uuid not null,
  document_name text not null,
  category text,
  requested_from text,
  due_date date,
  notes text,
  status text not null default 'requested',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  constraint commercial_document_requests_entity_type_not_blank check (length(trim(entity_type)) > 0),
  constraint commercial_document_requests_name_not_blank check (length(trim(document_name)) > 0)
);

create table if not exists public.commercial_heads_of_terms (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  deal_id uuid not null references public.commercial_deals(id) on delete cascade,
  tenant_id uuid references public.commercial_tenants(id) on delete set null,
  landlord_id uuid references public.commercial_landlords(id) on delete set null,
  property_id uuid references public.commercial_properties(id) on delete set null,
  premises_description text,
  lease_commencement_date date,
  lease_term_months integer,
  monthly_rental numeric,
  rental_per_m2 numeric,
  escalation_percentage numeric,
  deposit_amount numeric,
  tenant_installation_allowance numeric,
  rent_free_period_months integer,
  beneficial_occupation_date date,
  permitted_use text,
  special_conditions text,
  broker_commission_notes text,
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null
);

create index if not exists commercial_documents_organisation_id_idx on public.commercial_documents (organisation_id);
create index if not exists commercial_documents_entity_idx on public.commercial_documents (entity_type, entity_id, created_at desc);
create index if not exists commercial_documents_status_idx on public.commercial_documents (status);
create index if not exists commercial_documents_category_idx on public.commercial_documents (category);

create index if not exists commercial_document_requests_organisation_id_idx on public.commercial_document_requests (organisation_id);
create index if not exists commercial_document_requests_entity_idx on public.commercial_document_requests (entity_type, entity_id, created_at desc);
create index if not exists commercial_document_requests_status_idx on public.commercial_document_requests (status);
create index if not exists commercial_document_requests_due_date_idx on public.commercial_document_requests (due_date);

create index if not exists commercial_heads_of_terms_organisation_id_idx on public.commercial_heads_of_terms (organisation_id);
create index if not exists commercial_heads_of_terms_deal_id_idx on public.commercial_heads_of_terms (deal_id);
create index if not exists commercial_heads_of_terms_status_idx on public.commercial_heads_of_terms (status);

drop trigger if exists trg_bridge_touch_commercial_documents_updated_at on public.commercial_documents;
create trigger trg_bridge_touch_commercial_documents_updated_at
before update on public.commercial_documents
for each row execute function public.bridge_touch_commercial_updated_at();

drop trigger if exists trg_bridge_touch_commercial_document_requests_updated_at on public.commercial_document_requests;
create trigger trg_bridge_touch_commercial_document_requests_updated_at
before update on public.commercial_document_requests
for each row execute function public.bridge_touch_commercial_updated_at();

drop trigger if exists trg_bridge_touch_commercial_heads_of_terms_updated_at on public.commercial_heads_of_terms;
create trigger trg_bridge_touch_commercial_heads_of_terms_updated_at
before update on public.commercial_heads_of_terms
for each row execute function public.bridge_touch_commercial_updated_at();

alter table public.commercial_documents enable row level security;
alter table public.commercial_document_requests enable row level security;
alter table public.commercial_heads_of_terms enable row level security;

drop policy if exists commercial_documents_member_access on public.commercial_documents;
create policy commercial_documents_member_access on public.commercial_documents
for all to authenticated
using (public.bridge_is_active_member(organisation_id))
with check (public.bridge_is_active_member(organisation_id));

drop policy if exists commercial_document_requests_member_access on public.commercial_document_requests;
create policy commercial_document_requests_member_access on public.commercial_document_requests
for all to authenticated
using (public.bridge_is_active_member(organisation_id))
with check (public.bridge_is_active_member(organisation_id));

drop policy if exists commercial_heads_of_terms_member_access on public.commercial_heads_of_terms;
create policy commercial_heads_of_terms_member_access on public.commercial_heads_of_terms
for all to authenticated
using (public.bridge_is_active_member(organisation_id))
with check (public.bridge_is_active_member(organisation_id));

grant select, insert, update, delete on public.commercial_documents to authenticated;
grant select, insert, update, delete on public.commercial_document_requests to authenticated;
grant select, insert, update, delete on public.commercial_heads_of_terms to authenticated;

commit;
