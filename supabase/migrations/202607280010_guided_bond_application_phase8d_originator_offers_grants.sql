create table if not exists public.transaction_bond_originator_bank_offer_captures (
  id uuid primary key default gen_random_uuid(),
  export_package_id uuid not null references public.transaction_bond_application_export_packages(id) on delete cascade,
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  bond_application_id uuid references public.bond_applications(id) on delete set null,
  submission_id uuid references public.transaction_bond_application_submissions(id) on delete restrict,
  destination_key text not null default 'bond_originator_intake',
  bank_name text not null,
  offered_amount numeric,
  interest_rate numeric,
  interest_rate_type text,
  interest_rate_display text,
  monthly_repayment numeric,
  term_months integer,
  valid_until text,
  quote_document_id uuid references public.documents(id) on delete set null,
  conditions_summary text,
  status text not null default 'captured',
  captured_by uuid references public.profiles(id) on delete set null,
  captured_at timestamptz not null default now(),
  published_by uuid references public.profiles(id) on delete set null,
  published_at timestamptz,
  buyer_decision text,
  buyer_decision_by uuid references public.profiles(id) on delete set null,
  buyer_decision_at timestamptz,
  linked_bond_quote_id uuid references public.transaction_bond_quotes(id) on delete set null,
  idempotency_key text,
  creates_bank_application boolean not null default false,
  workflow_mutation_required boolean not null default false,
  bank_workflow_unchanged boolean not null default true,
  offer_workflow_unchanged boolean not null default true,
  grant_workflow_unchanged boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint transaction_bond_originator_bank_offer_captures_destination_check check (
    destination_key = 'bond_originator_intake'
  ),
  constraint transaction_bond_originator_bank_offer_captures_status_check check (
    status in (
      'draft',
      'captured',
      'published_to_buyer',
      'accepted_by_buyer',
      'declined_by_buyer',
      'withdrawn',
      'expired'
    )
  ),
  constraint transaction_bond_originator_bank_offer_captures_decision_check check (
    buyer_decision is null or buyer_decision in ('accepted', 'declined')
  ),
  constraint transaction_bond_originator_bank_offer_captures_no_auto_workflow_check check (
    creates_bank_application = false
    and workflow_mutation_required = false
    and bank_workflow_unchanged = true
    and offer_workflow_unchanged = true
    and grant_workflow_unchanged = true
  )
);

create table if not exists public.transaction_bond_originator_grant_captures (
  id uuid primary key default gen_random_uuid(),
  export_package_id uuid not null references public.transaction_bond_application_export_packages(id) on delete cascade,
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  bond_application_id uuid references public.bond_applications(id) on delete set null,
  submission_id uuid references public.transaction_bond_application_submissions(id) on delete restrict,
  destination_key text not null default 'bond_originator_intake',
  offer_capture_id uuid references public.transaction_bond_originator_bank_offer_captures(id) on delete set null,
  linked_bond_quote_id uuid references public.transaction_bond_quotes(id) on delete set null,
  bank_name text not null,
  approved_amount numeric,
  grant_document_id uuid not null references public.documents(id) on delete restrict,
  signed_grant_document_id uuid references public.documents(id) on delete set null,
  grant_reference text,
  conditions_summary text,
  status text not null default 'received',
  captured_by uuid references public.profiles(id) on delete set null,
  captured_at timestamptz not null default now(),
  published_by uuid references public.profiles(id) on delete set null,
  published_at timestamptz,
  idempotency_key text,
  creates_bank_application boolean not null default false,
  bank_workflow_unchanged boolean not null default true,
  offer_workflow_unchanged boolean not null default true,
  grant_workflow_unchanged boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint transaction_bond_originator_grant_captures_destination_check check (
    destination_key = 'bond_originator_intake'
  ),
  constraint transaction_bond_originator_grant_captures_status_check check (
    status in (
      'draft',
      'received',
      'published_to_buyer',
      'buyer_signed',
      'submitted_for_instruction',
      'withdrawn'
    )
  ),
  constraint transaction_bond_originator_grant_captures_no_auto_workflow_check check (
    creates_bank_application = false
    and bank_workflow_unchanged = true
    and offer_workflow_unchanged = true
    and grant_workflow_unchanged = true
  )
);

create unique index if not exists transaction_bond_originator_bank_offer_captures_idempotency_idx
  on public.transaction_bond_originator_bank_offer_captures (export_package_id, idempotency_key)
  where idempotency_key is not null;

create index if not exists transaction_bond_originator_bank_offer_captures_package_status_idx
  on public.transaction_bond_originator_bank_offer_captures (export_package_id, status, captured_at desc);

create index if not exists transaction_bond_originator_bank_offer_captures_transaction_status_idx
  on public.transaction_bond_originator_bank_offer_captures (transaction_id, status, captured_at desc);

create unique index if not exists transaction_bond_originator_grant_captures_idempotency_idx
  on public.transaction_bond_originator_grant_captures (export_package_id, idempotency_key)
  where idempotency_key is not null;

create index if not exists transaction_bond_originator_grant_captures_package_status_idx
  on public.transaction_bond_originator_grant_captures (export_package_id, status, captured_at desc);

create index if not exists transaction_bond_originator_grant_captures_transaction_status_idx
  on public.transaction_bond_originator_grant_captures (transaction_id, status, captured_at desc);

alter table public.transaction_bond_originator_bank_offer_captures enable row level security;
alter table public.transaction_bond_originator_grant_captures enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'transaction_bond_originator_bank_offer_captures'
      and policyname = 'bond_originator_bank_offer_captures_service_only'
  ) then
    create policy bond_originator_bank_offer_captures_service_only
      on public.transaction_bond_originator_bank_offer_captures
      for all
      using (auth.role() = 'service_role')
      with check (auth.role() = 'service_role');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'transaction_bond_originator_grant_captures'
      and policyname = 'bond_originator_grant_captures_service_only'
  ) then
    create policy bond_originator_grant_captures_service_only
      on public.transaction_bond_originator_grant_captures
      for all
      using (auth.role() = 'service_role')
      with check (auth.role() = 'service_role');
  end if;
end $$;

create or replace function public.bridge_touch_bond_originator_offer_grant_capture()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_touch_bond_originator_bank_offer_capture on public.transaction_bond_originator_bank_offer_captures;
create trigger trg_touch_bond_originator_bank_offer_capture
  before update on public.transaction_bond_originator_bank_offer_captures
  for each row execute function public.bridge_touch_bond_originator_offer_grant_capture();

drop trigger if exists trg_touch_bond_originator_grant_capture on public.transaction_bond_originator_grant_captures;
create trigger trg_touch_bond_originator_grant_capture
  before update on public.transaction_bond_originator_grant_captures
  for each row execute function public.bridge_touch_bond_originator_offer_grant_capture();

comment on table public.transaction_bond_originator_bank_offer_captures is
  'Phase 8D originator-supplied bank offer capture. Records offer details for buyer visibility/governed workflow handoff without creating bank application rows automatically.';
comment on table public.transaction_bond_originator_grant_captures is
  'Phase 8D originator-supplied bond grant capture. Records grant documents for buyer visibility/governed workflow handoff without automatic grant workflow mutation.';
comment on column public.transaction_bond_originator_bank_offer_captures.linked_bond_quote_id is
  'Optional link to an existing transaction_bond_quotes row when an authorized workflow has published the captured offer.';
comment on column public.transaction_bond_originator_grant_captures.linked_bond_quote_id is
  'Optional link to the accepted transaction_bond_quotes row. Phase 8D capture does not create or accept this row automatically.';
