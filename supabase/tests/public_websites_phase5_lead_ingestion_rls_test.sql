begin;
select plan(16);

select has_column('public', 'website_lead_submissions', 'contact_id', 'submission receipt links to its CRM contact');
select has_column('public', 'website_lead_submissions', 'request_fingerprint', 'submission receipt stores an irreversible abuse fingerprint');
select has_column('public', 'website_lead_submissions', 'consent_json', 'submission receipt stores the consent evidence');
select has_column('public', 'website_lead_submissions', 'routing_json', 'submission receipt stores the routing decision');
select has_column('public', 'website_lead_submissions', 'notification_event_id', 'submission receipt links to the primary notification event');
select has_column('public', 'website_lead_submissions', 'fallback_notification_event_id', 'submission receipt links to the fallback notification event');
select has_function('public', 'website_capture_lead_submission', array['text','text','uuid','uuid','text','text','text','text','boolean','boolean','text','text','jsonb'], 'atomic lead capture command exists');
select has_function('public', 'website_complete_lead_notification', array['uuid','uuid','text','text','text'], 'notification completion command exists');
select has_function('public', 'website_prepare_lead_notification_fallback', array['uuid','text'], 'manager fallback command exists');
select ok(not has_table_privilege('anon', 'public.website_lead_submissions', 'select'), 'anon cannot read lead receipts or PII');
select ok(not has_table_privilege('anon', 'public.website_lead_submissions', 'insert'), 'anon cannot write lead receipts directly');
select ok(not has_table_privilege('authenticated', 'public.website_lead_submissions', 'insert'), 'authenticated clients cannot bypass atomic ingestion');
select ok(not has_function_privilege('anon', 'public.website_capture_lead_submission(text,text,uuid,uuid,text,text,text,text,boolean,boolean,text,text,jsonb)', 'execute'), 'anon cannot execute the privileged capture command');
select ok(not has_function_privilege('authenticated', 'public.website_capture_lead_submission(text,text,uuid,uuid,text,text,text,text,boolean,boolean,text,text,jsonb)', 'execute'), 'authenticated clients cannot execute the privileged capture command');
select ok(has_function_privilege('service_role', 'public.website_capture_lead_submission(text,text,uuid,uuid,text,text,text,text,boolean,boolean,text,text,jsonb)', 'execute'), 'the website server can execute atomic capture');
select ok(has_function_privilege('service_role', 'public.website_prepare_lead_notification_fallback(uuid,text)', 'execute'), 'the website server can create a manager fallback');

select * from finish();
rollback;
