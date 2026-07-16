-- Run after 202607160001_conveyancer_productisation_p1.sql in the target environment.
-- Raises on missing tables, disabled RLS, mutation grants or pre-activation writes.
do $$
declare
  expected_tables text[] := array[
    'conveyancer_matter_plans', 'conveyancer_action_events', 'conveyancer_exceptions',
    'conveyancer_exception_events', 'conveyancer_document_artifacts', 'conveyancer_signing_records',
    'conveyancer_financial_models', 'conveyancer_financial_events', 'conveyancer_coordinations',
    'conveyancer_evidence', 'conveyancer_evidence_reviews', 'conveyancer_integration_profiles',
    'conveyancer_integration_events', 'conveyancer_assurance_reports', 'conveyancer_audit_events'
  ];
  table_name text;
  row_count bigint;
begin
  foreach table_name in array expected_tables
  loop
    if to_regclass(format('public.%I', table_name)) is null then
      raise exception 'P1 verification failed: missing table %', table_name;
    end if;

    if not exists (
      select 1 from pg_class relation
      join pg_namespace namespace on namespace.oid = relation.relnamespace
      where namespace.nspname = 'public'
        and relation.relname = table_name
        and relation.relrowsecurity = true
    ) then
      raise exception 'P1 verification failed: RLS is disabled on %', table_name;
    end if;

    if has_table_privilege('authenticated', format('public.%I', table_name), 'INSERT')
      or has_table_privilege('authenticated', format('public.%I', table_name), 'UPDATE')
      or has_table_privilege('authenticated', format('public.%I', table_name), 'DELETE') then
      raise exception 'P1 verification failed: authenticated mutation privilege on %', table_name;
    end if;

    execute format('select count(*) from public.%I', table_name) into row_count;
    if row_count <> 0 then
      raise exception 'P1 verification failed: dormant table % contains % rows before P2 activation', table_name, row_count;
    end if;
  end loop;

  if not exists (
    select 1 from pg_proc procedure
    join pg_namespace namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname = 'bridge_conveyancer_can_access_record'
  ) then
    raise exception 'P1 verification failed: scoped access function missing';
  end if;

  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name in ('action_queue', 'professional_timeline', 'lodgement_readiness')
  ) then
    raise exception 'P1 verification failed: a derived projection was persisted';
  end if;
end $$;

select
  'conveyancer_productisation_p1' as verification,
  'pass' as decision,
  now() as verified_at;
