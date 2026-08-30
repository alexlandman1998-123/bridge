-- Rentals Phase 36: append-only subledger foundation. Recording commands arrive in Phases 37-40.
begin;

create table if not exists public.rental_financial_charges (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null references public.organisations(id) on delete restrict,
  tenancy_id uuid not null references public.rental_tenancies(id) on delete restrict, currency_code text not null default 'ZAR' check (currency_code = 'ZAR'),
  charge_type text not null check (charge_type in ('opening_balance', 'rent', 'deposit', 'utility', 'fee', 'adjustment_debit', 'adjustment_credit')),
  effective_date date not null, due_date date, amount numeric(14,2) not null check (amount > 0), description text not null check (length(btrim(description)) > 0),
  source_key text, reversal_of_charge_id uuid references public.rental_financial_charges(id) on delete restrict, created_by uuid not null references auth.users(id) on delete restrict, created_at timestamptz not null default now(),
  unique(tenancy_id, source_key)
);
create index if not exists rental_financial_charges_tenancy_due_idx on public.rental_financial_charges(tenancy_id, due_date, created_at);

create table if not exists public.rental_financial_payments (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null references public.organisations(id) on delete restrict,
  tenancy_id uuid not null references public.rental_tenancies(id) on delete restrict, currency_code text not null default 'ZAR' check (currency_code = 'ZAR'),
  received_date date not null, amount numeric(14,2) not null check (amount > 0), payment_reference text not null check (length(btrim(payment_reference)) > 0),
  payment_method text not null check (payment_method in ('bank_transfer', 'cash', 'card', 'other')), evidence_link text, reversal_of_payment_id uuid references public.rental_financial_payments(id) on delete restrict,
  created_by uuid not null references auth.users(id) on delete restrict, created_at timestamptz not null default now(), unique(organisation_id, payment_reference)
);
create index if not exists rental_financial_payments_tenancy_received_idx on public.rental_financial_payments(tenancy_id, received_date, created_at);

create table if not exists public.rental_financial_allocations (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null references public.organisations(id) on delete restrict,
  tenancy_id uuid not null references public.rental_tenancies(id) on delete restrict, payment_id uuid not null references public.rental_financial_payments(id) on delete restrict,
  charge_id uuid not null references public.rental_financial_charges(id) on delete restrict, amount numeric(14,2) not null check (amount > 0), allocated_on date not null default current_date,
  created_by uuid not null references auth.users(id) on delete restrict, created_at timestamptz not null default now(), unique(payment_id, charge_id, id)
);
create index if not exists rental_financial_allocations_payment_idx on public.rental_financial_allocations(payment_id, created_at);
create index if not exists rental_financial_allocations_charge_idx on public.rental_financial_allocations(charge_id, created_at);

create table if not exists public.rental_financial_adjustments (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null references public.organisations(id) on delete restrict,
  tenancy_id uuid not null references public.rental_tenancies(id) on delete restrict, currency_code text not null default 'ZAR' check (currency_code = 'ZAR'),
  adjustment_type text not null check (adjustment_type in ('debit', 'credit')), effective_date date not null, amount numeric(14,2) not null check (amount > 0),
  reason text not null check (length(btrim(reason)) > 0), reversal_of_adjustment_id uuid references public.rental_financial_adjustments(id) on delete restrict,
  created_by uuid not null references auth.users(id) on delete restrict, created_at timestamptz not null default now()
);
create index if not exists rental_financial_adjustments_tenancy_date_idx on public.rental_financial_adjustments(tenancy_id, effective_date, created_at);

create or replace function public.rental_financial_validate_scope()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare tenancy_org uuid; payment_tenancy uuid; payment_currency text; charge_tenancy uuid; charge_currency text;
begin
  select organisation_id into tenancy_org from public.rental_tenancies where id = new.tenancy_id;
  if tenancy_org is null or tenancy_org <> new.organisation_id then raise exception 'Financial entry must match its tenancy organisation'; end if;
  if tg_table_name = 'rental_financial_allocations' then
    select tenancy_id, currency_code into payment_tenancy, payment_currency from public.rental_financial_payments where id = new.payment_id;
    select tenancy_id, currency_code into charge_tenancy, charge_currency from public.rental_financial_charges where id = new.charge_id;
    if payment_tenancy is null or charge_tenancy is null or payment_tenancy <> new.tenancy_id or charge_tenancy <> new.tenancy_id or payment_currency <> charge_currency then raise exception 'Allocation payment and charge must belong to the same tenancy and currency'; end if;
  end if;
  return new;
end; $$;

create or replace function public.rental_financial_reject_mutation()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin raise exception 'Rental financial rows are append-only; use a compensating entry or reversal command'; end; $$;

alter table public.rental_financial_charges enable row level security;
alter table public.rental_financial_payments enable row level security;
alter table public.rental_financial_allocations enable row level security;
alter table public.rental_financial_adjustments enable row level security;
revoke all on public.rental_financial_charges, public.rental_financial_payments, public.rental_financial_allocations, public.rental_financial_adjustments from anon, authenticated;
grant select on public.rental_financial_charges, public.rental_financial_payments, public.rental_financial_allocations, public.rental_financial_adjustments to authenticated;
create policy rental_financial_charges_staff_read on public.rental_financial_charges for select to authenticated using (exists (select 1 from public.rental_tenancies tenancy join public.rental_properties property on property.id = tenancy.property_id where tenancy.id = tenancy_id and public.rental_branch_access(property.organisation_id, property.branch_id)));
create policy rental_financial_payments_staff_read on public.rental_financial_payments for select to authenticated using (exists (select 1 from public.rental_tenancies tenancy join public.rental_properties property on property.id = tenancy.property_id where tenancy.id = tenancy_id and public.rental_branch_access(property.organisation_id, property.branch_id)));
create policy rental_financial_allocations_staff_read on public.rental_financial_allocations for select to authenticated using (exists (select 1 from public.rental_tenancies tenancy join public.rental_properties property on property.id = tenancy.property_id where tenancy.id = tenancy_id and public.rental_branch_access(property.organisation_id, property.branch_id)));
create policy rental_financial_adjustments_staff_read on public.rental_financial_adjustments for select to authenticated using (exists (select 1 from public.rental_tenancies tenancy join public.rental_properties property on property.id = tenancy.property_id where tenancy.id = tenancy_id and public.rental_branch_access(property.organisation_id, property.branch_id)));

create trigger trg_rental_financial_charges_scope before insert on public.rental_financial_charges for each row execute function public.rental_financial_validate_scope();
create trigger trg_rental_financial_payments_scope before insert on public.rental_financial_payments for each row execute function public.rental_financial_validate_scope();
create trigger trg_rental_financial_allocations_scope before insert on public.rental_financial_allocations for each row execute function public.rental_financial_validate_scope();
create trigger trg_rental_financial_adjustments_scope before insert on public.rental_financial_adjustments for each row execute function public.rental_financial_validate_scope();
create trigger trg_rental_financial_charges_immutable before update or delete on public.rental_financial_charges for each row execute function public.rental_financial_reject_mutation();
create trigger trg_rental_financial_payments_immutable before update or delete on public.rental_financial_payments for each row execute function public.rental_financial_reject_mutation();
create trigger trg_rental_financial_allocations_immutable before update or delete on public.rental_financial_allocations for each row execute function public.rental_financial_reject_mutation();
create trigger trg_rental_financial_adjustments_immutable before update or delete on public.rental_financial_adjustments for each row execute function public.rental_financial_reject_mutation();

comment on table public.rental_financial_charges is 'Append-only rental charges; Phase 37 owns generation.';
comment on table public.rental_financial_payments is 'Append-only rental receipts; Phase 38 owns capture.';
comment on table public.rental_financial_allocations is 'Append-only payment-to-charge allocations; Phase 39 owns allocation.';
comment on table public.rental_financial_adjustments is 'Append-only debit or credit corrections; Phase 40 owns adjustments and reversals.';
commit;
