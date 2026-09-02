set statement_timeout = '30s';
set lock_timeout = '5s';

-- SQL counterpart of src/lib/stages.js. The application parity test locks the
-- JavaScript and database mappings together so aliases cannot drift again.
create or replace function public.bridge_normalize_transaction_stage(p_stage text)
returns text
language sql
immutable
parallel safe
strict
set search_path = ''
as $$
  select case regexp_replace(lower(btrim(p_stage)), '[\s/_-]+', ' ', 'g')
    when 'available' then 'Available'
    when 'avail' then 'Available'
    when 'reserved' then 'Reserved'
    when 'offer accepted' then 'Offer Accepted'
    when 'otp signed' then 'OTP Signed'
    when 'otp' then 'OTP Signed'
    when 'signed otp' then 'OTP Signed'
    when 'offer to purchase signed' then 'OTP Signed'
    when 'deposit' then 'Deposit'
    when 'deposit paid' then 'Deposit Paid'
    when 'dep' then 'Deposit Paid'
    when 'finance' then 'Finance'
    when 'finance in progress' then 'Finance'
    when 'finance pending' then 'Finance Pending'
    when 'fin' then 'Finance Pending'
    when 'bond approved proof of funds' then 'Bond Approved / Proof of Funds'
    when 'bond approved' then 'Bond Approved / Proof of Funds'
    when 'proof of funds' then 'Bond Approved / Proof of Funds'
    when 'proceed to attorneys' then 'Proceed to Attorneys'
    when 'atty' then 'Proceed to Attorneys'
    when 'legal preparation' then 'Proceed to Attorneys'
    when 'transfer preparation' then 'Proceed to Attorneys'
    when 'with attorneys' then 'Proceed to Attorneys'
    when 'transfer' then 'Transfer'
    when 'transfer in progress' then 'Transfer in Progress'
    when 'xfer' then 'Transfer in Progress'
    when 'transfer lodged' then 'Transfer Lodged'
    when 'registration' then 'Registration'
    when 'registered' then 'Registered'
    when 'reg' then 'Registered'
    else null
  end
$$;

comment on function public.bridge_normalize_transaction_stage(text) is
  'Canonical transaction stage mapper shared with the application stage contract.';

-- Backfill through the mapper before enforcing canonical-only writes. Unknown
-- values are not guessed: the migration stops and reports them for review.
do $$
declare
  unknown_stages text;
begin
  select string_agg(distinct quote_literal(stage), ', ' order by quote_literal(stage))
    into unknown_stages
  from public.transactions
  where stage is not null
    and public.bridge_normalize_transaction_stage(stage) is null;

  if unknown_stages is not null then
    raise exception 'Unknown transaction stages require an explicit mapping: %', unknown_stages;
  end if;
end
$$;

update public.transactions
set stage = public.bridge_normalize_transaction_stage(stage)
where stage is not null
  and stage is distinct from public.bridge_normalize_transaction_stage(stage);

alter table public.transactions
  drop constraint if exists transactions_stage_check;

alter table public.transactions
  add constraint transactions_stage_check
  check (
    stage is null
    or (
      public.bridge_normalize_transaction_stage(stage) is not null
      and stage = public.bridge_normalize_transaction_stage(stage)
    )
  ) not valid;

alter table public.transactions
  validate constraint transactions_stage_check;
