-- Forward reconciliation for the never-applied, partially represented
-- 202607050001 bond grant workflow migration.

begin;

alter table if exists public.transaction_bond_instructions
  add column if not exists grant_received boolean not null default false,
  add column if not exists grant_received_at timestamptz,
  add column if not exists grant_received_by uuid references public.profiles(id) on delete set null,
  add column if not exists grant_document_id uuid references public.documents(id) on delete set null,
  add column if not exists grant_signed boolean not null default false,
  add column if not exists grant_signed_at timestamptz,
  add column if not exists grant_signed_by uuid references public.profiles(id) on delete set null,
  add column if not exists signed_grant_document_id uuid references public.documents(id) on delete set null,
  add column if not exists grant_submitted boolean not null default false,
  add column if not exists grant_submitted_at timestamptz,
  add column if not exists grant_submitted_by uuid references public.profiles(id) on delete set null;

create index if not exists transaction_bond_instructions_grant_received_idx
  on public.transaction_bond_instructions (transaction_id, grant_received_at desc)
  where grant_received = true;

create index if not exists transaction_bond_instructions_grant_submitted_idx
  on public.transaction_bond_instructions (transaction_id, grant_submitted_at desc)
  where grant_submitted = true;

alter table if exists public.transaction_finance_workflows
  drop constraint if exists transaction_finance_workflows_stage_check;
alter table if exists public.transaction_finance_workflow_events
  drop constraint if exists transaction_finance_workflow_events_to_stage_check;
alter table if exists public.transaction_finance_workflow_events
  drop constraint if exists transaction_finance_workflow_events_from_stage_check;
alter table if exists public.transaction_finance_workflow_events
  drop constraint if exists transaction_finance_workflow_events_type_check;

alter table if exists public.transaction_finance_workflows
  add constraint transaction_finance_workflows_stage_check
  check (current_stage in (
    'intake', 'documents', 'submitted_to_banks', 'bank_review',
    'quote_received', 'quote_accepted', 'bond_approved', 'grant_received',
    'grant_signed', 'grant_submitted', 'instruction_sent', 'complete'
  ));

alter table if exists public.transaction_finance_workflow_events
  add constraint transaction_finance_workflow_events_to_stage_check
  check (to_stage in (
    'intake', 'documents', 'submitted_to_banks', 'bank_review',
    'quote_received', 'quote_accepted', 'bond_approved', 'grant_received',
    'grant_signed', 'grant_submitted', 'instruction_sent', 'complete'
  ));

alter table if exists public.transaction_finance_workflow_events
  add constraint transaction_finance_workflow_events_from_stage_check
  check (from_stage is null or from_stage in (
    'intake', 'documents', 'submitted_to_banks', 'bank_review',
    'quote_received', 'quote_accepted', 'bond_approved', 'grant_received',
    'grant_signed', 'grant_submitted', 'instruction_sent', 'complete'
  ));

alter table if exists public.transaction_finance_workflow_events
  add constraint transaction_finance_workflow_events_type_check
  check (event_type in (
    'stage_changed', 'note_added', 'bank_submission_added',
    'bank_feedback_added', 'quote_added', 'quote_approved', 'bond_approved',
    'grant_received', 'grant_signed', 'grant_submitted', 'instruction_sent'
  ));

comment on column public.transaction_bond_instructions.grant_document_id is
  'Formal lender bond grant document captured before signed grant and instruction handoff.';
comment on column public.transaction_bond_instructions.signed_grant_document_id is
  'Buyer-signed bond grant document required before grant submission and attorney instruction.';

notify pgrst, 'reload schema';

commit;
