-- Publish a distinct, shareable Harbour Heights landing page for each seeded
-- agency. Public pages are gated by the slug, public visibility and live
-- marketing status in get_public_development_landing().
with landing_config(code, slug, developer_company) as (
  values
    ('DEMO-322C38', 'harbour-heights-residences', 'Revo Property Site'),
    ('DEMO-5BE90D', 'harbour-heights-residences-only-property', 'Only Property Real EstateGroup'),
    ('DEMO-80A8F6', 'harbour-heights-residences-talana-foot', 'Talana Foot Real Estate')
)
update public.development_profiles as profile
set marketing_content = coalesce(profile.marketing_content, '{}'::jsonb) || jsonb_build_object(
  'listingOverview',
    coalesce(profile.marketing_content -> 'listingOverview', '{}'::jsonb) || jsonb_build_object(
      'listingStatus', 'active',
      'listingTitle', 'Harbour Heights Residences',
      'listingHeading', 'A considered new address, made for modern living.',
      'listingDescription', 'Discover a carefully composed collection of contemporary homes at Harbour Heights Residences. Explore the masterplan, current availability and a selection of homes designed around light, privacy and everyday ease.'
    ),
  'listingConfiguration',
    coalesce(profile.marketing_content -> 'listingConfiguration', '{}'::jsonb) || jsonb_build_object(
      'listingSlug', config.slug,
      'showOnListingWebsite', true,
      'publicVisibility', true,
      'marketingStatus', 'live'
    ),
  'externalLinks',
    coalesce(profile.marketing_content -> 'externalLinks', '{}'::jsonb) || jsonb_build_object(
      'developmentLandingPageUrl', 'https://app.arch9.co.za/development/' || config.slug
    )
)
from public.developments as development
join landing_config as config on config.code = development.code
where profile.development_id = development.id;

with landing_config(code, slug, developer_company) as (
  values
    ('DEMO-322C38', 'harbour-heights-residences', 'Revo Property Site'),
    ('DEMO-5BE90D', 'harbour-heights-residences-only-property', 'Only Property Real EstateGroup'),
    ('DEMO-80A8F6', 'harbour-heights-residences-talana-foot', 'Talana Foot Real Estate')
)
update public.developments as development
set developer_company = coalesce(nullif(btrim(development.developer_company), ''), config.developer_company)
from landing_config as config
where development.code = config.code;
