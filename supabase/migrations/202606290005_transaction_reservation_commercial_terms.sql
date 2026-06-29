-- Store transaction-specific reservation and alteration commercial terms.
-- Development setup only supplies defaults; the signed transaction can differ.

alter table if exists public.transactions
  add column if not exists reservation_amount_type text,
  add column if not exists reservation_treatment text,
  add column if not exists reservation_payable_to text,
  add column if not exists alteration_charge_treatment text;

update public.transactions
set reservation_amount_type = 'fixed'
where reservation_required is true
  and reservation_amount_type is null;

update public.transactions
set reservation_treatment = 'credited_to_purchase_price'
where reservation_required is true
  and reservation_treatment is null;

update public.transactions
set reservation_payable_to = 'developer'
where reservation_required is true
  and reservation_payable_to is null;

update public.transactions
set alteration_charge_treatment = 'included_in_purchase_price'
where transaction_type = 'developer_sale'
  and alteration_charge_treatment is null;

alter table if exists public.transactions
  drop constraint if exists transactions_reservation_amount_type_check;
alter table if exists public.transactions
  add constraint transactions_reservation_amount_type_check
  check (
    reservation_amount_type is null
    or reservation_amount_type in ('fixed', 'percentage')
  );

alter table if exists public.transactions
  drop constraint if exists transactions_reservation_treatment_check;
alter table if exists public.transactions
  add constraint transactions_reservation_treatment_check
  check (
    reservation_treatment is null
    or reservation_treatment in ('credited_to_purchase_price', 'separate_invoice', 'refundable_hold')
  );

alter table if exists public.transactions
  drop constraint if exists transactions_reservation_payable_to_check;
alter table if exists public.transactions
  add constraint transactions_reservation_payable_to_check
  check (
    reservation_payable_to is null
    or reservation_payable_to in ('developer', 'agency_trust', 'attorney_trust')
  );

alter table if exists public.transactions
  drop constraint if exists transactions_alteration_charge_treatment_check;
alter table if exists public.transactions
  add constraint transactions_alteration_charge_treatment_check
  check (
    alteration_charge_treatment is null
    or alteration_charge_treatment in ('included_in_purchase_price', 'separate_invoice', 'no_charge')
  );
