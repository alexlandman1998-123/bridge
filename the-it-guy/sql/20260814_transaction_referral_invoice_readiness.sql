do $$
declare
  constraint_name text;
begin
  if to_regclass('public.transaction_referral_incentives') is null then
    return;
  end if;

  select conname into constraint_name
  from pg_constraint
  where conrelid = to_regclass('public.transaction_referral_incentives')
    and contype = 'c'
    and pg_get_constraintdef(oid) like '%qualifying_event%'
  limit 1;

  if constraint_name is not null then
    execute format('alter table public.transaction_referral_incentives drop constraint %I', constraint_name);
  end if;

  alter table public.transaction_referral_incentives
    add constraint transaction_referral_incentives_qualifying_event_check check (
      qualifying_event in (
        'application_submitted',
        'quote_received',
        'grant_issued',
        'grant_accepted',
        'attorney_instructed',
        'bond_lodged',
        'bond_registered',
        'manual'
      )
    );
end $$;

do $$
begin
  if to_regclass('public.transaction_referral_incentives') is null then
    return;
  end if;

  alter table public.transaction_referral_incentives
    add column if not exists invoice_status text not null default 'not_ready',
    add column if not exists invoice_trigger_event text not null default 'bond_lodged',
    add column if not exists invoice_ready_at timestamptz,
    add column if not exists invoice_ready_by uuid references public.profiles(id) on delete set null,
    add column if not exists invoice_ready_reason text,
    add column if not exists invoice_issued_at timestamptz,
    add column if not exists invoice_reference text,
    add column if not exists invoice_notes text;
end $$;

do $$
declare
  constraint_name text;
begin
  if to_regclass('public.transaction_referral_incentives') is null then
    return;
  end if;

  select conname into constraint_name
  from pg_constraint
  where conrelid = to_regclass('public.transaction_referral_incentives')
    and contype = 'c'
    and pg_get_constraintdef(oid) like '%invoice_status%'
  limit 1;

  if constraint_name is not null then
    execute format('alter table public.transaction_referral_incentives drop constraint %I', constraint_name);
  end if;

  alter table public.transaction_referral_incentives
    add constraint transaction_referral_incentives_invoice_status_check check (
      invoice_status in ('not_ready', 'ready_to_invoice', 'invoiced', 'cancelled')
    );
end $$;

do $$
declare
  constraint_name text;
begin
  if to_regclass('public.transaction_referral_incentives') is null then
    return;
  end if;

  select conname into constraint_name
  from pg_constraint
  where conrelid = to_regclass('public.transaction_referral_incentives')
    and contype = 'c'
    and pg_get_constraintdef(oid) like '%invoice_trigger_event%'
  limit 1;

  if constraint_name is not null then
    execute format('alter table public.transaction_referral_incentives drop constraint %I', constraint_name);
  end if;

  alter table public.transaction_referral_incentives
    add constraint transaction_referral_incentives_invoice_trigger_event_check check (
      invoice_trigger_event in (
        'application_submitted',
        'quote_received',
        'grant_issued',
        'grant_accepted',
        'attorney_instructed',
        'bond_lodged',
        'bond_registered',
        'manual'
      )
    );
end $$;

do $$
begin
  if to_regclass('public.transaction_referral_incentives') is null then
    return;
  end if;

  create index if not exists transaction_referral_incentives_invoice_status_idx
    on public.transaction_referral_incentives (organisation_id, invoice_status, invoice_ready_at desc);
end $$;
