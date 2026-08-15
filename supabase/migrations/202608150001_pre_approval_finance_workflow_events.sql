begin;

alter table if exists public.transaction_finance_workflow_events
  drop constraint if exists transaction_finance_workflow_events_type_check;

alter table if exists public.transaction_finance_workflow_events
  add constraint transaction_finance_workflow_events_type_check
  check (event_type in (
    'stage_changed',
    'note_added',
    'bank_submission_added',
    'bank_feedback_added',
    'quote_added',
    'quote_approved',
    'pre_approval_outcome_captured',
    'pre_approval_converted',
    'bond_approved',
    'grant_received',
    'grant_signed',
    'grant_submitted',
    'instruction_sent'
  ));

comment on constraint transaction_finance_workflow_events_type_check on public.transaction_finance_workflow_events is
  'Allows canonical bond finance events, including pre-approval outcome capture and conversion events.';

notify pgrst, 'reload schema';

commit;
