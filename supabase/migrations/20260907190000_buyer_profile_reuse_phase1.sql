begin;

-- Phase 1: buyer-profile-first persistence.  The existing buyers row remains
-- the master identity/contact record; this table stores the reusable extended
-- onboarding payload without copying it into every transaction.
create table if not exists public.buyer_profile_data (
  buyer_id uuid primary key references public.buyers(id) on delete cascade,
  profile_data jsonb not null default '{}'::jsonb,
  profile_version integer not null default 1 check (profile_version > 0),
  policy_version text not null default 'buyer_profile_reuse_v1',
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- A reusable document has one profile-owned source.  The optional legacy
-- document link enables gradual adoption without copying existing files.
create table if not exists public.buyer_profile_documents (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null references public.buyers(id) on delete cascade,
  source_document_id uuid references public.documents(id) on delete set null,
  document_key text not null,
  document_name text not null default 'Buyer document',
  storage_bucket text,
  storage_path text,
  file_url text,
  mime_type text,
  content_sha256 text,
  source_version integer not null default 1 check (source_version > 0),
  policy_version text not null default 'buyer_profile_reuse_v1',
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (nullif(trim(storage_path), '') is not null or nullif(trim(file_url), '') is not null or source_document_id is not null)
);

create unique index if not exists buyer_profile_documents_buyer_key_uidx
  on public.buyer_profile_documents (buyer_id, document_key);
create index if not exists buyer_profile_documents_buyer_idx
  on public.buyer_profile_documents (buyer_id, document_key, updated_at desc);

-- Each transaction records exactly which buyer-profile version/document was
-- reused.  This is a usage receipt, not a copied FICA or onboarding payload.
create table if not exists public.transaction_buyer_profile_references (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  buyer_id uuid not null references public.buyers(id) on delete restrict,
  buyer_profile_document_id uuid references public.buyer_profile_documents(id) on delete restrict,
  profile_key text not null,
  source_kind text not null check (source_kind in ('profile_data', 'profile_document')),
  source_version integer not null check (source_version > 0),
  policy_version text not null default 'buyer_profile_reuse_v1',
  used_by uuid references public.profiles(id) on delete set null,
  used_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  check (
    (source_kind = 'profile_data' and buyer_profile_document_id is null)
    or (source_kind = 'profile_document' and buyer_profile_document_id is not null)
  )
);

create unique index if not exists transaction_buyer_profile_reference_uidx
  on public.transaction_buyer_profile_references (
    transaction_id,
    buyer_id,
    profile_key,
    source_kind,
    source_version,
    coalesce(buyer_profile_document_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );
create index if not exists transaction_buyer_profile_references_transaction_idx
  on public.transaction_buyer_profile_references (transaction_id, buyer_id, used_at desc);

-- Existing buyers are profile-ready immediately.  Their name/email/phone stay
-- canonical on buyers; profile_data contains the reusable extended form data.
insert into public.buyer_profile_data (buyer_id)
select id from public.buyers
on conflict (buyer_id) do nothing;

alter table public.buyer_profile_data enable row level security;
alter table public.buyer_profile_documents enable row level security;
alter table public.transaction_buyer_profile_references enable row level security;

drop policy if exists buyer_profile_data_member_scope on public.buyer_profile_data;
create policy buyer_profile_data_member_scope on public.buyer_profile_data
  for all to authenticated
  using (
    exists (
      select 1 from public.buyers buyer
      where buyer.id = buyer_profile_data.buyer_id
        and buyer.organisation_id is not null
        and public.bridge_is_active_member(buyer.organisation_id)
    )
  )
  with check (
    exists (
      select 1 from public.buyers buyer
      where buyer.id = buyer_profile_data.buyer_id
        and buyer.organisation_id is not null
        and public.bridge_is_active_member(buyer.organisation_id)
    )
  );

drop policy if exists buyer_profile_documents_member_scope on public.buyer_profile_documents;
create policy buyer_profile_documents_member_scope on public.buyer_profile_documents
  for all to authenticated
  using (
    exists (
      select 1 from public.buyers buyer
      where buyer.id = buyer_profile_documents.buyer_id
        and buyer.organisation_id is not null
        and public.bridge_is_active_member(buyer.organisation_id)
    )
  )
  with check (
    exists (
      select 1 from public.buyers buyer
      where buyer.id = buyer_profile_documents.buyer_id
        and buyer.organisation_id is not null
        and public.bridge_is_active_member(buyer.organisation_id)
    )
  );

drop policy if exists transaction_buyer_profile_references_spine_scope on public.transaction_buyer_profile_references;
create policy transaction_buyer_profile_references_spine_scope on public.transaction_buyer_profile_references
  for all to authenticated
  using (public.bridge_can_access_transaction_spine(transaction_id))
  with check (public.bridge_can_access_transaction_spine(transaction_id));

grant select, insert, update on public.buyer_profile_data to authenticated;
grant select, insert, update on public.buyer_profile_documents to authenticated;
grant select, insert on public.transaction_buyer_profile_references to authenticated;

notify pgrst, 'reload schema';
commit;
