alter table if exists development_settings
  add column if not exists reservation_deposit_amount_type text not null default 'fixed',
  add column if not exists reservation_deposit_treatment text not null default 'credited_to_purchase_price',
  add column if not exists reservation_deposit_payable_to text not null default 'developer',
  add column if not exists default_alteration_charge_treatment text not null default 'included_in_purchase_price';

update development_settings
set
  reservation_deposit_amount_type = coalesce(nullif(reservation_deposit_amount_type, ''), 'fixed'),
  reservation_deposit_treatment = coalesce(nullif(reservation_deposit_treatment, ''), 'credited_to_purchase_price'),
  reservation_deposit_payable_to = coalesce(nullif(reservation_deposit_payable_to, ''), 'developer'),
  default_alteration_charge_treatment = coalesce(nullif(default_alteration_charge_treatment, ''), 'included_in_purchase_price');
