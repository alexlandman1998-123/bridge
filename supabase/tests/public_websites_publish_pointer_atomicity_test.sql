begin;
select plan(4);

select has_function(
  'public',
  'website_publish_revision_core',
  array['uuid', 'uuid'],
  'the website publish core command exists'
);

select ok(
  (select tgdeferrable and tginitdeferred from pg_catalog.pg_trigger where tgname = 'trg_website_sites_published_revision_pointer'),
  'the website pointer invariant is deferred for an atomic publish'
);

select ok(
  (select tgdeferrable and tginitdeferred from pg_catalog.pg_trigger where tgname = 'trg_website_revisions_published_pointer'),
  'the revision invariant is deferred for an atomic publish'
);

select ilike(
  pg_get_functiondef('public.website_publish_revision_core(uuid,uuid)'::regprocedure),
  '%set constraints all deferred%',
  'publishing explicitly keeps the revision and pointer hand-off deferred until commit'
);

select * from finish();
rollback;
