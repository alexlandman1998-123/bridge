begin;

-- Compatibility-only repair for seller-document columns already consumed by
-- active application selects. The original feature migrations share versions
-- with a different production migration lineage, so their column DDL was not
-- installed even though the client contract was released.
--
-- Keep this migration additive and schema-only. RLS, grants, functions,
-- triggers, and workflow behavior are intentionally handled independently.

alter table public.private_listing_document_requirements
  add column if not exists applies_to text not null default 'seller',
  add column if not exists requested_from_role text,
  add column if not exists request_stage text,
  add column if not exists request_priority text,
  add column if not exists request_due_date date,
  add column if not exists request_delivery_channels text[] not null default '{}'::text[],
  add column if not exists request_dedupe_key text,
  add column if not exists request_source text,
  add column if not exists requested_at timestamptz,
  add column if not exists request_revision integer not null default 0,
  add column if not exists last_request_reason text,
  add column if not exists request_metadata jsonb not null default '{}'::jsonb,
  add column if not exists satisfied_by_document_id uuid
    references public.private_listing_documents(id) on delete set null,
  add column if not exists satisfaction_verified_at timestamptz,
  add column if not exists satisfaction_method text,
  add column if not exists assurance_state text not null default 'unverified',
  add column if not exists assurance_metadata jsonb not null default '{}'::jsonb;

alter table public.private_listing_documents
  add column if not exists review_revision integer not null default 0,
  add column if not exists review_started_at timestamptz,
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by uuid references auth.users(id) on delete set null,
  add column if not exists review_reason text,
  add column if not exists rejection_reason text,
  add column if not exists review_due_at timestamptz,
  add column if not exists review_sla_revision integer not null default 0,
  add column if not exists review_sla_level text not null default 'none',
  add column if not exists review_sla_escalated_at timestamptz;

do $schema_repair$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.private_listing_documents'::regclass
      and conname = 'private_listing_documents_review_sla_level_check'
  ) then
    alter table public.private_listing_documents
      add constraint private_listing_documents_review_sla_level_check
      check (review_sla_level in ('none', 'warning', 'breach', 'critical', 'resolved'));
  end if;
end
$schema_repair$;

create unique index if not exists private_listing_document_requirements_request_dedupe_idx
  on public.private_listing_document_requirements(request_dedupe_key)
  where request_dedupe_key is not null;

create index if not exists private_listing_document_requirements_request_due_idx
  on public.private_listing_document_requirements(request_due_date, status)
  where status in ('requested', 'rejected');

create index if not exists private_listing_requirements_satisfier_idx
  on public.private_listing_document_requirements(satisfied_by_document_id)
  where satisfied_by_document_id is not null;

create index if not exists private_listing_requirements_assurance_idx
  on public.private_listing_document_requirements(private_listing_id, assurance_state, status);

create index if not exists private_listing_documents_review_sla_idx
  on public.private_listing_documents(status, review_due_at)
  where status in ('uploaded', 'under_review');

do $schema_contract$
declare
  missing_columns text[];
begin
  with expected(table_name, column_name) as (
    values
      ('private_listing_document_requirements', 'applies_to'),
      ('private_listing_document_requirements', 'requested_from_role'),
      ('private_listing_document_requirements', 'request_stage'),
      ('private_listing_document_requirements', 'request_priority'),
      ('private_listing_document_requirements', 'request_due_date'),
      ('private_listing_document_requirements', 'request_delivery_channels'),
      ('private_listing_document_requirements', 'request_dedupe_key'),
      ('private_listing_document_requirements', 'request_source'),
      ('private_listing_document_requirements', 'requested_at'),
      ('private_listing_document_requirements', 'request_revision'),
      ('private_listing_document_requirements', 'last_request_reason'),
      ('private_listing_document_requirements', 'request_metadata'),
      ('private_listing_document_requirements', 'satisfied_by_document_id'),
      ('private_listing_document_requirements', 'satisfaction_verified_at'),
      ('private_listing_document_requirements', 'satisfaction_method'),
      ('private_listing_document_requirements', 'assurance_state'),
      ('private_listing_document_requirements', 'assurance_metadata'),
      ('private_listing_documents', 'review_revision'),
      ('private_listing_documents', 'review_started_at'),
      ('private_listing_documents', 'reviewed_at'),
      ('private_listing_documents', 'reviewed_by'),
      ('private_listing_documents', 'review_reason'),
      ('private_listing_documents', 'rejection_reason'),
      ('private_listing_documents', 'review_due_at'),
      ('private_listing_documents', 'review_sla_revision'),
      ('private_listing_documents', 'review_sla_level'),
      ('private_listing_documents', 'review_sla_escalated_at')
  )
  select array_agg(expected.table_name || '.' || expected.column_name order by expected.table_name, expected.column_name)
    into missing_columns
  from expected
  left join information_schema.columns actual
    on actual.table_schema = 'public'
   and actual.table_name = expected.table_name
   and actual.column_name = expected.column_name
  where actual.column_name is null;

  if missing_columns is not null then
    raise exception 'Seller document schema repair incomplete; missing columns: %', missing_columns;
  end if;
end
$schema_contract$;

notify pgrst, 'reload schema';

commit;

