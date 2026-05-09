begin;

create table if not exists public.private_listing_document_requirements (
  id uuid primary key default gen_random_uuid(),
  private_listing_id uuid not null references public.private_listings(id) on delete cascade,
  requirement_key text not null,
  requirement_name text not null,
  requirement_description text,
  requirement_group text not null,
  document_visibility text not null default 'internal',
  status text not null default 'required',
  is_required boolean not null default true,
  generated_from jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint private_listing_document_requirements_status_check check (
    status in ('required', 'requested', 'uploaded', 'under_review', 'rejected', 'approved', 'completed', 'not_applicable')
  ),
  constraint private_listing_document_requirements_group_check check (
    requirement_group in (
      'seller_identity',
      'fica',
      'marital',
      'company',
      'trust',
      'property',
      'financial',
      'mandate',
      'compliance',
      'marketing'
    )
  ),
  constraint private_listing_document_requirements_visibility_check check (
    document_visibility in ('internal', 'seller_visible', 'shared_role_players')
  )
);

create unique index if not exists private_listing_document_requirements_listing_key_unique_idx
  on public.private_listing_document_requirements(private_listing_id, requirement_key);
create index if not exists private_listing_document_requirements_listing_idx
  on public.private_listing_document_requirements(private_listing_id, requirement_group);
create index if not exists private_listing_document_requirements_status_idx
  on public.private_listing_document_requirements(status);

create table if not exists public.private_listing_documents (
  id uuid primary key default gen_random_uuid(),
  private_listing_id uuid not null references public.private_listings(id) on delete cascade,
  requirement_id uuid references public.private_listing_document_requirements(id) on delete set null,
  document_type text,
  document_name text,
  storage_path text,
  file_url text,
  uploaded_by uuid references auth.users(id) on delete set null,
  status text not null default 'uploaded',
  visibility text not null default 'internal',
  uploaded_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint private_listing_documents_status_check check (
    status in ('required', 'requested', 'uploaded', 'under_review', 'rejected', 'approved', 'completed', 'not_applicable')
  ),
  constraint private_listing_documents_visibility_check check (
    visibility in ('internal', 'seller_visible', 'shared_role_players')
  )
);

create index if not exists private_listing_documents_listing_idx
  on public.private_listing_documents(private_listing_id, uploaded_at desc);
create index if not exists private_listing_documents_requirement_idx
  on public.private_listing_documents(requirement_id);
create index if not exists private_listing_documents_status_idx
  on public.private_listing_documents(status);

drop trigger if exists trg_private_listing_document_requirements_updated_at on public.private_listing_document_requirements;
create trigger trg_private_listing_document_requirements_updated_at
before update on public.private_listing_document_requirements
for each row execute function public.bridge_private_listing_set_updated_at();

drop trigger if exists trg_private_listing_documents_updated_at on public.private_listing_documents;
create trigger trg_private_listing_documents_updated_at
before update on public.private_listing_documents
for each row execute function public.bridge_private_listing_set_updated_at();

alter table if exists public.private_listing_document_requirements enable row level security;
alter table if exists public.private_listing_documents enable row level security;

drop policy if exists private_listing_document_requirements_select_member on public.private_listing_document_requirements;
create policy private_listing_document_requirements_select_member
on public.private_listing_document_requirements
for select
to authenticated
using (
  exists (
    select 1
    from public.private_listings pl
    where pl.id = private_listing_id
      and public.bridge_is_active_member(pl.organisation_id)
  )
);

drop policy if exists private_listing_document_requirements_mutate_member on public.private_listing_document_requirements;
create policy private_listing_document_requirements_mutate_member
on public.private_listing_document_requirements
for all
to authenticated
using (
  exists (
    select 1
    from public.private_listings pl
    where pl.id = private_listing_id
      and (
        public.bridge_is_org_admin(pl.organisation_id)
        or pl.assigned_agent_id = auth.uid()
        or pl.created_by = auth.uid()
      )
  )
)
with check (
  exists (
    select 1
    from public.private_listings pl
    where pl.id = private_listing_id
      and (
        public.bridge_is_org_admin(pl.organisation_id)
        or pl.assigned_agent_id = auth.uid()
        or pl.created_by = auth.uid()
      )
  )
);

drop policy if exists private_listing_documents_select_member on public.private_listing_documents;
create policy private_listing_documents_select_member
on public.private_listing_documents
for select
to authenticated
using (
  exists (
    select 1
    from public.private_listings pl
    where pl.id = private_listing_id
      and public.bridge_is_active_member(pl.organisation_id)
  )
);

drop policy if exists private_listing_documents_mutate_member on public.private_listing_documents;
create policy private_listing_documents_mutate_member
on public.private_listing_documents
for all
to authenticated
using (
  exists (
    select 1
    from public.private_listings pl
    where pl.id = private_listing_id
      and (
        public.bridge_is_org_admin(pl.organisation_id)
        or pl.assigned_agent_id = auth.uid()
        or pl.created_by = auth.uid()
      )
  )
)
with check (
  exists (
    select 1
    from public.private_listings pl
    where pl.id = private_listing_id
      and (
        public.bridge_is_org_admin(pl.organisation_id)
        or pl.assigned_agent_id = auth.uid()
        or pl.created_by = auth.uid()
      )
  )
);

grant select, insert, update on public.private_listing_document_requirements to authenticated;
grant select, insert, update on public.private_listing_documents to authenticated;

commit;

