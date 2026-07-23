-- Normalize legacy 12-digit migration ledger identifiers to Supabase's
-- canonical 14-digit timestamp representation.  This changes neither schema
-- nor application data; it retains each existing ledger row and its metadata.
--
-- Preconditions make this all-or-nothing: all legacy rows must be present and
-- no target identifiers may already exist.

begin;

do $repair$
declare
  legacy_versions text[] := array[
    '202606010001',
    '202606030007',
    '202606030008',
    '202606030009',
    '202606030010',
    '202606030011',
    '202606040001',
    '202606040002',
    '202606040004',
    '202606040005',
    '202606050001',
    '202606080002',
    '202606090010',
    '202606110004',
    '202606110005',
    '202606110006',
    '202606110007'
  ];
  normalized_versions text[] := array[
    '20260601000100',
    '20260603000700',
    '20260603000800',
    '20260603000900',
    '20260603001000',
    '20260603001100',
    '20260604000100',
    '20260604000200',
    '20260604000400',
    '20260604000500',
    '20260605000100',
    '20260608000200',
    '20260609001000',
    '20260611000400',
    '20260611000500',
    '20260611000600',
    '20260611000700'
  ];
  expected_count constant integer := 17;
  found_count integer;
  updated_count integer;
begin
  select count(*) into found_count
  from supabase_migrations.schema_migrations
  where version = any(legacy_versions);

  if found_count <> expected_count then
    raise exception 'Expected % legacy migration ledger rows, found %', expected_count, found_count;
  end if;

  select count(*) into found_count
  from supabase_migrations.schema_migrations
  where version = any(normalized_versions);

  if found_count <> 0 then
    raise exception 'Cannot normalize legacy migration versions: % target ledger rows already exist', found_count;
  end if;

  update supabase_migrations.schema_migrations
  set version = version || '00'
  where version = any(legacy_versions);

  get diagnostics updated_count = row_count;
  if updated_count <> expected_count then
    raise exception 'Expected to update % legacy migration ledger rows, updated %', expected_count, updated_count;
  end if;
end
$repair$;

commit;
