begin;

alter table if exists public.transaction_required_documents
  add column if not exists requirement_identity text,
  add column if not exists requirement_identity_version text,
  add column if not exists requirement_base_key text,
  add column if not exists participant_role text,
  add column if not exists participant_key text,
  add column if not exists requirement_baseline_version text,
  add column if not exists originator_profile_key text,
  add column if not exists originator_profile_version text,
  add column if not exists requirement_profile_fingerprint text,
  add column if not exists decision_fingerprint text,
  add column if not exists reconciliation_fingerprint text,
  add column if not exists reconciliation_source text,
  add column if not exists reconciled_at timestamptz;

update public.transaction_required_documents
set
  requirement_identity = concat(
    'phase_3_v1:legacy:legacy:legacy:',
    trim(both '_' from regexp_replace(lower(coalesce(document_key, 'unknown_requirement')), '[^a-z0-9]+', '_', 'g'))
  ),
  requirement_identity_version = 'phase-3-v1',
  requirement_base_key = coalesce(nullif(requirement_base_key, ''), document_key),
  reconciliation_source = case
    when group_key = 'bond_application_documents' or lower(coalesce(document_key, '')) like '%bond_application_%'
      then 'bond_application_document_reconciliation'
    else reconciliation_source
  end
where requirement_identity is null;

create unique index if not exists transaction_required_documents_requirement_identity_uidx
  on public.transaction_required_documents (transaction_id, requirement_identity)
  where requirement_identity is not null;

create index if not exists transaction_required_documents_profile_reconciliation_idx
  on public.transaction_required_documents (
    transaction_id,
    requirement_baseline_version,
    originator_profile_key,
    originator_profile_version
  )
  where reconciliation_source = 'bond_application_document_reconciliation';

comment on column public.transaction_required_documents.requirement_identity is
  'Stable Phase 3 identity for one transaction, scope, participant and canonical requirement. Profile versions are provenance and do not change this identity.';
comment on column public.transaction_required_documents.requirement_profile_fingerprint is
  'Deterministic fingerprint of the South African baseline and certified originator overlay used by reconciliation.';
comment on column public.transaction_required_documents.decision_fingerprint is
  'Deterministic fingerprint of the interpreted application decisions that produced this requirement.';
comment on column public.transaction_required_documents.reconciliation_fingerprint is
  'Fingerprint of the complete active requirement set from the latest reconciliation.';

notify pgrst, 'reload schema';

commit;
