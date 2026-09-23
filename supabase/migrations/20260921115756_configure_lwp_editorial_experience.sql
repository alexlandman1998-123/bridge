begin;

-- This is configuration, not a runtime tenant-name branch. All published and
-- draft revisions for the LWP site retain the existing editorial experience
-- when the shared application moves to capability-based rendering.
update public.website_site_revisions
set brand_json = jsonb_set(coalesce(brand_json, '{}'::jsonb), '{experienceKey}', '"editorial-property-v1"'::jsonb, true),
    updated_at = now()
where brand_json ->> 'name' = 'LWP Properties'
  and coalesce(brand_json ->> 'experienceKey', '') <> 'editorial-property-v1';

comment on column public.website_site_revisions.brand_json is
  'Published website branding and declared rendering capabilities. experienceKey is a versioned capability, never an agency-name conditional.';

notify pgrst, 'reload schema';
commit;
