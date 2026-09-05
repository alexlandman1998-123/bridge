-- Rentals Phase 11: typed links to canonical documents and immutable activity projections.
-- This stores neither file contents nor a duplicate document/activity system.
begin;

create table if not exists public.rental_entity_documents (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  property_id uuid not null references public.rental_properties(id) on delete cascade,
  branch_id uuid references public.organisation_branches(id) on delete set null,
  entity_type text not null,
  entity_id uuid not null,
  document_id uuid not null,
  document_label text,
  document_category text,
  link_state text not null default 'linked',
  replaces_link_id uuid references public.rental_entity_documents(id) on delete set null,
  metadata_json jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint rental_entity_documents_entity_check check (entity_type in ('rental_property', 'rental_unit', 'rental_landlord', 'rental_mandate')),
  constraint rental_entity_documents_state_check check (link_state in ('linked', 'replaced', 'removed'))
);
create unique index if not exists rental_entity_documents_active_document_unique on public.rental_entity_documents(entity_type, entity_id, document_id) where link_state = 'linked';
create index if not exists rental_entity_documents_property_idx on public.rental_entity_documents(property_id, created_at desc);

create table if not exists public.rental_activity_projections (
  id uuid primary key default gen_random_uuid(),
  source_event_id text not null unique,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  property_id uuid not null references public.rental_properties(id) on delete cascade,
  branch_id uuid references public.organisation_branches(id) on delete set null,
  entity_type text not null,
  entity_id uuid not null,
  activity_type text not null,
  title text not null,
  description text,
  payload_json jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  projected_at timestamptz not null default now(),
  constraint rental_activity_projections_entity_check check (entity_type in ('rental_property', 'rental_unit', 'rental_landlord', 'rental_mandate')),
  constraint rental_activity_projections_payload_budget check (octet_length(payload_json::text) <= 8192)
);
create index if not exists rental_activity_projections_property_idx on public.rental_activity_projections(property_id, occurred_at desc);

create or replace function public.rental_evidence_validate_entity_scope()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare resolved_property uuid; resolved_org uuid; resolved_branch uuid;
begin
  if new.entity_type = 'rental_property' then select id, organisation_id, branch_id into resolved_property, resolved_org, resolved_branch from public.rental_properties where id = new.entity_id;
  elsif new.entity_type = 'rental_unit' then select property_id, organisation_id, branch_id into resolved_property, resolved_org, resolved_branch from public.rental_units where id = new.entity_id;
  elsif new.entity_type = 'rental_landlord' then select property_id, organisation_id, branch_id into resolved_property, resolved_org, resolved_branch from public.rental_property_landlords where id = new.entity_id;
  elsif new.entity_type = 'rental_mandate' then select property_id, organisation_id, branch_id into resolved_property, resolved_org, resolved_branch from public.rental_property_mandates where id = new.entity_id;
  end if;
  if resolved_property is null or resolved_property <> new.property_id or resolved_org <> new.organisation_id then raise exception 'Rental evidence entity must belong to its property and organisation'; end if;
  if new.branch_id is null then new.branch_id := resolved_branch; end if;
  if resolved_branch is not null and new.branch_id is distinct from resolved_branch then raise exception 'Rental evidence branch must match its property'; end if;
  return new;
end; $$;
drop trigger if exists trg_rental_entity_documents_scope on public.rental_entity_documents;
create trigger trg_rental_entity_documents_scope before insert on public.rental_entity_documents for each row execute function public.rental_evidence_validate_entity_scope();
drop trigger if exists trg_rental_activity_projections_scope on public.rental_activity_projections;
create trigger trg_rental_activity_projections_scope before insert on public.rental_activity_projections for each row execute function public.rental_evidence_validate_entity_scope();

alter table public.rental_entity_documents enable row level security;
alter table public.rental_activity_projections enable row level security;
revoke all on public.rental_entity_documents, public.rental_activity_projections from anon, authenticated;
grant select, insert on public.rental_entity_documents to authenticated;
grant select on public.rental_activity_projections to authenticated;

drop policy if exists rental_entity_documents_select_scoped on public.rental_entity_documents;
create policy rental_entity_documents_select_scoped on public.rental_entity_documents for select to authenticated using (exists (select 1 from public.rental_properties property where property.id = property_id and public.rental_branch_access(property.organisation_id, property.branch_id)));
drop policy if exists rental_entity_documents_insert_scoped on public.rental_entity_documents;
create policy rental_entity_documents_insert_scoped on public.rental_entity_documents for insert to authenticated with check (exists (select 1 from public.rental_properties property where property.id = property_id and public.rental_branch_access(property.organisation_id, property.branch_id) and (public.bridge_is_org_admin(property.organisation_id) or property.assigned_manager_id = (select auth.uid()) or property.created_by = (select auth.uid()))));
drop policy if exists rental_activity_projections_select_scoped on public.rental_activity_projections;
create policy rental_activity_projections_select_scoped on public.rental_activity_projections for select to authenticated using (exists (select 1 from public.rental_properties property where property.id = property_id and public.rental_branch_access(property.organisation_id, property.branch_id)));
commit;
