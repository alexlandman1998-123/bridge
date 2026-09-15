-- Read-only schema baseline for the Phase 1 freeze checkpoint.
-- It exposes counts and a hash only; object definitions are never returned.
with catalog_objects as (
  select concat_ws('|', 'relation', namespace.nspname, relation.relname, relation.relkind) as definition
  from pg_catalog.pg_class relation
  join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
  where namespace.nspname = 'public'
    and relation.relkind in ('r', 'p', 'v', 'm', 'S')

  union all

  select concat_ws('|', 'column', table_schema, table_name, column_name, data_type, is_nullable, coalesce(column_default, ''))
  from information_schema.columns
  where table_schema = 'public'

  union all

  select concat_ws('|', 'function', procedure.oid::regprocedure::text, md5(pg_catalog.pg_get_functiondef(procedure.oid)))
  from pg_catalog.pg_proc procedure
  join pg_catalog.pg_namespace namespace on namespace.oid = procedure.pronamespace
  where namespace.nspname = 'public'
)
select
  count(*) as catalog_object_count,
  md5(string_agg(definition, E'\n' order by definition)) as catalog_fingerprint
from catalog_objects;
