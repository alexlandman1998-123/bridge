-- Read-only public-schema fingerprint used before and after ledger repair.
with function_defs as (
  select md5(coalesce(string_agg(
    pg_get_function_identity_arguments(proc.oid) || ':' || pg_get_functiondef(proc.oid),
    E'\n' order by proc.proname, pg_get_function_identity_arguments(proc.oid)
  ), '')) as fingerprint
  from pg_proc proc
  join pg_namespace namespace on namespace.oid = proc.pronamespace
  where namespace.nspname = 'public'
    and proc.prokind in ('f', 'p')
), policy_defs as (
  select md5(coalesce(string_agg(
    concat_ws(':', schemaname, tablename, policyname, permissive, roles::text, cmd, qual, with_check),
    E'\n' order by tablename, policyname
  ), '')) as fingerprint
  from pg_policies
  where schemaname = 'public'
), index_defs as (
  select md5(coalesce(string_agg(indexdef, E'\n' order by tablename, indexname), '')) as fingerprint
  from pg_indexes
  where schemaname = 'public'
), constraint_defs as (
  select md5(coalesce(string_agg(
    relation.relname || ':' || constraint_row.conname || ':' || pg_get_constraintdef(constraint_row.oid, true),
    E'\n' order by relation.relname, constraint_row.conname
  ), '')) as fingerprint
  from pg_constraint constraint_row
  join pg_class relation on relation.oid = constraint_row.conrelid
  join pg_namespace namespace on namespace.oid = relation.relnamespace
  where namespace.nspname = 'public'
), column_defs as (
  select md5(coalesce(string_agg(
    concat_ws(':', table_name, column_name, ordinal_position::text, data_type, udt_name, is_nullable, column_default),
    E'\n' order by table_name, ordinal_position
  ), '')) as fingerprint
  from information_schema.columns
  where table_schema = 'public'
)
select
  function_defs.fingerprint as function_fingerprint,
  policy_defs.fingerprint as policy_fingerprint,
  index_defs.fingerprint as index_fingerprint,
  constraint_defs.fingerprint as constraint_fingerprint,
  column_defs.fingerprint as column_fingerprint
from function_defs
cross join policy_defs
cross join index_defs
cross join constraint_defs
cross join column_defs;
