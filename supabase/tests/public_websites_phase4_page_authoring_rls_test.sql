begin;
select plan(10);

select has_function('public', 'website_validate_page_content', array['text', 'jsonb'], 'structured page validator exists');
select has_function('public', 'website_save_draft_page', array['uuid', 'uuid', 'uuid', 'text', 'text', 'text', 'text', 'text', 'text', 'jsonb'], 'guarded page save command exists');
select has_function('public', 'website_delete_draft_campaign', array['uuid', 'uuid', 'uuid'], 'guarded campaign delete command exists');
select ok(not has_table_privilege('anon', 'public.website_pages', 'select'), 'anon cannot read draft page rows');
select ok(not has_table_privilege('authenticated', 'public.website_pages', 'insert'), 'authenticated clients cannot bypass page validation with inserts');
select ok(not has_table_privilege('authenticated', 'public.website_pages', 'update'), 'authenticated clients cannot bypass page validation with updates');
select ok(not has_table_privilege('authenticated', 'public.website_pages', 'delete'), 'authenticated clients cannot delete standard pages directly');
select ok(not has_function_privilege('anon', 'public.website_save_draft_page(uuid,uuid,uuid,text,text,text,text,text,text,jsonb)', 'execute'), 'anon cannot execute the page save command');
select ok(has_function_privilege('authenticated', 'public.website_save_draft_page(uuid,uuid,uuid,text,text,text,text,text,text,jsonb)', 'execute'), 'authenticated admins can reach the guarded page save command');
select ok(has_function_privilege('authenticated', 'public.website_delete_draft_campaign(uuid,uuid,uuid)', 'execute'), 'authenticated admins can reach the guarded campaign delete command');

select * from finish();
rollback;
