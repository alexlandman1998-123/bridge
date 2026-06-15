-- Ensure dashboard transaction projections match the columns the app reads.
-- This is intentionally additive and nullable so older workspaces can load
-- without 400/404 schema-cache errors while newer lifecycle data keeps working.

do $$
begin
  if to_regclass('public.transactions') is not null then
    alter table public.transactions
      add column if not exists assigned_branch_id uuid,
      add column if not exists transaction_type text,
      add column if not exists listing_id uuid,
      add column if not exists development_id uuid,
      add column if not exists development_name text,
      add column if not exists listing_title text,
      add column if not exists property_title text,
      add column if not exists unit_number text,
      add column if not exists buyer_name text,
      add column if not exists purchaser_name text,
      add column if not exists client_name text,
      add column if not exists cash_amount numeric,
      add column if not exists bond_amount numeric,
      add column if not exists expected_transfer_date date,
      add column if not exists registration_date date,
      add column if not exists registered_at timestamptz,
      add column if not exists completed_at timestamptz,
      add column if not exists cancelled_at timestamptz,
      add column if not exists archived_at timestamptz,
      add column if not exists last_meaningful_activity_at timestamptz,
      add column if not exists assigned_attorney_email text,
      add column if not exists attorney_stage text,
      add column if not exists operational_state text,
      add column if not exists waiting_on_role text,
      add column if not exists next_action text,
      add column if not exists property_address_line_1 text,
      add column if not exists suburb text,
      add column if not exists city text,
      add column if not exists gross_commission_percentage numeric,
      add column if not exists gross_commission_amount numeric,
      add column if not exists agent_commission_amount numeric,
      add column if not exists agency_commission_amount numeric;

    create index if not exists transactions_assigned_branch_id_idx
      on public.transactions (assigned_branch_id);

    create index if not exists transactions_listing_id_idx
      on public.transactions (listing_id);
  end if;
end $$;
create table if not exists public.transaction_commissions (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid,
  transaction_id uuid,
  assigned_agent_id uuid,
  assigned_agent_email text,
  gross_commission_amount numeric,
  agency_commission_amount numeric,
  agent_commission_amount numeric,
  status text default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists transaction_commissions_organisation_id_idx
  on public.transaction_commissions (organisation_id);
create index if not exists transaction_commissions_transaction_id_idx
  on public.transaction_commissions (transaction_id);
grant select, insert, update, delete on public.transaction_commissions to authenticated;
grant select on public.transaction_commissions to anon;
