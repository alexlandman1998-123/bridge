-- Keep the agency onboarding branding editor and the canonical email-branding
-- row in sync. Email headers are dark, so logo_dark_url is the logo intended
-- for a dark surface (typically the inverse/light mark).
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
    primary_brand_color,
    secondary_brand_color,
    metadata_json
  ) values (
    new.organisation_id,
    v_logo_light_url,
    v_logo_dark_url,
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
    primary_brand_color = coalesce(excluded.primary_brand_color, public.organisation_branding.primary_brand_color),
    secondary_brand_color = coalesce(excluded.secondary_brand_color, public.organisation_branding.secondary_brand_color),
    metadata_json = coalesce(public.organisation_branding.metadata_json, '{}'::jsonb)
      || excluded.metadata_json,
    updated_at = now();

  return new;
end;
$$;

revoke all on function public.bridge_sync_agency_onboarding_email_branding() from public, anon, authenticated;

drop trigger if exists trg_bridge_sync_agency_onboarding_email_branding on public.organisation_settings;
create trigger trg_bridge_sync_agency_onboarding_email_branding
after insert or update of settings_json on public.organisation_settings
for each row
execute function public.bridge_sync_agency_onboarding_email_branding();

-- Backfill the canonical row from the current agency-branding source. Existing
-- values are retained only where an agency has not supplied that variant.
update public.organisation_settings
set settings_json = settings_json
where jsonb_typeof(settings_json #> '{agencyOnboarding,branding}') = 'object'
   or jsonb_typeof(settings_json #> '{agency_onboarding,branding}') = 'object'
   or jsonb_typeof(settings_json -> 'branding') = 'object';
