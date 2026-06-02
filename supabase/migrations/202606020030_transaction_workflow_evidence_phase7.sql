begin;

alter table if exists public.transaction_workflow_evidence
  drop constraint if exists transaction_workflow_evidence_type_check;

alter table if exists public.transaction_workflow_evidence
  add constraint transaction_workflow_evidence_type_check
  check (evidence_type in ('document', 'event', 'checklist_item', 'document_request', 'manual_override', 'onboarding', 'external_status'));

comment on table public.transaction_workflow_evidence is
  'Structured evidence links between workflow steps and supporting documents, requests, events, onboarding milestones, external statuses, or overrides.';

notify pgrst, 'reload schema';

commit;
