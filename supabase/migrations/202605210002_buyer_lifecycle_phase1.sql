-- Phase 1 buyer lifecycle canonicalisation foundation.
-- This migration creates the canonical offers table and adds relationship
-- columns needed to keep buyer lead, offer, and transaction linkage durable.

create table if not exists public.offers (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  buyer_lead_id uuid references public.leads(lead_id) on delete set null,
  buyer_contact_id uuid references public.contacts(id) on delete set null,
  listing_id uuid,
  seller_lead_id uuid references public.leads(lead_id) on delete set null,
  agent_id uuid references public.profiles(id) on delete set null,
  viewing_appointment_id uuid references public.appointments(appointment_id) on delete set null,
  status text not null default 'draft',
  offer_amount numeric(14, 2),
  deposit_amount numeric(14, 2),
  finance_type text,
  cash_component numeric(14, 2),
  bond_component numeric(14, 2),
  conditions_json jsonb not null default '{}'::jsonb,
  expiry_date date,
  submitted_at timestamptz,
  accepted_at timestamptz,
  rejected_at timestamptz,
  transaction_id uuid references public.transactions(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint offers_status_check check (
    status in (
      'draft',
      'submitted',
      'under_review',
      'countered',
      'accepted',
      'rejected',
      'withdrawn',
      'expired',
      'converted_to_transaction'
    )
  )
);

create index if not exists offers_organisation_status_idx
  on public.offers (organisation_id, status, updated_at desc);

create index if not exists offers_buyer_lead_idx
  on public.offers (buyer_lead_id, updated_at desc);

create index if not exists offers_buyer_contact_idx
  on public.offers (buyer_contact_id, updated_at desc);

create index if not exists offers_listing_idx
  on public.offers (listing_id, updated_at desc);

create index if not exists offers_viewing_appointment_idx
  on public.offers (viewing_appointment_id);

create index if not exists offers_transaction_idx
  on public.offers (transaction_id);

create or replace function public.bridge_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists offers_set_updated_at on public.offers;
create trigger offers_set_updated_at
before update on public.offers
for each row
execute function public.bridge_set_updated_at();

alter table if exists public.leads
  add column if not exists lead_type text,
  add column if not exists current_stage text,
  add column if not exists converted_transaction_id uuid references public.transactions(id) on delete set null,
  add column if not exists converted_at timestamptz;

alter table if exists public.transactions
  add column if not exists accepted_offer_id uuid references public.offers(id) on delete set null,
  add column if not exists originating_buyer_lead_id uuid references public.leads(lead_id) on delete set null,
  add column if not exists buyer_contact_id uuid references public.contacts(id) on delete set null,
  add column if not exists listing_id uuid;

alter table if exists public.offers enable row level security;

drop policy if exists offers_org_members_select on public.offers;
create policy offers_org_members_select
  on public.offers
  for select
  using (
    exists (
      select 1
      from public.organisation_memberships om
      where om.organisation_id = offers.organisation_id
        and om.user_id = auth.uid()
    )
  );

drop policy if exists offers_org_members_insert on public.offers;
create policy offers_org_members_insert
  on public.offers
  for insert
  with check (
    exists (
      select 1
      from public.organisation_memberships om
      where om.organisation_id = offers.organisation_id
        and om.user_id = auth.uid()
    )
  );

drop policy if exists offers_org_members_update on public.offers;
create policy offers_org_members_update
  on public.offers
  for update
  using (
    exists (
      select 1
      from public.organisation_memberships om
      where om.organisation_id = offers.organisation_id
        and om.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.organisation_memberships om
      where om.organisation_id = offers.organisation_id
        and om.user_id = auth.uid()
    )
  );
