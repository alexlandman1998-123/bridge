begin;

-- Phase 5 staging recovery exposed mixed hash formats:
-- generated artifacts are stored as sha256:<hex>, while final artifact
-- evidence rows store the same digest class as bare 64-char hex. The trace
-- ledger must accept both persisted formats without rewriting historical
-- evidence.
do $$
declare
  v_constraint_name text;
begin
  select constraint_name into v_constraint_name
  from information_schema.constraint_column_usage
  where table_schema = 'public'
    and table_name = 'legal_document_pilot_lifecycle_traces_phase5'
    and column_name = 'artifact_sha256'
  limit 1;

  if v_constraint_name is not null then
    execute format(
      'alter table public.legal_document_pilot_lifecycle_traces_phase5 drop constraint %I',
      v_constraint_name
    );
  end if;
end;
$$;

alter table public.legal_document_pilot_lifecycle_traces_phase5
  add constraint legal_document_pilot_lifecycle_traces_phase5_artifact_sha256_format_check
  check (artifact_sha256 is null or artifact_sha256 ~ '^(sha256:)?[0-9a-f]{64}$');

commit;
