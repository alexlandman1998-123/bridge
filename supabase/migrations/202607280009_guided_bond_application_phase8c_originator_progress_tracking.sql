create table if not exists public.transaction_bond_originator_progress_events (
  id uuid primary key default gen_random_uuid(),
  export_package_id uuid not null references public.transaction_bond_application_export_packages(id) on delete cascade,
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  bond_application_id uuid references public.bond_applications(id) on delete set null,
  submission_id uuid references public.transaction_bond_application_submissions(id) on delete restrict,
  destination_key text not null default 'bond_originator_intake',
  event_type text not null default 'originator_update',
  status text not null default 'in_progress',
  title text not null,
  summary text not null,
  internal_note text,
  visible_to_buyer boolean not null default true,
  visible_to_agent boolean not null default true,
  visible_to_originator boolean not null default true,
  occurred_at timestamptz not null default now(),
  recorded_by uuid references public.profiles(id) on delete set null,
  idempotency_key text,
  source text not null default 'originator',
  bank_workflow_unchanged boolean not null default true,
  offer_workflow_unchanged boolean not null default true,
  grant_workflow_unchanged boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint transaction_bond_originator_progress_events_destination_check check (
    destination_key = 'bond_originator_intake'
  ),
  constraint transaction_bond_originator_progress_events_type_check check (
    event_type in (
      'package_ready',
      'package_accepted',
      'package_downloaded',
      'documents_requested',
      'documents_uploaded',
      'documents_accepted',
      'originator_reviewing',
      'originator_processing',
      'originator_update',
      'on_hold',
      'completed'
    )
  ),
  constraint transaction_bond_originator_progress_events_status_check check (
    status in (
      'pending',
      'in_progress',
      'waiting_for_buyer',
      'awaiting_originator_review',
      'completed',
      'on_hold'
    )
  ),
  constraint transaction_bond_originator_progress_events_no_workflow_mutation_check check (
    bank_workflow_unchanged = true
    and offer_workflow_unchanged = true
    and grant_workflow_unchanged = true
  )
);

create unique index if not exists transaction_bond_originator_progress_events_idempotency_idx
  on public.transaction_bond_originator_progress_events (export_package_id, idempotency_key)
  where idempotency_key is not null;

create index if not exists transaction_bond_originator_progress_events_package_timeline_idx
  on public.transaction_bond_originator_progress_events (export_package_id, occurred_at, created_at);

create index if not exists transaction_bond_originator_progress_events_transaction_status_idx
  on public.transaction_bond_originator_progress_events (transaction_id, status, occurred_at desc);

alter table public.transaction_bond_originator_progress_events enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'transaction_bond_originator_progress_events'
      and policyname = 'bond_originator_progress_events_service_only'
  ) then
    create policy bond_originator_progress_events_service_only
      on public.transaction_bond_originator_progress_events
      for all
      using (auth.role() = 'service_role')
      with check (auth.role() = 'service_role');
  end if;
end $$;

create or replace function public.bridge_touch_bond_originator_progress_event()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_touch_bond_originator_progress_event on public.transaction_bond_originator_progress_events;
create trigger trg_touch_bond_originator_progress_event
  before update on public.transaction_bond_originator_progress_events
  for each row execute function public.bridge_touch_bond_originator_progress_event();

comment on table public.transaction_bond_originator_progress_events is
  'Phase 8C high-level originator progress tracking for accepted intake packages. These events are operational tracking only and do not mutate bank, offer or grant workflow.';
comment on column public.transaction_bond_originator_progress_events.internal_note is
  'Internal originator note. Buyer and agent views must use trusted filtering before display.';
comment on column public.transaction_bond_originator_progress_events.bank_workflow_unchanged is
  'Always true for Phase 8C. Progress events are not automatic bank submissions or bank statuses.';
