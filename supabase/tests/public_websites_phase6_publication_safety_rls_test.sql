begin;
select plan(27);

select has_column('public', 'website_sites', 'published_revision_id', 'site stores one exact public revision pointer');
select has_column('public', 'website_site_revisions', 'source_revision_id', 'revision records the revision it was cloned from');
select has_column('public', 'website_site_revisions', 'content_fingerprint', 'published content has an integrity fingerprint');
select has_column('public', 'website_site_revisions', 'published_by', 'revision records its publisher');
select has_column('public', 'website_site_revisions', 'archived_at', 'revision records when it left publication');
select col_not_null('public', 'website_pages', 'revision_id', 'every website page belongs to a revision');
select has_table('public', 'website_publication_events', 'append-only publication evidence exists');
select ok(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.website_publication_events'::regclass),
  'publication evidence has RLS enabled'
);
select has_function('public', 'website_revision_readiness', array['uuid', 'uuid'], 'server-side publication readiness command exists');
select has_function('public', 'website_discard_draft_revision', array['uuid', 'uuid'], 'guarded draft discard command exists');
select has_function('public', 'website_create_draft_revision', array['uuid'], 'guarded draft clone command exists');
select has_function('public', 'website_publish_revision', array['uuid', 'uuid'], 'guarded publish command exists');
select has_function('public', 'website_rollback_revision', array['uuid', 'uuid'], 'guarded immutable recovery command exists');
select ok(not has_table_privilege('authenticated', 'public.website_sites', 'update'), 'authenticated clients cannot move the public revision pointer directly');
select ok(not has_table_privilege('authenticated', 'public.website_domains', 'update'), 'authenticated clients cannot activate domains directly');
select ok(not has_table_privilege('authenticated', 'public.website_site_revisions', 'update'), 'authenticated clients cannot change revision state directly');
select ok(not has_table_privilege('authenticated', 'public.website_pages', 'update'), 'authenticated clients cannot edit pages outside guarded commands');
select ok(not has_table_privilege('authenticated', 'public.website_publication_events', 'insert'), 'authenticated clients cannot forge publication evidence');
select ok(not has_table_privilege('service_role', 'public.website_publication_events', 'update'), 'the website server cannot rewrite publication evidence');
select ok(not has_table_privilege('service_role', 'public.website_publication_events', 'delete'), 'the website server cannot delete publication evidence');
select ok(not has_function_privilege('anon', 'public.website_revision_readiness(uuid,uuid)', 'execute'), 'anonymous users cannot inspect draft readiness');
select ok(not has_function_privilege('anon', 'public.website_publish_revision(uuid,uuid)', 'execute'), 'anonymous users cannot publish a website');
select ok(not has_function_privilege('anon', 'public.website_rollback_revision(uuid,uuid)', 'execute'), 'anonymous users cannot restore a website revision');
select ok(has_function_privilege('authenticated', 'public.website_publish_revision(uuid,uuid)', 'execute'), 'authenticated admins can reach the guarded publish command');
select ok(has_function_privilege('authenticated', 'public.website_rollback_revision(uuid,uuid)', 'execute'), 'authenticated admins can reach the guarded recovery command');
select ok(
  exists (
    select 1 from pg_catalog.pg_indexes
    where schemaname = 'public'
      and tablename = 'website_site_revisions'
      and indexname = 'website_site_revisions_one_published_per_site_idx'
  ),
  'a site can have only one published revision'
);
select is(
  (
    select count(*)::integer
    from public.website_sites site
    join public.website_site_revisions revision on revision.id = site.published_revision_id
    where site.status in ('published', 'suspended')
      and (revision.website_site_id is distinct from site.id or revision.status <> 'published')
  ),
  0,
  'every published website points to its own published revision'
);

select * from finish();
rollback;
