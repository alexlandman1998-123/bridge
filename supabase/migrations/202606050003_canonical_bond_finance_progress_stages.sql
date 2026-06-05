begin;

alter table if exists public.transaction_finance_workflows
  drop constraint if exists transaction_finance_workflows_stage_check;

alter table if exists public.transaction_finance_workflow_events
  drop constraint if exists transaction_finance_workflow_events_to_stage_check;

alter table if exists public.transaction_finance_workflow_events
  drop constraint if exists transaction_finance_workflow_events_from_stage_check;

update public.transaction_finance_workflows
set current_stage = case current_stage
  when 'documents_received' then 'documents'
  when 'documents_reviewed' then 'documents'
  when 'applications_submitted' then 'submitted_to_banks'
  when 'quotes_received' then 'quote_received'
  when 'quote_approved' then 'quote_accepted'
  when 'registered' then 'complete'
  when 'completed' then 'complete'
  else current_stage
end
where current_stage in (
  'documents_received',
  'documents_reviewed',
  'applications_submitted',
  'quotes_received',
  'quote_approved',
  'registered',
  'completed'
);

update public.transaction_finance_workflow_events
set
  from_stage = case from_stage
    when 'documents_received' then 'documents'
    when 'documents_reviewed' then 'documents'
    when 'applications_submitted' then 'submitted_to_banks'
    when 'quotes_received' then 'quote_received'
    when 'quote_approved' then 'quote_accepted'
    when 'registered' then 'complete'
    when 'completed' then 'complete'
    else from_stage
  end,
  to_stage = case to_stage
    when 'documents_received' then 'documents'
    when 'documents_reviewed' then 'documents'
    when 'applications_submitted' then 'submitted_to_banks'
    when 'quotes_received' then 'quote_received'
    when 'quote_approved' then 'quote_accepted'
    when 'registered' then 'complete'
    when 'completed' then 'complete'
    else to_stage
  end;

alter table if exists public.transaction_finance_workflows
  alter column current_stage set default 'intake';

alter table if exists public.transaction_finance_workflows
  add constraint transaction_finance_workflows_stage_check
  check (
    current_stage in (
      'intake',
      'documents',
      'submitted_to_banks',
      'bank_review',
      'quote_received',
      'quote_accepted',
      'instruction_sent',
      'complete'
    )
  );

alter table if exists public.transaction_finance_workflow_events
  add constraint transaction_finance_workflow_events_to_stage_check
  check (
    to_stage in (
      'intake',
      'documents',
      'submitted_to_banks',
      'bank_review',
      'quote_received',
      'quote_accepted',
      'instruction_sent',
      'complete'
    )
  );

alter table if exists public.transaction_finance_workflow_events
  add constraint transaction_finance_workflow_events_from_stage_check
  check (
    from_stage is null or from_stage in (
      'intake',
      'documents',
      'submitted_to_banks',
      'bank_review',
      'quote_received',
      'quote_accepted',
      'instruction_sent',
      'complete'
    )
  );

comment on table public.transaction_finance_workflows is
  'Canonical shared finance workflow progress source for bond/hybrid applications across Bridge workspaces.';

commit;
