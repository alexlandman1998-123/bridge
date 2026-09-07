-- Deal Setup reads these additive fields on buyer transaction participants.
-- Older production schemas can have the Phase 1 buyer-party columns without
-- these later Phase 3 fields, causing the complete panel to remain loading.
alter table public.transaction_participants
  add column if not exists ownership_percentage numeric(5, 2),
  add column if not exists signing_required boolean not null default true;

alter table public.transaction_participants
  drop constraint if exists transaction_participants_buyer_ownership_percentage_check;
alter table public.transaction_participants
  add constraint transaction_participants_buyer_ownership_percentage_check
  check (ownership_percentage is null or (ownership_percentage >= 0 and ownership_percentage <= 100));

-- The workspace unit shell selects this field as part of the property summary.
alter table public.units
  add column if not exists property_title_type text;

notify pgrst, 'reload schema';
