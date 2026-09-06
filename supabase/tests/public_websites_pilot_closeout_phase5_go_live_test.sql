begin;
select plan(11);

select has_column('public', 'website_production_releases', 'origin_dark_launch_id', 'go-live release is bound to a dark launch');
select has_column('public', 'website_production_releases', 'client_approval_json', 'go-live release stores client approval');
select has_column('public', 'website_production_releases', 'phase4_evidence_fingerprint', 'go-live release stores Phase 4 evidence');
select col_is_fk('public', 'website_production_releases', 'origin_dark_launch_id', 'dark-launch binding is referentially constrained');
select has_function(
  'public',
  'website_approve_dark_launch_go_live',
  array['uuid','text','text','text','text','text','jsonb','timestamp with time zone','text'],
  'dark-launch go-live approval command exists'
);
select ok(
  not has_function_privilege('anon', 'public.website_approve_dark_launch_go_live(uuid,text,text,text,text,text,jsonb,timestamp with time zone,text)', 'execute'),
  'anonymous callers cannot approve go-live'
);
select ok(
  not has_function_privilege('authenticated', 'public.website_approve_dark_launch_go_live(uuid,text,text,text,text,text,jsonb,timestamp with time zone,text)', 'execute'),
  'browser callers cannot approve go-live'
);
select ok(
  has_function_privilege('service_role', 'public.website_approve_dark_launch_go_live(uuid,text,text,text,text,text,jsonb,timestamp with time zone,text)', 'execute'),
  'release operator can approve go-live'
);
select ok(not has_table_privilege('authenticated', 'public.website_production_releases', 'insert'), 'browser callers cannot create release records');
select ok(not has_table_privilege('service_role', 'public.website_production_release_events', 'update'), 'go-live audit events remain immutable');
select ok(not has_table_privilege('service_role', 'public.website_production_release_events', 'delete'), 'go-live audit events cannot be erased');

select * from finish();
rollback;
