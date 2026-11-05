-- The application already reads and writes this field. Replace the untracked
-- legacy schema patch with an append-only, additive migration; no data update.
alter table public.alteration_requests
 add column if not exists charge_treatment text not null default 'included_in_purchase_price';
