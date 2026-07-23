-- Release 1: explicit buyer consent before bond-originator contact or finance sharing.
create table if not exists public.bond_application_consents (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null unique references public.transactions(id) on delete cascade,
  organisation_id uuid references public.organisations(id) on delete set null,
  selection_source text not null check (selection_source in ('agency_partner', 'buyer_nominated', 'third_party')),
  nominated_originator_name text,
  nominated_originator_contact text,
  consent_version text not null,
  consented_at timestamptz not null,
  consented_by_role text not null default 'client',
  consent_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists bond_application_consents_organisation_idx
  on public.bond_application_consents (organisation_id, consented_at desc);

alter table public.bond_application_consents enable row level security;

drop policy if exists "buyer can manage own bond application consent" on public.bond_application_consents;
create policy "buyer can manage own bond application consent"
  on public.bond_application_consents
  for all
  using (
    exists (
      select 1 from public.transactions t
      where t.id = transaction_id and t.buyer_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.transactions t
      where t.id = transaction_id and t.buyer_id = auth.uid()
    )
  );

drop policy if exists "organisation members can read bond application consent" on public.bond_application_consents;
create policy "organisation members can read bond application consent"
  on public.bond_application_consents
  for select
  using (
    exists (
      select 1 from public.organisation_memberships membership
      where membership.organisation_id = bond_application_consents.organisation_id
        and membership.user_id = auth.uid()
        and membership.status = 'active'
    )
  );

create table if not exists public.bond_finance_document_access_audit (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  document_id uuid references public.documents(id) on delete set null,
  actor_user_id uuid,
  action text not null check (action in ('download_requested', 'download_issued', 'document_requested')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists bond_finance_document_access_audit_transaction_idx
  on public.bond_finance_document_access_audit (transaction_id, created_at desc);

alter table public.bond_finance_document_access_audit enable row level security;

drop policy if exists "organisation members can read bond finance document audit" on public.bond_finance_document_access_audit;
create policy "organisation members can read bond finance document audit"
  on public.bond_finance_document_access_audit
  for select
  using (
    exists (
      select 1 from public.transactions t
      join public.organisation_memberships membership on membership.organisation_id = t.organisation_id
      where t.id = transaction_id and membership.user_id = auth.uid() and membership.status = 'active'
    )
  );
