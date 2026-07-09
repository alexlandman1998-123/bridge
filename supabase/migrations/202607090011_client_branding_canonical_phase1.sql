begin;

alter table if exists public.organisation_branding
  add column if not exists logo_icon_url text,
  add column if not exists hero_image_url text,
  add column if not exists primary_color text,
  add column if not exists secondary_color text,
  add column if not exists accent_color text,
  add column if not exists neutral_color text,
  add column if not exists suggested_primary_color text,
  add column if not exists suggested_accent_color text,
  add column if not exists logo_light_bucket text,
  add column if not exists logo_light_path text,
  add column if not exists logo_dark_bucket text,
  add column if not exists logo_dark_path text,
  add column if not exists logo_icon_bucket text,
  add column if not exists logo_icon_path text,
  add column if not exists hero_image_bucket text,
  add column if not exists hero_image_path text,
  add column if not exists theme_json jsonb not null default '{}'::jsonb,
  add column if not exists draft_theme_json jsonb not null default '{}'::jsonb,
  add column if not exists published_at timestamptz;

update public.organisation_branding
set
  theme_json = coalesce(theme_json, '{}'::jsonb),
  draft_theme_json = coalesce(draft_theme_json, '{}'::jsonb);

alter table if exists public.organisation_branding
  alter column theme_json set default '{}'::jsonb,
  alter column theme_json set not null,
  alter column draft_theme_json set default '{}'::jsonb,
  alter column draft_theme_json set not null;

comment on column public.organisation_branding.logo_icon_url is
  'Canonical compact logo mark for client-facing white-label surfaces.';
comment on column public.organisation_branding.hero_image_url is
  'Canonical hero/background image for client-facing onboarding and portal landing surfaces.';
comment on column public.organisation_branding.primary_color is
  'Canonical white-label primary brand colour. Legacy primary_brand_color remains as a compatibility alias.';
comment on column public.organisation_branding.accent_color is
  'Canonical white-label accent colour. Legacy accent_brand_color remains as a compatibility alias.';
comment on column public.organisation_branding.theme_json is
  'Published normalized client brand theme consumed by buyer, seller, portal, tracker and email surfaces.';
comment on column public.organisation_branding.draft_theme_json is
  'Unpublished client brand theme draft used for previews before publishing.';
comment on column public.organisation_branding.published_at is
  'Timestamp for the currently published client brand theme.';

create index if not exists organisation_branding_published_at_idx
  on public.organisation_branding (published_at desc)
  where published_at is not null;

create index if not exists organisation_branding_theme_json_gin_idx
  on public.organisation_branding using gin (theme_json);

create index if not exists organisation_branding_draft_theme_json_gin_idx
  on public.organisation_branding using gin (draft_theme_json);

insert into public.organisation_branding (
  organisation_id,
  organisation_display_name,
  logo_light_url,
  logo_dark_url,
  metadata_json,
  published_at
)
select
  org.id,
  coalesce(nullif(trim(org.display_name), ''), nullif(trim(org.name), ''), 'Arch9 Organisation'),
  nullif(trim(org.logo_url), ''),
  nullif(trim(org.logo_url), ''),
  jsonb_build_object('source', 'client_branding_canonical_phase1_org_backfill'),
  case
    when nullif(trim(org.logo_url), '') is not null then now()
    else null
  end
from public.organisations org
where not exists (
  select 1
  from public.organisation_branding branding
  where branding.organisation_id = org.id
);

with settings_branding as (
  select
    os.organisation_id,
    case
      when jsonb_typeof(os.settings_json #> '{agencyOnboarding,branding}') = 'object' then os.settings_json #> '{agencyOnboarding,branding}'
      when jsonb_typeof(os.settings_json #> '{agency_onboarding,branding}') = 'object' then os.settings_json #> '{agency_onboarding,branding}'
      when jsonb_typeof(os.settings_json -> 'branding') = 'object' then os.settings_json -> 'branding'
      else '{}'::jsonb
    end as branding,
    case
      when jsonb_typeof(os.settings_json #> '{agencyOnboarding,agencyInformation}') = 'object' then os.settings_json #> '{agencyOnboarding,agencyInformation}'
      when jsonb_typeof(os.settings_json #> '{agency_onboarding,agencyInformation}') = 'object' then os.settings_json #> '{agency_onboarding,agencyInformation}'
      else '{}'::jsonb
    end as agency_information
  from public.organisation_settings os
  where os.settings_json is not null
)
update public.organisation_branding ob
set
  organisation_display_name = coalesce(
    case
      when lower(nullif(trim(ob.organisation_display_name), '')) in ('bridge organisation', 'arch9 organisation', 'your property team') then null
      else nullif(trim(ob.organisation_display_name), '')
    end,
    nullif(trim(settings_branding.branding ->> 'organisationName'), ''),
    nullif(trim(settings_branding.branding ->> 'agencyName'), ''),
    nullif(trim(settings_branding.branding ->> 'name'), ''),
    nullif(trim(settings_branding.agency_information ->> 'agencyName'), ''),
    ob.organisation_display_name
  ),
  logo_light_url = coalesce(
    nullif(trim(ob.logo_light_url), ''),
    nullif(trim(settings_branding.branding ->> 'logoLight'), ''),
    nullif(trim(settings_branding.branding ->> 'logoLightUrl'), ''),
    nullif(trim(settings_branding.branding ->> 'logoUrl'), ''),
    nullif(trim(settings_branding.branding ->> 'logo_url'), ''),
    ob.logo_light_url
  ),
  logo_dark_url = coalesce(
    nullif(trim(ob.logo_dark_url), ''),
    nullif(trim(settings_branding.branding ->> 'logoDark'), ''),
    nullif(trim(settings_branding.branding ->> 'logoDarkUrl'), ''),
    nullif(trim(settings_branding.branding ->> 'logoHighContrast'), ''),
    nullif(trim(settings_branding.branding ->> 'logoHighContrastUrl'), ''),
    nullif(trim(settings_branding.branding ->> 'logoUrl'), ''),
    nullif(trim(settings_branding.branding ->> 'logo_url'), ''),
    ob.logo_dark_url
  ),
  logo_icon_url = coalesce(
    nullif(trim(ob.logo_icon_url), ''),
    nullif(trim(settings_branding.branding ->> 'logoIcon'), ''),
    nullif(trim(settings_branding.branding ->> 'logoIconUrl'), ''),
    nullif(trim(settings_branding.branding ->> 'logo_icon_url'), ''),
    ob.logo_icon_url
  ),
  hero_image_url = coalesce(
    nullif(trim(ob.hero_image_url), ''),
    nullif(trim(settings_branding.branding ->> 'heroImage'), ''),
    nullif(trim(settings_branding.branding ->> 'heroImageUrl'), ''),
    nullif(trim(settings_branding.branding ->> 'backgroundImage'), ''),
    nullif(trim(settings_branding.branding ->> 'backgroundImageUrl'), ''),
    nullif(trim(settings_branding.branding ->> 'coverImageUrl'), ''),
    ob.hero_image_url
  ),
  primary_color = coalesce(
    nullif(trim(ob.primary_color), ''),
    nullif(trim(ob.primary_brand_color), ''),
    nullif(trim(settings_branding.branding ->> 'primaryColor'), ''),
    nullif(trim(settings_branding.branding ->> 'primaryColour'), ''),
    nullif(trim(settings_branding.branding #>> '{brandColours,primary}'), ''),
    nullif(trim(settings_branding.branding ->> 'brandPrimaryColor'), ''),
    ob.primary_color
  ),
  secondary_color = coalesce(
    nullif(trim(ob.secondary_color), ''),
    nullif(trim(ob.secondary_brand_color), ''),
    nullif(trim(settings_branding.branding ->> 'secondaryColor'), ''),
    nullif(trim(settings_branding.branding ->> 'secondaryColour'), ''),
    nullif(trim(settings_branding.branding #>> '{brandColours,secondary}'), ''),
    ob.secondary_color
  ),
  accent_color = coalesce(
    nullif(trim(ob.accent_color), ''),
    nullif(trim(ob.accent_brand_color), ''),
    nullif(trim(settings_branding.branding ->> 'accentColor'), ''),
    nullif(trim(settings_branding.branding ->> 'accentColour'), ''),
    nullif(trim(settings_branding.branding #>> '{brandColours,accent}'), ''),
    ob.accent_color
  ),
  neutral_color = coalesce(
    nullif(trim(ob.neutral_color), ''),
    nullif(trim(settings_branding.branding ->> 'neutralColor'), ''),
    nullif(trim(settings_branding.branding ->> 'neutralColour'), ''),
    nullif(trim(settings_branding.branding #>> '{brandColours,neutral}'), ''),
    ob.neutral_color
  ),
  suggested_primary_color = coalesce(
    nullif(trim(ob.suggested_primary_color), ''),
    nullif(trim(settings_branding.branding ->> 'suggestedPrimaryColor'), ''),
    nullif(trim(settings_branding.branding ->> 'suggestedPrimaryColour'), ''),
    nullif(trim(settings_branding.branding #>> '{suggestedColours,primary}'), ''),
    nullif(trim(settings_branding.branding #>> '{suggestedColors,primary}'), ''),
    ob.suggested_primary_color
  ),
  suggested_accent_color = coalesce(
    nullif(trim(ob.suggested_accent_color), ''),
    nullif(trim(settings_branding.branding ->> 'suggestedAccentColor'), ''),
    nullif(trim(settings_branding.branding ->> 'suggestedAccentColour'), ''),
    nullif(trim(settings_branding.branding #>> '{suggestedColours,accent}'), ''),
    nullif(trim(settings_branding.branding #>> '{suggestedColors,accent}'), ''),
    ob.suggested_accent_color
  ),
  logo_light_bucket = coalesce(nullif(trim(ob.logo_light_bucket), ''), nullif(trim(settings_branding.branding ->> 'logoLightBucket'), ''), ob.logo_light_bucket),
  logo_light_path = coalesce(nullif(trim(ob.logo_light_path), ''), nullif(trim(settings_branding.branding ->> 'logoLightPath'), ''), ob.logo_light_path),
  logo_dark_bucket = coalesce(nullif(trim(ob.logo_dark_bucket), ''), nullif(trim(settings_branding.branding ->> 'logoDarkBucket'), ''), ob.logo_dark_bucket),
  logo_dark_path = coalesce(nullif(trim(ob.logo_dark_path), ''), nullif(trim(settings_branding.branding ->> 'logoDarkPath'), ''), ob.logo_dark_path),
  logo_icon_bucket = coalesce(nullif(trim(ob.logo_icon_bucket), ''), nullif(trim(settings_branding.branding ->> 'logoIconBucket'), ''), ob.logo_icon_bucket),
  logo_icon_path = coalesce(nullif(trim(ob.logo_icon_path), ''), nullif(trim(settings_branding.branding ->> 'logoIconPath'), ''), ob.logo_icon_path),
  hero_image_bucket = coalesce(
    nullif(trim(ob.hero_image_bucket), ''),
    nullif(trim(settings_branding.branding ->> 'heroImageBucket'), ''),
    nullif(trim(settings_branding.branding ->> 'backgroundImageBucket'), ''),
    ob.hero_image_bucket
  ),
  hero_image_path = coalesce(
    nullif(trim(ob.hero_image_path), ''),
    nullif(trim(settings_branding.branding ->> 'heroImagePath'), ''),
    nullif(trim(settings_branding.branding ->> 'backgroundImagePath'), ''),
    ob.hero_image_path
  ),
  metadata_json = coalesce(ob.metadata_json, '{}'::jsonb) ||
    jsonb_build_object(
      'canonicalBrandingPhase', 'phase1',
      'legacyBrandingBackfilledAt', now(),
      'legacyBrandingSource', 'organisation_settings.agencyOnboarding.branding',
      'legacyBrandingKeys', (
        select coalesce(jsonb_agg(keys.key order by keys.key), '[]'::jsonb)
        from jsonb_object_keys(settings_branding.branding) as keys(key)
      )
    )
from settings_branding
where ob.organisation_id = settings_branding.organisation_id
  and settings_branding.branding <> '{}'::jsonb;

update public.organisation_branding ob
set
  logo_light_url = coalesce(nullif(trim(ob.logo_light_url), ''), nullif(trim(org.logo_url), ''), ob.logo_light_url),
  logo_dark_url = coalesce(nullif(trim(ob.logo_dark_url), ''), nullif(trim(org.logo_url), ''), ob.logo_dark_url),
  organisation_display_name = coalesce(
    case
      when lower(nullif(trim(ob.organisation_display_name), '')) in ('bridge organisation', 'arch9 organisation', 'your property team') then null
      else nullif(trim(ob.organisation_display_name), '')
    end,
    nullif(trim(org.display_name), ''),
    nullif(trim(org.name), ''),
    ob.organisation_display_name
  )
from public.organisations org
where org.id = ob.organisation_id;

update public.organisation_branding
set
  primary_color = coalesce(nullif(trim(primary_color), ''), nullif(trim(primary_brand_color), '')),
  secondary_color = coalesce(nullif(trim(secondary_color), ''), nullif(trim(secondary_brand_color), '')),
  accent_color = coalesce(nullif(trim(accent_color), ''), nullif(trim(accent_brand_color), ''));

update public.organisation_branding
set
  primary_brand_color = coalesce(nullif(trim(primary_color), ''), nullif(trim(primary_brand_color), '')),
  secondary_brand_color = coalesce(nullif(trim(secondary_color), ''), nullif(trim(secondary_brand_color), '')),
  accent_brand_color = coalesce(nullif(trim(accent_color), ''), nullif(trim(accent_brand_color), ''));

update public.organisation_branding
set
  theme_json = coalesce(theme_json, '{}'::jsonb) ||
    jsonb_strip_nulls(
      jsonb_build_object(
        'version', 1,
        'organisationName', nullif(trim(organisation_display_name), ''),
        'logoLightUrl', nullif(trim(logo_light_url), ''),
        'logoDarkUrl', nullif(trim(logo_dark_url), ''),
        'logoIconUrl', nullif(trim(logo_icon_url), ''),
        'heroImageUrl', nullif(trim(hero_image_url), ''),
        'primaryColor', nullif(trim(primary_color), ''),
        'secondaryColor', nullif(trim(secondary_color), ''),
        'accentColor', nullif(trim(accent_color), ''),
        'neutralColor', nullif(trim(neutral_color), '')
      )
    ),
  draft_theme_json = coalesce(draft_theme_json, '{}'::jsonb),
  published_at = coalesce(
    published_at,
    case
      when coalesce(
        nullif(trim(logo_light_url), ''),
        nullif(trim(logo_dark_url), ''),
        nullif(trim(logo_icon_url), ''),
        nullif(trim(hero_image_url), ''),
        nullif(trim(primary_color), ''),
        nullif(trim(accent_color), '')
      ) is not null then coalesce(updated_at, created_at, now())
      else null
    end
  ),
  metadata_json = coalesce(metadata_json, '{}'::jsonb) ||
    jsonb_build_object(
      'canonicalThemeVersion', 1,
      'canonicalThemeNormalizedAt', now()
    );

commit;
