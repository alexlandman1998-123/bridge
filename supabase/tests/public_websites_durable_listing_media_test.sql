begin;
select plan(18);

select has_table('public', 'website_listing_media_assets', 'durable website media ledger exists');
select ok(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.website_listing_media_assets'::regclass),
  'durable media ledger has RLS enabled'
);
select ok(not has_table_privilege('anon', 'public.website_listing_media_assets', 'select'), 'anonymous users cannot inspect the media ledger');
select ok(not has_table_privilege('authenticated', 'public.website_listing_media_assets', 'insert'), 'authenticated clients cannot forge durable media rows');
select ok(has_table_privilege('service_role', 'public.website_listing_media_assets', 'select'), 'the server-side publisher can inspect durable media');
select has_function(
  'public',
  'website_register_listing_media_assets',
  array['uuid', 'uuid', 'text', 'jsonb'],
  'service-only durable media registration command exists'
);
select ok(
  not has_function_privilege('anon', 'public.website_register_listing_media_assets(uuid,uuid,text,jsonb)', 'execute'),
  'anonymous callers cannot register website media'
);
select ok(
  not has_function_privilege('authenticated', 'public.website_register_listing_media_assets(uuid,uuid,text,jsonb)', 'execute'),
  'authenticated clients cannot bypass the media publisher'
);
select ok(
  has_function_privilege('service_role', 'public.website_register_listing_media_assets(uuid,uuid,text,jsonb)', 'execute'),
  'the server-side publisher can register durable media'
);
select ok(
  exists (select 1 from storage.buckets where id = 'listing-media' and public),
  'listing-media is a public delivery bucket'
);
select ok(
  exists (
    select 1
    from storage.buckets
    where id = 'listing-media'
      and allowed_mime_types @> array['image/jpeg', 'image/png', 'application/pdf']::text[]
  ),
  'the delivery bucket allow-lists images and PDF floor plans'
);
select ok(
  exists (
    select 1
    from pg_catalog.pg_indexes
    where schemaname = 'public'
      and tablename = 'website_listing_media_assets'
      and indexdef ilike '%unique%website_site_id%source_media_id%'
  ),
  'one website asset is registered per source media row'
);
select ok(
  exists (
    select 1
    from pg_catalog.pg_constraint constraint_row
    where constraint_row.conrelid = 'public.website_listing_media_assets'::regclass
      and constraint_row.contype = 'f'
      and constraint_row.confrelid = 'public.listing_media'::regclass
      and constraint_row.confdeltype = 'n'
  ),
  'source deletion preserves the asset ledger for cleanup'
);
select ok(
  pg_get_functiondef('public.website_commit_listing_publication(uuid,text,uuid,text)'::regprocedure)
    ilike '%website_listing_media_assets%',
  'website publication snapshots only registered durable media'
);
select hasnt_function(
  'public',
  'website_set_listing_publication',
  array['uuid', 'text'],
  'the browser-callable publication mutation is removed'
);
select has_function(
  'public',
  'website_commit_listing_publication',
  array['uuid', 'text', 'uuid', 'text'],
  'the service-only publication commit exists'
);
select ok(
  not has_function_privilege('authenticated', 'public.website_commit_listing_publication(uuid,text,uuid,text)', 'execute'),
  'authenticated callers cannot invoke the publication commit directly'
);
select ok(
  has_function_privilege('service_role', 'public.website_commit_listing_publication(uuid,text,uuid,text)', 'execute'),
  'the server-side publisher can commit publication'
);

select * from finish();
rollback;
