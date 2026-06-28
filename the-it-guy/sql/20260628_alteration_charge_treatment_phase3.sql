alter table if exists alteration_requests
  add column if not exists charge_treatment text not null default 'included_in_purchase_price';

update alteration_requests
set charge_treatment = coalesce(nullif(charge_treatment, ''), 'included_in_purchase_price');
