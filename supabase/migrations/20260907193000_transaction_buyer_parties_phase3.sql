begin;

-- Phase 3 keeps each purchaser as a first-class participant while retaining
-- transactions.buyer_id as the compatibility primary-buyer bridge.
alter table if exists public.transaction_participants
  add column if not exists ownership_percentage numeric(5, 2),
  add column if not exists signing_required boolean not null default true;

alter table if exists public.transaction_participants
  drop constraint if exists transaction_participants_buyer_ownership_percentage_check;
alter table if exists public.transaction_participants
  add constraint transaction_participants_buyer_ownership_percentage_check
  check (ownership_percentage is null or (ownership_percentage >= 0 and ownership_percentage <= 100));

comment on column public.transaction_participants.ownership_percentage is
  'Optional beneficial ownership percentage for this buyer party in the transaction.';
comment on column public.transaction_participants.signing_required is
  'Whether this buyer party must sign or provide the transaction document pack.';

commit;
