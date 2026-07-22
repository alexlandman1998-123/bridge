begin;

-- Phase 23 corrective hardening. The original H2 migration revoked row DML
-- but its own catalogue contract also treats TRUNCATE, REFERENCES, and
-- TRIGGER as direct pipeline write authority. Remove the complete write-class
-- privilege set from both client roles without changing application data.
revoke insert, update, delete, truncate, references, trigger
on table
  public.document_signing_field_layouts,
  public.document_signing_dispatches,
  public.legal_final_transaction_publications,
  public.legal_final_completion_receipts,
  public.legal_final_completion_retry_attempts
from authenticated, anon;

comment on function public.bridge_get_document_generator_least_privilege_contract_h2() is
  'H2 generator least-privilege catalogue contract; directPipelineWriteGrantCount must be zero after Phase 23 hardening.';

commit;
