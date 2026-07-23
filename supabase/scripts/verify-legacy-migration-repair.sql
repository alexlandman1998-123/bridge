-- Post-repair evidence: all normalized rows must retain their migration name
-- and original recorded statements.
select
  version,
  name,
  cardinality(statements) as statement_count
from supabase_migrations.schema_migrations
where version = any(array[
  '20260601000100', '20260603000700', '20260603000800',
  '20260603000900', '20260603001000', '20260603001100',
  '20260604000100', '20260604000200', '20260604000400',
  '20260604000500', '20260605000100', '20260608000200',
  '20260609001000', '20260611000400', '20260611000500',
  '20260611000600', '20260611000700'
])
order by version;
