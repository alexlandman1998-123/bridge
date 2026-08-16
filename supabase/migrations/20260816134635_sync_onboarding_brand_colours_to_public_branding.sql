begin;

create or replace function public.bridge_sync_onboarding_branding_to_public_branding()
returns trigger
language plpgsql
set search_path = public, extensions
as $$
declare
  v_organisation public.organisations%rowtype;
  v_settings jsonb := coalesce(new.settings_json, '{}'::jsonb);
  v_agency_onboarding jsonb := '{}'::jsonb;
  v_agency_information jsonb := '{}'::jsonb;
  v_branding jsonb := '{}'::jsonb;
  v_brand_colours jsonb := '{}'::jsonb;
  v_display_name text := null;
  v_primary_colour text := null;
  v_secondary_colour text := null;
  v_accent_colour text := null;
begin
  if new.organisation_id is null then
    return new;
  end if;

  select * into v_organisation
  from public.organisations
  where id = new.organisation_id
  limit 1;

  v_agency_onboarding := coalesce(
    v_settings -> 'agencyOnboarding',
    v_settings -> 'agency_onboarding',
    '{}'::jsonb
  );
  v_agency_information := coalesce(
    v_agency_onboarding -> 'agencyInformation',
    v_agency_onboarding -> 'agency_information',
    '{}'::jsonb
  );
  v_branding := coalesce(
    v_agency_onboarding -> 'branding',
    v_settings -> 'branding',
    '{}'::jsonb
  );
  v_brand_colours := coalesce(
    v_branding -> 'brandColours',
    v_branding -> 'brandColors',
    v_branding -> 'brand_colours',
    v_branding -> 'brand_colors',
    '{}'::jsonb
  );

  v_display_name := nullif(trim(coalesce(
    v_agency_information ->> 'tradingName',
    v_agency_information ->> 'trading_name',
    v_agency_information ->> 'agencyName',
    v_agency_information ->> 'agency_name',
    v_organisation.display_name,
    v_organisation.name,
    ''
  )), '');
  v_primary_colour := nullif(trim(coalesce(
    v_brand_colours ->> 'primary',
    v_branding ->> 'primaryColour',
    v_branding ->> 'primaryColor',
    v_branding ->> 'primary_colour',
    v_branding ->> 'primary_color',
    ''
  )), '');
  v_secondary_colour := nullif(trim(coalesce(
    v_brand_colours ->> 'secondary',
    v_branding ->> 'secondaryColour',
    v_branding ->> 'secondaryColor',
    v_branding ->> 'secondary_colour',
    v_branding ->> 'secondary_color',
    ''
  )), '');
  v_accent_colour := nullif(trim(coalesce(
    v_brand_colours ->> 'accent',
    v_branding ->> 'accentColour',
    v_branding ->> 'accentColor',
    v_branding ->> 'accent_colour',
    v_branding ->> 'accent_color',
    ''
  )), '');

  if coalesce(v_display_name, v_primary_colour, v_secondary_colour, v_accent_colour) is null then
    return new;
  end if;

  insert into public.organisation_branding (
    organisation_id,
    organisation_display_name,
    primary_brand_color,
    secondary_brand_color,
    accent_brand_color,
    metadata_json
  )
  values (
    new.organisation_id,
    v_display_name,
    v_primary_colour,
    v_secondary_colour,
    v_accent_colour,
    jsonb_build_object(
      'settingsBrandColoursSyncedAt', now(),
      'settingsBrandColoursSource', 'organisation_settings.agencyOnboarding.branding'
    )
  )
  on conflict (organisation_id) do update
  set
    organisation_display_name = coalesce(v_display_name, public.organisation_branding.organisation_display_name),
    primary_brand_color = coalesce(v_primary_colour, public.organisation_branding.primary_brand_color),
    secondary_brand_color = coalesce(v_secondary_colour, public.organisation_branding.secondary_brand_color),
    accent_brand_color = coalesce(v_accent_colour, public.organisation_branding.accent_brand_color),
    metadata_json = coalesce(public.organisation_branding.metadata_json, '{}'::jsonb) || jsonb_build_object(
      'settingsBrandColoursSyncedAt', now(),
      'settingsBrandColoursSource', 'organisation_settings.agencyOnboarding.branding'
    ),
    updated_at = now();

  return new;
end;
$$;

revoke all on function public.bridge_sync_onboarding_branding_to_public_branding() from public;

drop trigger if exists trg_bridge_sync_onboarding_branding_to_public_branding on public.organisation_settings;
create trigger trg_bridge_sync_onboarding_branding_to_public_branding
after insert or update of settings_json on public.organisation_settings
for each row
execute function public.bridge_sync_onboarding_branding_to_public_branding();

insert into public.organisation_branding (
  organisation_id,
  organisation_display_name,
  primary_brand_color,
  secondary_brand_color,
  accent_brand_color,
  metadata_json
)
select
  settings.organisation_id,
  nullif(trim(coalesce(
    agency_information ->> 'tradingName',
    agency_information ->> 'trading_name',
    agency_information ->> 'agencyName',
    agency_information ->> 'agency_name',
    org.display_name,
    org.name,
    ''
  )), ''),
  nullif(trim(coalesce(
    brand_colours ->> 'primary',
    branding ->> 'primaryColour',
    branding ->> 'primaryColor',
    branding ->> 'primary_colour',
    branding ->> 'primary_color',
    ''
  )), ''),
  nullif(trim(coalesce(
    brand_colours ->> 'secondary',
    branding ->> 'secondaryColour',
    branding ->> 'secondaryColor',
    branding ->> 'secondary_colour',
    branding ->> 'secondary_color',
    ''
  )), ''),
  nullif(trim(coalesce(
    brand_colours ->> 'accent',
    branding ->> 'accentColour',
    branding ->> 'accentColor',
    branding ->> 'accent_colour',
    branding ->> 'accent_color',
    ''
  )), ''),
  jsonb_build_object(
    'settingsBrandColoursSyncedAt', now(),
    'settingsBrandColoursSource', 'organisation_settings.agencyOnboarding.branding',
    'settingsBrandColoursBackfilled', true
  )
from public.organisation_settings settings
join public.organisations org on org.id = settings.organisation_id
cross join lateral (
  select coalesce(
    settings.settings_json -> 'agencyOnboarding',
    settings.settings_json -> 'agency_onboarding',
    '{}'::jsonb
  ) as agency_onboarding
) onboarding_source
cross join lateral (
  select coalesce(
    agency_onboarding -> 'agencyInformation',
    agency_onboarding -> 'agency_information',
    '{}'::jsonb
  ) as agency_information
) information_source
cross join lateral (
  select coalesce(
    agency_onboarding -> 'branding',
    settings.settings_json -> 'branding',
    '{}'::jsonb
  ) as branding
) branding_source
cross join lateral (
  select coalesce(
    branding -> 'brandColours',
    branding -> 'brandColors',
    branding -> 'brand_colours',
    branding -> 'brand_colors',
    '{}'::jsonb
  ) as brand_colours
) colour_source
where coalesce(
  nullif(trim(brand_colours ->> 'primary'), ''),
  nullif(trim(branding ->> 'primaryColour'), ''),
  nullif(trim(branding ->> 'primaryColor'), ''),
  nullif(trim(branding ->> 'primary_colour'), ''),
  nullif(trim(branding ->> 'primary_color'), ''),
  nullif(trim(brand_colours ->> 'secondary'), ''),
  nullif(trim(branding ->> 'secondaryColour'), ''),
  nullif(trim(branding ->> 'secondaryColor'), ''),
  nullif(trim(branding ->> 'secondary_colour'), ''),
  nullif(trim(branding ->> 'secondary_color'), ''),
  nullif(trim(brand_colours ->> 'accent'), ''),
  nullif(trim(branding ->> 'accentColour'), ''),
  nullif(trim(branding ->> 'accentColor'), ''),
  nullif(trim(branding ->> 'accent_colour'), ''),
  nullif(trim(branding ->> 'accent_color'), '')
) is not null
on conflict (organisation_id) do update
set
  organisation_display_name = coalesce(excluded.organisation_display_name, public.organisation_branding.organisation_display_name),
  primary_brand_color = coalesce(excluded.primary_brand_color, public.organisation_branding.primary_brand_color),
  secondary_brand_color = coalesce(excluded.secondary_brand_color, public.organisation_branding.secondary_brand_color),
  accent_brand_color = coalesce(excluded.accent_brand_color, public.organisation_branding.accent_brand_color),
  metadata_json = coalesce(public.organisation_branding.metadata_json, '{}'::jsonb) || excluded.metadata_json,
  updated_at = now();

notify pgrst, 'reload schema';

commit;
