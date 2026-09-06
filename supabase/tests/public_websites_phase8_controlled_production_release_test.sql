BEGIN;
SELECT plan(1);

-- Examples: https://pgtap.org/documentation.html

SELECT * FROM finish();
ROLLBACK;
begin;
select plan(24);

select has_table('public', 'website_production_releases', 'production release allow-list exists');
select has_table('public', 'website_production_release_events', 'production release audit exists');
select has_column('public', 'website_production_releases', 'phase7_evidence_fingerprint', 'release is bound to pilot evidence');
select has_column('public', 'website_production_releases', 'source_commit', 'release is bound to source');
select has_column('public', 'website_production_releases', 'rollback_deployment_url', 'release has a rollback target');
select has_column('public', 'website_production_releases', 'dns_snapshot_json', 'release preserves the DNS snapshot');
select ok((select relrowsecurity from pg_catalog.pg_class where oid = 'public.website_production_releases'::regclass), 'release allow-list has RLS');
select ok((select relrowsecurity from pg_catalog.pg_class where oid = 'public.website_production_release_events'::regclass), 'release events have RLS');
select has_function('public', 'website_approve_production_release', array['uuid','text','text','text','text','text','text','text','timestamp with time zone','text'], 'approval command exists');
select has_function('public', 'website_prepare_production_domain', array['uuid','jsonb','text'], 'domain preparation command exists');
select has_function('public', 'website_verify_production_domain', array['uuid','jsonb','text'], 'domain verification command exists');
select has_function('public', 'website_activate_production_release', array['uuid','text','text','text'], 'activation command exists');
select has_function('public', 'website_rollback_production_release', array['uuid','text','text'], 'rollback command exists');
select ok(not has_table_privilege('anon', 'public.website_production_releases', 'select'), 'anonymous callers cannot discover production tenants');
select ok(not has_table_privilege('authenticated', 'public.website_production_releases', 'insert'), 'browser callers cannot approve production');
select ok(not has_table_privilege('service_role', 'public.website_production_releases', 'delete'), 'service role cannot delete release history');
select ok(not has_table_privilege('service_role', 'public.website_production_release_events', 'update'), 'release events are immutable');
select ok(not has_table_privilege('service_role', 'public.website_production_release_events', 'delete'), 'release events cannot be erased');
select ok(not has_function_privilege('authenticated', 'public.website_activate_production_release(uuid,text,text,text)', 'execute'), 'browser callers cannot activate production');
select ok(has_function_privilege('service_role', 'public.website_activate_production_release(uuid,text,text,text)', 'execute'), 'release operator can activate production');
select ok(not has_function_privilege('authenticated', 'public.website_rollback_production_release(uuid,text,text)', 'execute'), 'browser callers cannot invoke rollback');
select ok(has_function_privilege('service_role', 'public.website_rollback_production_release(uuid,text,text)', 'execute'), 'release operator can fail closed');
select col_is_fk('public', 'website_production_releases', array['website_site_id','organisation_id'], 'release site is tenant bound');
select col_is_fk('public', 'website_production_release_events', array['release_id','organisation_id'], 'events are release and tenant bound');

select * from finish();
rollback;
