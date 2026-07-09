begin;

alter table if exists public.transaction_events
  add column if not exists event_data jsonb not null default '{}'::jsonb,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists created_by_role text,
  add column if not exists visibility_scope text not null default 'internal';

alter table if exists public.transaction_events
  drop constraint if exists transaction_events_event_type_check;

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
      'BondHybridFinanceWorkflowUpdated',
      'BondHybridFinanceApplicationUpdated',
      'BondHybridFinanceQuoteUpdated',
      'BondHybridFinanceInstructionSent',
      'AttorneyCriticalBlockerCreated',
      'AttorneyDocumentUploaded',
      'AttorneyLaneBlocked',
      'AttorneyLaneCompleted',
      'AttorneyLaneCreated',
      'AttorneyLaneStageUpdated',
      'AttorneyUnauthorizedAccessAttempt',
      'transaction_created',
      'transfer_attorney_assigned',
      'bond_originator_assigned',
      'cancellation_attorney_assigned',
      'attorney_assignment_created',
      'bond_application_created',
      'roleplayer_visibility_granted',
      'roleplayer_reassigned',
      'CommercialAccessRequested',
      'CommercialAccessReviewed',
      'AttorneyIncomingInstructionAccepted',
      'AttorneyIncomingInstructionDeclined'
    )
  );

comment on constraint transaction_events_event_type_check on public.transaction_events is
  'Allowed transaction activity event types, including attorney incoming instruction acceptance/decline decisions.';

commit;
