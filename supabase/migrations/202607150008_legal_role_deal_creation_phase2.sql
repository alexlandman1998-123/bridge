-- Phase 2 legal-role deal creation captures lender facts without pretending
-- that a bank-appointed cancellation attorney has already been selected.

alter table if exists public.transactions
  add column if not exists cancellation_notice_status text not null default 'unknown',
  add column if not exists cancellation_notice_date date;
alter table if exists public.transactions
  drop constraint if exists transactions_cancellation_notice_status_check;
alter table if exists public.transactions
  add constraint transactions_cancellation_notice_status_check
  check (cancellation_notice_status in ('unknown', 'not_applicable', 'not_given', 'given'));
comment on column public.transactions.cancellation_notice_status is
  'Seller existing-bond 90-day notice state captured before the lender appoints a cancellation attorney.';
comment on column public.transactions.cancellation_notice_date is
  'Date the seller gave the existing lender cancellation notice, when known.';
-- Preserve historical manual cancellation selections, but make their authority
-- explicit so a later appointment workflow can request lender verification.
update public.transaction_role_players
set
  snapshot_json = coalesce(snapshot_json, '{}'::jsonb) || jsonb_build_object(
    'appointmentAuthority', 'legacy_manual',
    'requiresBankAppointmentVerification', true
  ),
  updated_at = now()
where role_type = 'cancellation_attorney'
  and coalesce(selection_source, '') not in ('bank_appointment', 'bank_panel_appointment')
  and removed_at is null;
