begin;
select plan(13);

select has_function('public', 'website_prepare_lead_notification_dispatch_phase3', array[]::text[], 'website notification defaults trigger exists');
select has_function('public', 'website_reset_stale_lead_notification_claims', array['timestamp with time zone'], 'stale claim recovery command exists');
select has_function('public', 'website_claim_lead_notifications', array['integer','uuid'], 'atomic website notification claim exists');
select has_function('public', 'website_run_lead_notification_dispatcher', array[]::text[], 'scheduled dispatcher bridge exists');
select has_trigger('public', 'notification_events', 'trg_website_prepare_lead_notification_dispatch_phase3', 'website lead outbox defaults are applied on insert');
select has_index('public', 'notification_events', 'notification_events_website_lead_dispatch_idx', 'website lead queue has a due-event index');

select ok(not has_function_privilege('anon', 'public.website_claim_lead_notifications(integer,uuid)', 'execute'), 'anon cannot claim website lead notifications');
select ok(not has_function_privilege('authenticated', 'public.website_claim_lead_notifications(integer,uuid)', 'execute'), 'authenticated users cannot claim website lead notifications');
select ok(has_function_privilege('service_role', 'public.website_claim_lead_notifications(integer,uuid)', 'execute'), 'service role can claim website lead notifications');
select ok(not has_function_privilege('anon', 'public.website_reset_stale_lead_notification_claims(timestamp with time zone)', 'execute'), 'anon cannot reset worker claims');
select ok(not has_function_privilege('authenticated', 'public.website_run_lead_notification_dispatcher()', 'execute'), 'authenticated users cannot invoke the scheduled dispatcher');
select ok(has_function_privilege('service_role', 'public.website_run_lead_notification_dispatcher()', 'execute'), 'service role can invoke the scheduled dispatcher');
select ok(has_function_privilege('service_role', 'public.website_complete_lead_notification(uuid,uuid,text,text,text)', 'execute'), 'service role can record durable delivery outcomes');

select * from finish();
rollback;
