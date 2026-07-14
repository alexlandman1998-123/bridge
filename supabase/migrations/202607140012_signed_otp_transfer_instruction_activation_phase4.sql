begin;

alter table if exists public.private_listing_role_players
  add column if not exists transaction_id uuid references public.transactions(id) on delete set null,
  add column if not exists instructed_at timestamptz,
  add column if not exists instruction_source text;

create index if not exists private_listing_role_players_transaction_idx
  on public.private_listing_role_players(transaction_id)
  where transaction_id is not null;

create or replace function public.bridge_activate_mandate_attorney_on_signed_otp()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if lower(coalesce(new.onboarding_status, '')) not in ('signed_otp_received', 'otp_uploaded') then
    return new;
  end if;

  if new.listing_id is null then
    return new;
  end if;

  update public.private_listing_role_players allocation
  set
    allocation_status = 'instructed',
    transaction_id = new.id,
    instructed_at = coalesce(allocation.instructed_at, now()),
    instruction_source = coalesce(allocation.instruction_source, 'signed_otp_received'),
    updated_at = now()
  where allocation.private_listing_id = new.listing_id
    and allocation.role_type = 'transfer_attorney'
    and allocation.allocation_status in ('awaiting_buyer', 'under_offer', 'instructed');

  return new;
end;
$$;

drop trigger if exists trg_activate_mandate_attorney_on_signed_otp on public.transactions;
create trigger trg_activate_mandate_attorney_on_signed_otp
after insert or update of onboarding_status
on public.transactions
for each row
execute function public.bridge_activate_mandate_attorney_on_signed_otp();

update public.private_listing_role_players allocation
set
  allocation_status = 'instructed',
  transaction_id = tx.id,
  instructed_at = coalesce(allocation.instructed_at, tx.last_meaningful_activity_at, tx.updated_at, now()),
  instruction_source = coalesce(allocation.instruction_source, 'phase4_backfill'),
  updated_at = now()
from public.transactions tx
where tx.listing_id = allocation.private_listing_id
  and lower(coalesce(tx.onboarding_status, '')) in ('signed_otp_received', 'otp_uploaded')
  and allocation.role_type = 'transfer_attorney'
  and allocation.allocation_status in ('awaiting_buyer', 'under_offer', 'instructed');

comment on column public.private_listing_role_players.transaction_id is
  'The buyer transaction that converted the mandate allocation into a formal transfer instruction.';

comment on column public.private_listing_role_players.instructed_at is
  'Set only after a signed/accepted OTP activates the formal transfer instruction.';

commit;
