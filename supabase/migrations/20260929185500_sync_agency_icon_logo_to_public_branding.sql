begin;

-- The website's /icon route reads organisation_branding.logo_icon_url. Keep it
-- in step with the Icon Logo saved by the agency branding editor.
create or replace function public.bridge_sync_agency_onboarding_email_branding()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_branding jsonb := '{}'::jsonb;
  v_logo_light_url text;
  v_logo_dark_url text;
  v_logo_icon_url text;
  v_primary_color text;
  v_secondary_color text;
begin
  if jsonb_typeof(new.settings_json #> '{agencyOnboarding,branding}') = 'object' then
    v_branding := new.settings_json #> '{agencyOnboarding,branding}';
  elsif jsonb_typeof(new.settings_json #> '{agency_onboarding,branding}') = 'object' then
    v_branding := new.settings_json #> '{agency_onboarding,branding}';
  elsif jsonb_typeof(new.settings_json -> 'branding') = 'object' then
    v_branding := new.settings_json -> 'branding';
  end if;

  if v_branding = '{}'::jsonb then
    return new;
  end if;

  v_logo_light_url := nullif(trim(coalesce(
    v_branding ->> 'logoLight',
    v_branding ->> 'logoLightUrl',
    v_branding ->> 'logo_light_url'
  )), '');
  v_logo_dark_url := nullif(trim(coalesce(
    v_branding ->> 'logoDark',
    v_branding ->> 'logoDarkUrl',
    v_branding ->> 'logo_dark_url'
  )), '');
  v_logo_icon_url := nullif(trim(coalesce(
    v_branding ->> 'logoIcon',
    v_branding ->> 'logoIconUrl',
    v_branding ->> 'logo_icon_url'
  )), '');
  v_primary_color := nullif(trim(coalesce(
    v_branding #>> '{brandColours,primary}',
    v_branding #>> '{brandColors,primary}',
    v_branding ->> 'primaryColor',
    v_branding ->> 'primary_color'
  )), '');
  v_secondary_color := nullif(trim(coalesce(
    v_branding #>> '{brandColours,secondary}',
    v_branding #>> '{brandColors,secondary}',
    v_branding ->> 'secondaryColor',
    v_branding ->> 'secondary_color'
  )), '');

  insert into public.organisation_branding (
    organisation_id,
    logo_light_url,
    logo_dark_url,
    logo_icon_url,
    primary_brand_color,
    secondary_brand_color,
    metadata_json
  ) values (
    new.organisation_id,
    v_logo_light_url,
    v_logo_dark_url,
    v_logo_icon_url,
    v_primary_color,
    v_secondary_color,
    jsonb_build_object(
      'emailBrandingSource', 'agency_onboarding_settings',
      'emailBrandingSyncedAt', now()
    )
  )
  on conflict (organisation_id)
  do update set
    logo_light_url = coalesce(excluded.logo_light_url, public.organisation_branding.logo_light_url),
    logo_dark_url = coalesce(excluded.logo_dark_url, public.organisation_branding.logo_dark_url),
    logo_icon_url = coalesce(excluded.logo_icon_url, public.organisation_branding.logo_icon_url),
    primary_brand_color = coalesce(excluded.primary_brand_color, public.organisation_branding.primary_brand_color),
    secondary_brand_color = coalesce(excluded.secondary_brand_color, public.organisation_branding.secondary_brand_color),
    metadata_json = coalesce(public.organisation_branding.metadata_json, '{}'::jsonb)
      || excluded.metadata_json,
    updated_at = now();

  return new;
end;
$$;

revoke all on function public.bridge_sync_agency_onboarding_email_branding() from public, anon, authenticated;

-- Existing Icon Logo uploads were never copied into the public branding row.
-- Fill only missing icons; the live data review found one such agency: Kingdom.
with current_icons as (
  select
    organisation_id,
    nullif(trim(coalesce(
      branding ->> 'logoIcon',
      branding ->> 'logoIconUrl',
      branding ->> 'logo_icon_url'
    )), '') as logo_icon_url
  from (
    select
      organisation_id,
      coalesce(
        settings_json #> '{agencyOnboarding,branding}',
        settings_json #> '{agency_onboarding,branding}',
        settings_json -> 'branding',
        '{}'::jsonb
      ) as branding
    from public.organisation_settings
  ) settings
)
insert into public.organisation_branding (organisation_id, logo_icon_url)
select organisation_id, logo_icon_url
from current_icons
where logo_icon_url is not null
on conflict (organisation_id) do update
set logo_icon_url = excluded.logo_icon_url,
    updated_at = now()
where public.organisation_branding.logo_icon_url is null;

commit;
