begin;

create table if not exists public.transaction_workflow_events (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  workflow_key text not null default '',
  step_key text not null default '',
  action_key text not null default '',
  event_type text not null,
  previous_status text,
  new_status text,
  payload_json jsonb not null default '{}'::jsonb,
  source text not null default 'system',
  created_by uuid,
  created_at timestamptz not null default now()
);

create index if not exists transaction_workflow_events_transaction_idx
  on public.transaction_workflow_events (transaction_id, created_at desc);

create index if not exists transaction_workflow_events_action_idx
  on public.transaction_workflow_events (action_key, event_type, created_at desc);

alter table if exists public.transaction_workflow_events enable row level security;

drop policy if exists transaction_workflow_events_select_transaction_scope on public.transaction_workflow_events;
create policy transaction_workflow_events_select_transaction_scope
  on public.transaction_workflow_events
  for select
  to authenticated
  using (public.bridge_can_access_transaction_spine(transaction_id));

drop policy if exists transaction_workflow_events_insert_transaction_scope on public.transaction_workflow_events;
create policy transaction_workflow_events_insert_transaction_scope
  on public.transaction_workflow_events
  for insert
  to authenticated
  with check (public.bridge_can_access_transaction_spine(transaction_id));

grant select, insert on public.transaction_workflow_events to authenticated;

comment on table public.transaction_workflow_events is
  'Structured workflow action and step-change events for canonical transaction workflow movement.';

notify pgrst, 'reload schema';

commit;
