begin;

create extension if not exists "pgcrypto";

create table if not exists public.transaction_finance_workflows (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  workflow_type text not null,
  current_stage text not null default 'documents_received',
  status text not null default 'active',
  last_updated_by uuid references public.profiles(id) on delete set null,
  last_updated_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint transaction_finance_workflows_unique_type unique (transaction_id, workflow_type),
  constraint transaction_finance_workflows_type_check check (workflow_type in ('bond_hybrid')),
  constraint transaction_finance_workflows_stage_check check (
    current_stage in (
      'documents_received',
      'documents_reviewed',
      'applications_submitted',
      'quotes_received',
      'quote_approved',
      'instruction_sent'
    )
  ),
  constraint transaction_finance_workflows_status_check check (status in ('active', 'completed', 'blocked'))
);

create table if not exists public.transaction_finance_workflow_events (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references public.transaction_finance_workflows(id) on delete cascade,
  from_stage text,
  to_stage text not null,
  event_type text not null,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint transaction_finance_workflow_events_to_stage_check check (
    to_stage in (
      'documents_received',
      'documents_reviewed',
      'applications_submitted',
      'quotes_received',
      'quote_approved',
      'instruction_sent'
    )
  ),
  constraint transaction_finance_workflow_events_from_stage_check check (
    from_stage is null or from_stage in (
      'documents_received',
      'documents_reviewed',
      'applications_submitted',
      'quotes_received',
      'quote_approved',
      'instruction_sent'
    )
  ),
  constraint transaction_finance_workflow_events_type_check check (
    event_type in (
      'stage_changed',
      'note_added',
      'bank_submission_added',
      'bank_feedback_added',
      'quote_added',
      'quote_approved',
      'instruction_sent'
    )
  )
);

create table if not exists public.transaction_bond_applications (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  workflow_id uuid not null references public.transaction_finance_workflows(id) on delete cascade,
  bank_name text not null,
  status text not null default 'pending',
  submitted_at timestamptz,
  feedback_received_at timestamptz,
  reference_number text,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint transaction_bond_applications_status_check check (
    status in (
      'pending',
      'submitted',
      'feedback_received',
      'quote_received',
      'additional_documents_required',
      'declined',
      'approved',
      'buyer_approved',
      'expired'
    )
  )
);

create table if not exists public.transaction_bond_quotes (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  workflow_id uuid not null references public.transaction_finance_workflows(id) on delete cascade,
  bond_application_id uuid references public.transaction_bond_applications(id) on delete set null,
  bank_name text not null,
  quoted_amount numeric,
  interest_rate numeric,
  term_months integer,
  quote_status text not null default 'received',
  quote_received_at timestamptz,
  quote_expiry_at timestamptz,
  approved_at timestamptz,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint transaction_bond_quotes_status_check check (
    quote_status in ('received', 'approved_by_buyer', 'declined_by_buyer', 'expired')
  )
);

create unique index if not exists transaction_bond_quotes_one_approved_per_workflow_idx
  on public.transaction_bond_quotes (workflow_id)
  where quote_status = 'approved_by_buyer';

create index if not exists transaction_finance_workflows_transaction_idx
  on public.transaction_finance_workflows (transaction_id, workflow_type);

create index if not exists transaction_finance_workflow_events_workflow_idx
  on public.transaction_finance_workflow_events (workflow_id, created_at desc);

create index if not exists transaction_bond_applications_workflow_idx
  on public.transaction_bond_applications (workflow_id, status);

create index if not exists transaction_bond_applications_transaction_idx
  on public.transaction_bond_applications (transaction_id, created_at desc);

create index if not exists transaction_bond_quotes_workflow_idx
  on public.transaction_bond_quotes (workflow_id, quote_status);

create index if not exists transaction_bond_quotes_transaction_idx
  on public.transaction_bond_quotes (transaction_id, created_at desc);

create or replace function public.touch_bond_hybrid_finance_workflow_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists touch_transaction_finance_workflows_updated_at on public.transaction_finance_workflows;
create trigger touch_transaction_finance_workflows_updated_at
  before update on public.transaction_finance_workflows
  for each row execute function public.touch_bond_hybrid_finance_workflow_updated_at();

drop trigger if exists touch_transaction_bond_applications_updated_at on public.transaction_bond_applications;
create trigger touch_transaction_bond_applications_updated_at
  before update on public.transaction_bond_applications
  for each row execute function public.touch_bond_hybrid_finance_workflow_updated_at();

drop trigger if exists touch_transaction_bond_quotes_updated_at on public.transaction_bond_quotes;
create trigger touch_transaction_bond_quotes_updated_at
  before update on public.transaction_bond_quotes
  for each row execute function public.touch_bond_hybrid_finance_workflow_updated_at();

insert into public.transaction_finance_workflows (transaction_id, workflow_type, current_stage, status)
select t.id, 'bond_hybrid', 'documents_received', 'active'
from public.transactions t
where lower(coalesce(t.finance_type, '')) in ('bond', 'hybrid', 'combination')
on conflict (transaction_id, workflow_type) do nothing;

alter table if exists public.transaction_events drop constraint if exists transaction_events_event_type_check;
alter table if exists public.transaction_events
  add constraint transaction_events_event_type_check
  check (
    event_type in (
      'TransactionCreated',
      'TransactionUpdated',
      'TransactionStageChanged',
      'DocumentUploaded',
      'DocumentVisibilityChanged',
      'CommentAdded',
      'ParticipantAssigned',
      'WorkflowStepUpdated',
      'StatusLinkCreated',
      'OccupationalRentUpdated',
      'AttorneyLaneCreated',
      'AttorneyLaneStageUpdated',
      'AttorneyLaneBlocked',
      'AttorneyLaneCompleted',
      'AttorneyLaneNoteAdded',
      'AttorneyLaneSharedUpdateAdded',
      'AttorneyLaneClientVisibleUpdatePublished',
      'AttorneyLaneDocumentRequested',
      'AttorneyLaneDocumentUploaded',
      'AttorneyLaneSigningPacketCreated',
      'AttorneyLaneSigningCompleted',
      'AttorneyDocumentRequirementsGenerated',
      'AttorneyDocumentUploaded',
      'AttorneyDocumentApproved',
      'AttorneyDocumentRejected',
      'AttorneyDocumentCompleted',
      'AttorneySigningRequirementCreated',
      'AttorneyReadinessRecalculated',
      'AttorneyManualBlockerAdded',
      'AttorneyManualBlockerResolved',
      'AttorneyManualBlockerReopened',
      'AttorneyMatterMarkedAtRisk',
      'AttorneyReadyForLodgement',
      'AttorneyCriticalBlockerCreated',
      'AttorneyUnauthorizedAccessAttempt',
      'BondHybridFinanceWorkflowUpdated',
      'BondHybridFinanceApplicationUpdated',
      'BondHybridFinanceQuoteUpdated',
      'BondHybridFinanceInstructionSent'
    )
  );

alter table public.transaction_finance_workflows enable row level security;
alter table public.transaction_finance_workflow_events enable row level security;
alter table public.transaction_bond_applications enable row level security;
alter table public.transaction_bond_quotes enable row level security;

drop policy if exists transaction_finance_workflows_select on public.transaction_finance_workflows;
create policy transaction_finance_workflows_select
  on public.transaction_finance_workflows
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and coalesce(p.role, '') in ('developer', 'internal_admin')
    )
    or exists (
      select 1
      from public.transaction_participants tp
      where tp.transaction_id = transaction_finance_workflows.transaction_id
        and tp.status <> 'removed'
        and (
          tp.user_id = auth.uid()
          or lower(coalesce(tp.participant_email, '')) = lower(coalesce((select p.email from public.profiles p where p.id = auth.uid()), ''))
        )
    )
  );

drop policy if exists transaction_finance_workflows_modify on public.transaction_finance_workflows;
create policy transaction_finance_workflows_modify
  on public.transaction_finance_workflows
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and coalesce(p.role, '') in ('developer', 'internal_admin', 'bond_originator')
    )
    or exists (
      select 1
      from public.transaction_participants tp
      where tp.transaction_id = transaction_finance_workflows.transaction_id
        and tp.status <> 'removed'
        and tp.can_edit_finance_workflow = true
        and tp.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and coalesce(p.role, '') in ('developer', 'internal_admin', 'bond_originator')
    )
    or exists (
      select 1
      from public.transaction_participants tp
      where tp.transaction_id = transaction_finance_workflows.transaction_id
        and tp.status <> 'removed'
        and tp.can_edit_finance_workflow = true
        and tp.user_id = auth.uid()
    )
  );

drop policy if exists transaction_finance_workflow_events_select on public.transaction_finance_workflow_events;
create policy transaction_finance_workflow_events_select
  on public.transaction_finance_workflow_events
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.transaction_finance_workflows tfw
      where tfw.id = transaction_finance_workflow_events.workflow_id
    )
  );

drop policy if exists transaction_finance_workflow_events_insert on public.transaction_finance_workflow_events;
create policy transaction_finance_workflow_events_insert
  on public.transaction_finance_workflow_events
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.transaction_finance_workflows tfw
      where tfw.id = transaction_finance_workflow_events.workflow_id
        and (
          exists (
            select 1
            from public.profiles p
            where p.id = auth.uid()
              and coalesce(p.role, '') in ('developer', 'internal_admin', 'bond_originator')
          )
          or exists (
            select 1
            from public.transaction_participants tp
            where tp.transaction_id = tfw.transaction_id
              and tp.status <> 'removed'
              and tp.can_edit_finance_workflow = true
              and tp.user_id = auth.uid()
          )
        )
    )
  );

drop policy if exists transaction_bond_applications_select on public.transaction_bond_applications;
create policy transaction_bond_applications_select
  on public.transaction_bond_applications
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.transaction_finance_workflows tfw
      where tfw.id = transaction_bond_applications.workflow_id
    )
  );

drop policy if exists transaction_bond_applications_modify on public.transaction_bond_applications;
create policy transaction_bond_applications_modify
  on public.transaction_bond_applications
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and coalesce(p.role, '') in ('developer', 'internal_admin', 'bond_originator')
    )
    or exists (
      select 1
      from public.transaction_participants tp
      where tp.transaction_id = transaction_bond_applications.transaction_id
        and tp.status <> 'removed'
        and tp.can_edit_finance_workflow = true
        and tp.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and coalesce(p.role, '') in ('developer', 'internal_admin', 'bond_originator')
    )
    or exists (
      select 1
      from public.transaction_participants tp
      where tp.transaction_id = transaction_bond_applications.transaction_id
        and tp.status <> 'removed'
        and tp.can_edit_finance_workflow = true
        and tp.user_id = auth.uid()
    )
  );

drop policy if exists transaction_bond_quotes_select on public.transaction_bond_quotes;
create policy transaction_bond_quotes_select
  on public.transaction_bond_quotes
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.transaction_finance_workflows tfw
      where tfw.id = transaction_bond_quotes.workflow_id
    )
  );

drop policy if exists transaction_bond_quotes_modify on public.transaction_bond_quotes;
create policy transaction_bond_quotes_modify
  on public.transaction_bond_quotes
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and coalesce(p.role, '') in ('developer', 'internal_admin', 'bond_originator')
    )
    or exists (
      select 1
      from public.transaction_participants tp
      where tp.transaction_id = transaction_bond_quotes.transaction_id
        and tp.status <> 'removed'
        and tp.can_edit_finance_workflow = true
        and tp.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and coalesce(p.role, '') in ('developer', 'internal_admin', 'bond_originator')
    )
    or exists (
      select 1
      from public.transaction_participants tp
      where tp.transaction_id = transaction_bond_quotes.transaction_id
        and tp.status <> 'removed'
        and tp.can_edit_finance_workflow = true
        and tp.user_id = auth.uid()
    )
  );

commit;
