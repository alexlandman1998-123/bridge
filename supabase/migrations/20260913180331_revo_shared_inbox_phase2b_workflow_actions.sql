begin;

-- Inbox actions are durable requests, never silent side effects. Existing
-- Arch9 viewing and transaction workflows remain the systems that execute
-- them; this table gives the inbox an auditable, idempotent handoff.
create table public.revo_inbox_workflow_requests (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  conversation_id uuid not null,
  action_type text not null check (action_type in ('create_viewing', 'link_transaction', 'create_transaction')),
  status text not null default 'requested' check (status in ('requested', 'in_progress', 'completed', 'blocked', 'cancelled')),
  listing_id uuid,
  lead_id uuid,
  transaction_id uuid,
  requested_by uuid not null references public.profiles(id) on delete restrict,
  requested_at timestamptz not null default now(),
  completed_at timestamptz,
  metadata_json jsonb not null default '{}'::jsonb,
  unique (conversation_id, action_type, listing_id, lead_id)
);

create index revo_inbox_workflow_requests_queue_idx
  on public.revo_inbox_workflow_requests (organisation_id, status, requested_at asc);

alter table public.revo_inbox_workflow_requests enable row level security;
grant select, insert, update on public.revo_inbox_workflow_requests to authenticated;

create policy revo_inbox_workflow_requests_member_read
on public.revo_inbox_workflow_requests for select to authenticated
using (
  organisation_id = '322c3853-2d82-4413-97e6-b4cd8bc32a7c'::uuid
  and public.bridge_is_active_member(organisation_id)
);

create policy revo_inbox_workflow_requests_member_insert
on public.revo_inbox_workflow_requests for insert to authenticated
with check (
  organisation_id = '322c3853-2d82-4413-97e6-b4cd8bc32a7c'::uuid
  and public.bridge_is_active_member(organisation_id)
  and requested_by = (select auth.uid())
);

create policy revo_inbox_workflow_requests_member_update
on public.revo_inbox_workflow_requests for update to authenticated
using (
  organisation_id = '322c3853-2d82-4413-97e6-b4cd8bc32a7c'::uuid
  and public.bridge_is_active_member(organisation_id)
)
with check (
  organisation_id = '322c3853-2d82-4413-97e6-b4cd8bc32a7c'::uuid
  and public.bridge_is_active_member(organisation_id)
);

comment on table public.revo_inbox_workflow_requests is
  'Auditable Revo inbox handoff into existing viewing and transaction workflows. Offer creation is intentionally excluded.';

commit;
