-- Replace the photo-backed availability canvas in each Harbour Heights demo
-- with the purpose-built masterplan that the interactive unit markers overlay.
update public.development_profiles as profile
set marketing_content = jsonb_set(
  coalesce(profile.marketing_content, '{}'::jsonb),
  '{mediaLibrary}',
  coalesce(profile.marketing_content -> 'mediaLibrary', '{}'::jsonb)
    || jsonb_build_object(
      'sitePlanUrl', 'https://app.arch9.co.za/demo-listing-images/harbour-heights-site-plan.svg',
      'masterplanUrl', 'https://app.arch9.co.za/demo-listing-images/harbour-heights-site-plan.svg'
    ),
  true
)
from public.developments as development
where profile.development_id = development.id
  and development.name = 'Harbour Heights Residences'
  and development.code like 'DEMO-%';
