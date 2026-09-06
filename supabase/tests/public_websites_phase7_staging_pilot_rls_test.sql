begin;
select plan(18);

select has_table('public', 'website_pilot_enrolments', 'staging pilot allow-list exists');
select has_column('public', 'website_pilot_enrolments', 'organisation_id', 'pilot is tenant scoped');
select has_column('public', 'website_pilot_enrolments', 'status', 'pilot has a reversible status');
select has_column('public', 'website_pilot_enrolments', 'configured_by', 'pilot records the operator');
select ok(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.website_pilot_enrolments'::regclass),
  'pilot allow-list has RLS enabled'
);
select ok(
  exists (
    select 1 from pg_catalog.pg_indexes
    where schemaname = 'public'
      and indexname = 'website_pilot_enrolments_one_active_idx'
      and indexdef ilike '%where (status = ''active''%'
  ),
  'database permits only one active agency pilot'
);
select has_function('public', 'website_set_pilot_enrolment', array['uuid', 'text', 'text', 'text'], 'service-only pilot status command exists');
select has_function('public', 'website_bind_pilot_hostname', array['uuid', 'text'], 'service-only staging hostname command exists');
select has_function('public', 'website_require_active_pilot_for_site', array[]::text[], 'site-creation pilot gate exists');
select has_function('public', 'website_require_active_pilot_for_lead', array[]::text[], 'lead-ingestion pilot gate exists');
select has_trigger('public', 'website_sites', 'trg_website_sites_active_pilot', 'site creation is gated by the pilot');
select has_trigger('public', 'website_lead_submissions', 'trg_website_leads_active_pilot', 'lead ingestion is gated by the pilot');
select ok(not has_table_privilege('anon', 'public.website_pilot_enrolments', 'select'), 'anonymous users cannot discover pilot tenants');
select ok(not has_table_privilege('authenticated', 'public.website_pilot_enrolments', 'insert'), 'authenticated clients cannot enrol themselves');
select ok(not has_table_privilege('service_role', 'public.website_pilot_enrolments', 'delete'), 'the service role cannot erase pilot history');
select ok(not has_function_privilege('anon', 'public.website_set_pilot_enrolment(uuid,text,text,text)', 'execute'), 'anonymous callers cannot change the pilot');
select ok(not has_function_privilege('authenticated', 'public.website_set_pilot_enrolment(uuid,text,text,text)', 'execute'), 'authenticated callers cannot change the pilot');
select ok(has_function_privilege('service_role', 'public.website_set_pilot_enrolment(uuid,text,text,text)', 'execute'), 'the staging operator service can change the pilot');

select * from finish();
rollback;
