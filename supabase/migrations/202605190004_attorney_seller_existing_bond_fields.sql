-- Adds seller existing-bond capture fields used to decide whether a
-- conveyancing matter needs a cancellation workflow lane. These are nullable
-- and intentionally isolated from existing transaction workflow logic.

alter table if exists public.private_listing_seller_onboarding
  add column if not exists seller_has_existing_bond boolean not null default false,
  add column if not exists current_bond_bank text,
  add column if not exists current_bond_account_number text,
  add column if not exists estimated_settlement_amount numeric,
  add column if not exists cancellation_attorney_id uuid,
  add column if not exists cancellation_firm_id uuid;
alter table if exists public.transactions
  add column if not exists seller_has_existing_bond boolean not null default false,
  add column if not exists current_bond_bank text,
  add column if not exists current_bond_account_number text,
  add column if not exists estimated_settlement_amount numeric,
  add column if not exists cancellation_attorney_id uuid,
  add column if not exists cancellation_firm_id uuid;
create index if not exists transactions_seller_existing_bond_idx
  on public.transactions (seller_has_existing_bond)
  where seller_has_existing_bond = true;
