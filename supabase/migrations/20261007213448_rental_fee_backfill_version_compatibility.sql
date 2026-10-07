-- Apply immediately before 20261007194611 when historical applications exist.
-- Populate the same zero-fee snapshot while respecting the existing version guard.
-- Safe after the fee migration too: its normal backfill leaves no eligible rows.
alter table public.rental_applications
  add column if not exists cost_snapshot_json jsonb not null default '{}'::jsonb;
update public.rental_applications
set cost_snapshot_json = jsonb_build_object(
  'amount', 0, 'currency', 'ZAR', 'payableAfter', 'submission',
  'settingsVersion', 0, 'paymentInstructions', '', 'capturedAt', now()),
  version = version + 1
where status in ('draft', 'submitted', 'under_review')
  and cost_snapshot_json = '{}'::jsonb;
