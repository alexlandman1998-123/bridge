create table if not exists public.transaction_referral_incentives (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid references public.organisations(id) on delete set null,
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  incentive_type text not null default 'referral_incentive',
  referring_agency_id uuid references public.organisations(id) on delete set null,
  referring_agency_name text,
  referring_agent_id uuid references public.profiles(id) on delete set null,
  referring_agent_name text,
  referring_agent_email text,
  amount_excl_vat numeric(14, 2),
  vat_rate numeric(7, 4) not null default 15,
  vat_amount numeric(14, 2),
  amount_incl_vat numeric(14, 2),
  qualifying_event text not null default 'grant_accepted'
    check (qualifying_event in ('application_submitted', 'quote_received', 'grant_issued', 'grant_accepted', 'attorney_instructed', 'bond_lodged', 'bond_registered', 'manual')),
  status text not null default 'pending'
    check (status in ('pending', 'eligible', 'approved', 'paid', 'reconciled', 'cancelled')),
  invoice_status text not null default 'not_ready'
    check (invoice_status in ('not_ready', 'ready_to_invoice', 'invoiced', 'cancelled')),
  invoice_trigger_event text not null default 'bond_lodged'
    check (invoice_trigger_event in ('application_submitted', 'quote_received', 'grant_issued', 'grant_accepted', 'attorney_instructed', 'bond_lodged', 'bond_registered', 'manual')),
  invoice_ready_at timestamptz,
  invoice_ready_by uuid references public.profiles(id) on delete set null,
  invoice_ready_reason text,
  invoice_issued_at timestamptz,
  invoice_reference text,
  invoice_notes text,
  expected_payout_date date,
  payout_method text not null default 'EFT',
  payable_to text,
  account_holder text,
  bank_name text,
  account_number text,
  branch_code text,
  payment_reference text,
  paid_amount numeric(14, 2),
  paid_at timestamptz,
  approved_at timestamptz,
  approved_by uuid references public.profiles(id) on delete set null,
  reconciled_at timestamptz,
  reconciled_by uuid references public.profiles(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (transaction_id)
);

create table if not exists public.transaction_referral_incentive_events (
  id uuid primary key default gen_random_uuid(),
  incentive_id uuid not null references public.transaction_referral_incentives(id) on delete cascade,
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  event_type text not null,
  previous_status text,
  new_status text,
  previous_value jsonb,
  new_value jsonb,
  actor_user_id uuid references public.profiles(id) on delete set null,
  actor_display_name text,
  actor_role text,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists transaction_referral_incentives_org_status_idx
  on public.transaction_referral_incentives (organisation_id, status, created_at desc);

create index if not exists transaction_referral_incentives_transaction_idx
  on public.transaction_referral_incentives (transaction_id);

create index if not exists transaction_referral_incentive_events_incentive_idx
  on public.transaction_referral_incentive_events (incentive_id, created_at desc);

create index if not exists transaction_referral_incentive_events_transaction_idx
  on public.transaction_referral_incentive_events (transaction_id, created_at desc);

drop trigger if exists trg_transaction_referral_incentives_updated_at on public.transaction_referral_incentives;
create trigger trg_transaction_referral_incentives_updated_at
before update on public.transaction_referral_incentives
for each row
execute function public.set_updated_at_timestamp();

alter table public.transaction_referral_incentives enable row level security;
alter table public.transaction_referral_incentive_events enable row level security;

drop policy if exists transaction_referral_incentives_select_member on public.transaction_referral_incentives;
create policy transaction_referral_incentives_select_member
on public.transaction_referral_incentives
for select
to authenticated
using (organisation_id is null or public.bridge_is_active_member(organisation_id));

drop policy if exists transaction_referral_incentives_write_member on public.transaction_referral_incentives;
create policy transaction_referral_incentives_write_member
on public.transaction_referral_incentives
for all
to authenticated
using (organisation_id is null or public.bridge_is_active_member(organisation_id))
with check (organisation_id is null or public.bridge_is_active_member(organisation_id));

drop policy if exists transaction_referral_incentive_events_select_member on public.transaction_referral_incentive_events;
create policy transaction_referral_incentive_events_select_member
on public.transaction_referral_incentive_events
for select
to authenticated
using (
  exists (
    select 1
    from public.transaction_referral_incentives incentive
    where incentive.id = transaction_referral_incentive_events.incentive_id
      and (incentive.organisation_id is null or public.bridge_is_active_member(incentive.organisation_id))
  )
);

drop policy if exists transaction_referral_incentive_events_write_member on public.transaction_referral_incentive_events;
create policy transaction_referral_incentive_events_write_member
on public.transaction_referral_incentive_events
for all
to authenticated
using (
  exists (
    select 1
    from public.transaction_referral_incentives incentive
    where incentive.id = transaction_referral_incentive_events.incentive_id
      and (incentive.organisation_id is null or public.bridge_is_active_member(incentive.organisation_id))
  )
)
with check (
  exists (
    select 1
    from public.transaction_referral_incentives incentive
    where incentive.id = transaction_referral_incentive_events.incentive_id
      and (incentive.organisation_id is null or public.bridge_is_active_member(incentive.organisation_id))
  )
);

grant select, insert, update, delete on table public.transaction_referral_incentives to authenticated;
grant select, insert, update, delete on table public.transaction_referral_incentive_events to authenticated;
