begin;
select plan(22);

select has_table('public', 'website_production_dark_launches', 'dark-launch allow-list exists');
select has_table('public', 'website_production_dark_launch_events', 'dark-launch audit trail exists');
select row_security_active('public', 'website_production_dark_launches', 'dark-launch allow-list has RLS');
select row_security_active('public', 'website_production_dark_launch_events', 'dark-launch events have RLS');

select ok(not has_table_privilege('anon', 'public.website_production_dark_launches', 'INSERT'), 'anon cannot prepare a dark launch');
select ok(not has_table_privilege('authenticated', 'public.website_production_dark_launches', 'INSERT'), 'authenticated users cannot prepare a dark launch');
select ok(has_table_privilege('service_role', 'public.website_production_dark_launches', 'INSERT'), 'service role can prepare a dark launch');

select ok(not has_function_privilege('anon', 'public.website_prepare_production_dark_launch(uuid,uuid,text,text,text,text,text,text,text)', 'EXECUTE'), 'anon cannot call dark-launch preparation');
select ok(not has_function_privilege('authenticated', 'public.website_prepare_production_dark_launch(uuid,uuid,text,text,text,text,text,text,text)', 'EXECUTE'), 'authenticated users cannot call dark-launch preparation');
select ok(has_function_privilege('service_role', 'public.website_prepare_production_dark_launch(uuid,uuid,text,text,text,text,text,text,text)', 'EXECUTE'), 'service role can call dark-launch preparation');

select ok(not has_function_privilege('anon', 'public.website_bind_production_dark_launch_content(uuid,uuid,text)', 'EXECUTE'), 'anon cannot bind production content');
select ok(not has_function_privilege('authenticated', 'public.website_bind_production_dark_launch_content(uuid,uuid,text)', 'EXECUTE'), 'authenticated users cannot bind production content');
select ok(has_function_privilege('service_role', 'public.website_bind_production_dark_launch_content(uuid,uuid,text)', 'EXECUTE'), 'service role can bind production content');

select ok(not has_function_privilege('anon', 'public.website_activate_production_dark_launch(uuid,text,text,text)', 'EXECUTE'), 'anon cannot activate a dark launch');
select ok(not has_function_privilege('authenticated', 'public.website_activate_production_dark_launch(uuid,text,text,text)', 'EXECUTE'), 'authenticated users cannot activate a dark launch');
select ok(has_function_privilege('service_role', 'public.website_activate_production_dark_launch(uuid,text,text,text)', 'EXECUTE'), 'service role can activate a dark launch');

select ok(not has_function_privilege('authenticated', 'public.website_pause_production_dark_launch(uuid,text,text)', 'EXECUTE'), 'authenticated users cannot pause a dark launch');
select ok(has_function_privilege('service_role', 'public.website_pause_production_dark_launch(uuid,text,text)', 'EXECUTE'), 'service role can pause a dark launch');
select ok(not has_function_privilege('authenticated', 'public.website_rollback_production_dark_launch(uuid,text,text)', 'EXECUTE'), 'authenticated users cannot roll back a dark launch');
select ok(has_function_privilege('service_role', 'public.website_rollback_production_dark_launch(uuid,text,text)', 'EXECUTE'), 'service role can roll back a dark launch');

select ok(not has_table_privilege('service_role', 'public.website_production_dark_launch_events', 'UPDATE'), 'service role cannot rewrite dark-launch events');
select ok(not has_table_privilege('service_role', 'public.website_production_dark_launch_events', 'DELETE'), 'service role cannot delete dark-launch events');

select * from finish();
rollback;
