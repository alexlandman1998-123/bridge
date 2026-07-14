with catalog_objects as (
  select
    'table'::text as object_type,
    format('%I.%I', c.table_schema, c.table_name) as object_name,
    md5(string_agg(
      concat_ws('|', c.ordinal_position, c.column_name, c.data_type, c.udt_name,
        c.is_nullable, coalesce(c.column_default, ''), coalesce(c.is_identity, 'NO')),
      E'\n' order by c.ordinal_position
    )) as fingerprint
  from information_schema.columns c
  where c.table_schema = 'public'
  group by c.table_schema, c.table_name

  union all

  select
    'function',
    p.oid::regprocedure::text,
    md5(pg_get_functiondef(p.oid))
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'

  union all

  select
    'constraint',
    format('%I.%I.%I', n.nspname, c.relname, con.conname),
    md5(pg_get_constraintdef(con.oid, true))
  from pg_constraint con
  join pg_class c on c.oid = con.conrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'

  union all

  select
    'index',
    format('%I.%I', schemaname, indexname),
    md5(indexdef)
  from pg_indexes
  where schemaname = 'public'

  union all

  select
    'policy',
    format('%I.%I.%I', schemaname, tablename, policyname),
    md5(concat_ws('|', cmd, permissive, array_to_string(roles, ','),
      coalesce(qual, ''), coalesce(with_check, '')))
  from pg_policies
  where schemaname in ('public', 'storage')

  union all

  select
    'trigger',
    format('%I.%I.%I', n.nspname, c.relname, t.tgname),
    md5(pg_get_triggerdef(t.oid, true))
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and not t.tgisinternal

  union all

  select
    'grant',
    concat_ws('.', table_schema, table_name, grantee, privilege_type),
    md5(concat_ws('|', table_schema, table_name, grantee, privilege_type, is_grantable))
  from information_schema.role_table_grants
  where table_schema in ('public', 'storage')
    and grantee in ('anon', 'authenticated', 'service_role')

  union all

  select
    'extension',
    extname,
    md5(extversion)
  from pg_extension

  union all

  select
    'storage_bucket',
    id,
    md5(concat_ws('|', id, name, public, coalesce(file_size_limit::text, ''),
      coalesce(array_to_string(allowed_mime_types, ','), '')))
  from storage.buckets
)
select object_type, object_name, fingerprint
from catalog_objects
order by object_type, object_name;
