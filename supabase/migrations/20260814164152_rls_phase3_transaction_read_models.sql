begin;
-- Phase 3 covers transaction-scoped generated read/state tables classified in
-- docs/supabase-rls-phase-0-policy-classification.md.

alter table if exists public.transaction_document_requirements enable row level security;
revoke all on table public.transaction_document_requirements from public, anon, authenticated;
grant select, insert, update on table public.transaction_document_requirements to authenticated;
grant all on table public.transaction_document_requirements to service_role;
drop policy if exists transaction_document_requirements_participant_select
  on public.transaction_document_requirements;
create policy transaction_document_requirements_participant_select
  on public.transaction_document_requirements
  for select
  to authenticated
  using (
    public.bridge_has_transaction_permission(transaction_id, 'view_documents')
    or public.bridge_has_transaction_permission(transaction_id, 'view_transaction')
  );
drop policy if exists transaction_document_requirements_resolver_insert
  on public.transaction_document_requirements;
create policy transaction_document_requirements_resolver_insert
  on public.transaction_document_requirements
  for insert
  to authenticated
  with check (
    public.bridge_has_transaction_permission(transaction_id, 'edit_core_transaction')
    or public.bridge_has_transaction_permission(transaction_id, 'manage_transfer_workflow')
    or public.bridge_has_transaction_permission(transaction_id, 'manage_bond_workflow')
    or public.bridge_has_transaction_permission(transaction_id, 'upload_transfer_docs')
    or public.bridge_has_transaction_permission(transaction_id, 'upload_bond_docs')
  );
drop policy if exists transaction_document_requirements_resolver_update
  on public.transaction_document_requirements;
create policy transaction_document_requirements_resolver_update
  on public.transaction_document_requirements
  for update
  to authenticated
  using (
    public.bridge_has_transaction_permission(transaction_id, 'edit_core_transaction')
    or public.bridge_has_transaction_permission(transaction_id, 'manage_transfer_workflow')
    or public.bridge_has_transaction_permission(transaction_id, 'manage_bond_workflow')
    or public.bridge_has_transaction_permission(transaction_id, 'upload_transfer_docs')
    or public.bridge_has_transaction_permission(transaction_id, 'upload_bond_docs')
  )
  with check (
    public.bridge_has_transaction_permission(transaction_id, 'edit_core_transaction')
    or public.bridge_has_transaction_permission(transaction_id, 'manage_transfer_workflow')
    or public.bridge_has_transaction_permission(transaction_id, 'manage_bond_workflow')
    or public.bridge_has_transaction_permission(transaction_id, 'upload_transfer_docs')
    or public.bridge_has_transaction_permission(transaction_id, 'upload_bond_docs')
  );
comment on table public.transaction_document_requirements is
  'Canonical generated transaction document requirement read model. Reads are transaction-scoped; resolver writes are restricted to transaction coordinators/document workflow roles; hard delete remains disabled.';
alter table if exists public.transaction_lifecycle_workflows enable row level security;
revoke all on table public.transaction_lifecycle_workflows from public, anon, authenticated;
grant select, insert, update on table public.transaction_lifecycle_workflows to authenticated;
grant all on table public.transaction_lifecycle_workflows to service_role;
drop policy if exists transaction_lifecycle_workflows_participant_select
  on public.transaction_lifecycle_workflows;
create policy transaction_lifecycle_workflows_participant_select
  on public.transaction_lifecycle_workflows
  for select
  to authenticated
  using (
    public.bridge_has_transaction_permission(transaction_id, 'view_transaction')
  );
drop policy if exists transaction_lifecycle_workflows_coordinator_insert
  on public.transaction_lifecycle_workflows;
create policy transaction_lifecycle_workflows_coordinator_insert
  on public.transaction_lifecycle_workflows
  for insert
  to authenticated
  with check (
    public.bridge_has_transaction_permission(transaction_id, 'edit_core_transaction')
    or public.bridge_has_transaction_permission(transaction_id, 'manage_transfer_workflow')
    or public.bridge_has_transaction_permission(transaction_id, 'manage_bond_workflow')
  );
drop policy if exists transaction_lifecycle_workflows_coordinator_update
  on public.transaction_lifecycle_workflows;
create policy transaction_lifecycle_workflows_coordinator_update
  on public.transaction_lifecycle_workflows
  for update
  to authenticated
  using (
    public.bridge_has_transaction_permission(transaction_id, 'edit_core_transaction')
    or public.bridge_has_transaction_permission(transaction_id, 'manage_transfer_workflow')
    or public.bridge_has_transaction_permission(transaction_id, 'manage_bond_workflow')
  )
  with check (
    public.bridge_has_transaction_permission(transaction_id, 'edit_core_transaction')
    or public.bridge_has_transaction_permission(transaction_id, 'manage_transfer_workflow')
    or public.bridge_has_transaction_permission(transaction_id, 'manage_bond_workflow')
  );
comment on table public.transaction_lifecycle_workflows is
  'Canonical parent transaction lifecycle state. Reads are transaction-scoped; direct lifecycle changes are restricted to transaction coordinators/workflow managers; hard delete remains disabled.';
notify pgrst, 'reload schema';
commit;
