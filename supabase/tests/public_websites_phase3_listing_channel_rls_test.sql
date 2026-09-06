begin;
select plan(9);

select has_table('public', 'website_listing_publications', 'website channel table exists');
select ok(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.website_listing_publications'::regclass),
  'website channel table has RLS enabled'
);
select ok(not has_table_privilege('anon', 'public.website_listing_publications', 'select'), 'anon cannot select channel rows');
select ok(not has_table_privilege('anon', 'public.website_listing_publications', 'insert'), 'anon cannot insert channel rows');
select ok(not has_table_privilege('authenticated', 'public.website_listing_publications', 'insert'), 'authenticated clients cannot bypass the command with direct inserts');
select ok(has_table_privilege('service_role', 'public.website_listing_publications', 'select'), 'server-only website rendering can read channel snapshots');
select ok(not has_function_privilege('anon', 'public.website_set_listing_publication(uuid,text)', 'execute'), 'anon cannot execute the mutation command');
select ok(has_function_privilege('authenticated', 'public.website_set_listing_publication(uuid,text)', 'execute'), 'authenticated users can reach the guarded mutation command');
select ok(has_function_privilege('authenticated', 'public.website_get_listing_publication_status(uuid)', 'execute'), 'authenticated users can reach the guarded status command');

select * from finish();
rollback;
