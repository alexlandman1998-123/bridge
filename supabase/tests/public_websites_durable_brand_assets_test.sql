begin;
select plan(17);

select has_table('public', 'website_brand_assets', 'durable website brand asset ledger exists');
select ok((select relrowsecurity from pg_catalog.pg_class where oid = 'public.website_brand_assets'::regclass), 'durable brand asset ledger has RLS enabled');
select ok(not has_table_privilege('anon', 'public.website_brand_assets', 'select'), 'anonymous users cannot inspect the brand asset ledger');
select ok(not has_table_privilege('authenticated', 'public.website_brand_assets', 'insert'), 'authenticated clients cannot forge brand asset rows');
select ok(has_table_privilege('service_role', 'public.website_brand_assets', 'select'), 'the server-side brand publisher can inspect durable assets');
select ok(
  exists (
    select 1 from storage.buckets
    where id = 'organisation-branding'
      and public
      and file_size_limit = 10485760
      and allowed_mime_types @> array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']::text[]
  ),
  'the organisation branding bucket supports public website logo delivery'
);
select has_function('public', 'website_commit_draft_brand', array['uuid', 'uuid', 'uuid', 'text', 'jsonb', 'jsonb'], 'service-only durable brand commit exists');
select ok(not has_function_privilege('anon', 'public.website_commit_draft_brand(uuid,uuid,uuid,text,jsonb,jsonb)', 'execute'), 'anonymous callers cannot commit website branding');
select ok(not has_function_privilege('authenticated', 'public.website_commit_draft_brand(uuid,uuid,uuid,text,jsonb,jsonb)', 'execute'), 'authenticated clients cannot bypass the brand publisher');
select ok(has_function_privilege('service_role', 'public.website_commit_draft_brand(uuid,uuid,uuid,text,jsonb,jsonb)', 'execute'), 'the server-side brand publisher can commit website branding');
select hasnt_function('public', 'website_update_draft_brand', array['uuid', 'uuid', 'jsonb', 'boolean'], 'the browser-callable brand mutation is removed');
select ok(pg_get_functiondef('public.website_commit_draft_brand(uuid,uuid,uuid,text,jsonb,jsonb)'::regprocedure) ilike '%website_brand_assets%', 'the draft brand command accepts only registered durable logo assets');
select ok(pg_get_functiondef('public.website_revision_readiness(uuid,uuid)'::regprocedure) ilike '%durable public asset%', 'publication readiness blocks unregistered draft logos');
select ok(not has_function_privilege('authenticated', 'public.website_revision_readiness_base(uuid,uuid)', 'execute'), 'authenticated clients cannot bypass durable logo readiness');
select ok(
  exists (
    select 1 from pg_catalog.pg_constraint constraint_row
    where constraint_row.conrelid = 'public.website_brand_assets'::regclass
      and constraint_row.conname = 'website_brand_assets_content_unique'
  ),
  'content-addressed website brand assets are unique per variant'
);
select ok(
  exists (
    select 1 from pg_catalog.pg_constraint constraint_row
    where constraint_row.conrelid = 'public.website_brand_assets'::regclass
      and constraint_row.conname = 'website_brand_assets_site_organisation_fkey'
  ),
  'brand assets cannot cross the website tenant boundary'
);
select ok(pg_get_functiondef('public.website_commit_draft_brand(uuid,uuid,uuid,text,jsonb,jsonb)'::regprocedure) ilike '%organisation administrators%', 'the service commit still verifies organisation administrator authority');

select * from finish();
rollback;
