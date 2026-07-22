begin;

create or replace function public.bridge_private_listing_seller_portal_payload(
  p_token text,
  p_access_token text default null,
  p_require_access boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_resolution record;
  v_result jsonb;
  v_listing_json jsonb;
  v_organisation_id uuid;
  v_organisation public.organisations%rowtype;
  v_settings_json jsonb := '{}'::jsonb;
  v_agency_onboarding jsonb := '{}'::jsonb;
  v_agency_information jsonb := '{}'::jsonb;
  v_branding jsonb := '{}'::jsonb;
  v_brand_colours jsonb := '{}'::jsonb;
  v_organisation_name text := '';
  v_logo_light_url text := '';
  v_logo_dark_url text := '';
  v_logo_icon_url text := '';
  v_logo_url text := '';
  v_portal_branding jsonb := '{}'::jsonb;
begin
  select * into v_resolution from public.bridge_resolve_private_listing_seller_portal_token(p_token);
  if not found or not v_resolution.token_valid then return null; end if;

  v_result := public.bridge_private_listing_seller_portal_payload_phase1(
    v_resolution.legacy_token,
    p_access_token,
    p_require_access
  );
  if v_result is null then return null; end if;

  v_listing_json := case
    when jsonb_typeof(v_result -> 'listing') = 'object' then v_result -> 'listing'
    else '{}'::jsonb
  end;
  v_organisation_id := nullif(v_listing_json ->> 'organisation_id', '')::uuid;

  if v_organisation_id is not null then
    select * into v_organisation
    from public.organisations
    where id = v_organisation_id
    limit 1;

    select coalesce(settings_json, '{}'::jsonb) into v_settings_json
    from public.organisation_settings
    where organisation_id = v_organisation_id
    limit 1;

    v_agency_onboarding := coalesce(
      v_settings_json -> 'agencyOnboarding',
      v_settings_json -> 'agency_onboarding',
      '{}'::jsonb
    );
    v_agency_information := coalesce(
      v_agency_onboarding -> 'agencyInformation',
      v_agency_onboarding -> 'agency_information',
      '{}'::jsonb
    );
    v_branding := coalesce(
      v_agency_onboarding -> 'branding',
      v_settings_json -> 'branding',
      '{}'::jsonb
    );
    v_brand_colours := coalesce(
      v_branding -> 'brandColours',
      v_branding -> 'brandColors',
      v_branding -> 'brand_colours',
      v_branding -> 'brand_colors',
      '{}'::jsonb
    );

    v_organisation_name := nullif(trim(coalesce(
      v_agency_information ->> 'tradingName',
      v_agency_information ->> 'trading_name',
      v_agency_information ->> 'agencyName',
      v_agency_information ->> 'agency_name',
      v_organisation.display_name,
      v_organisation.name,
      ''
    )), '');
    v_logo_light_url := nullif(trim(coalesce(
      v_branding ->> 'logoLight',
      v_branding ->> 'logoLightUrl',
      v_branding ->> 'logo_light',
      v_branding ->> 'logo_light_url',
      v_organisation.logo_url,
      ''
    )), '');
    v_logo_dark_url := nullif(trim(coalesce(
      v_branding ->> 'logoDark',
      v_branding ->> 'logoDarkUrl',
      v_branding ->> 'logo_dark',
      v_branding ->> 'logo_dark_url',
      ''
    )), '');
    v_logo_icon_url := nullif(trim(coalesce(
      v_branding ->> 'logoIcon',
      v_branding ->> 'logoIconUrl',
      v_branding ->> 'logo_icon',
      v_branding ->> 'logo_icon_url',
      ''
    )), '');
    v_logo_url := coalesce(v_logo_dark_url, v_logo_light_url, v_logo_icon_url);

    v_portal_branding := jsonb_strip_nulls(jsonb_build_object(
      'organisationId', v_organisation_id,
      'organisationName', v_organisation_name,
      'agencyName', v_organisation_name,
      'logoUrl', v_logo_url,
      'logoDarkUrl', v_logo_dark_url,
      'logoLightUrl', v_logo_light_url,
      'logoIconUrl', v_logo_icon_url,
      'logoDark', v_logo_dark_url,
      'logoLight', v_logo_light_url,
      'primaryColour', nullif(trim(coalesce(
        v_brand_colours ->> 'primary',
        v_branding ->> 'primaryColour',
        v_branding ->> 'primaryColor',
        v_branding ->> 'primary_colour',
        v_branding ->> 'primary_color',
        ''
      )), ''),
      'secondaryColour', nullif(trim(coalesce(
        v_brand_colours ->> 'secondary',
        v_branding ->> 'secondaryColour',
        v_branding ->> 'secondaryColor',
        v_branding ->> 'secondary_colour',
        v_branding ->> 'secondary_color',
        ''
      )), ''),
      'accentColour', nullif(trim(coalesce(
        v_brand_colours ->> 'accent',
        v_branding ->> 'accentColour',
        v_branding ->> 'accentColor',
        v_branding ->> 'accent_colour',
        v_branding ->> 'accent_color',
        ''
      )), '')
    ));
  end if;

  if jsonb_typeof(v_result -> 'onboarding') = 'object' then
    if v_portal_branding <> '{}'::jsonb then
      v_result := jsonb_set(
        v_result,
        '{onboarding,form_data}',
        coalesce(v_result #> '{onboarding,form_data}', '{}'::jsonb) || jsonb_build_object(
          'portalBranding',
          coalesce(v_result #> '{onboarding,form_data,portalBranding}', '{}'::jsonb) || v_portal_branding
        ),
        true
      );
    end if;

    v_result := jsonb_set(
      v_result,
      '{onboarding}',
      (v_result -> 'onboarding') - 'seller_portal_invite_token_hash',
      true
    );
  end if;

  return v_result || jsonb_build_object(
    'tokenKind', v_resolution.token_kind,
    'stablePortalToken', v_resolution.stable_portal_token,
    'stablePortalPath', '/client/' || v_resolution.stable_portal_token || '/selling',
    'portalAccess', coalesce(v_result -> 'portalAccess', '{}'::jsonb) || jsonb_build_object(
      'tokenKind', v_resolution.token_kind,
      'stablePortalToken', v_resolution.stable_portal_token,
      'stablePortalPath', '/client/' || v_resolution.stable_portal_token || '/selling'
    )
  );
end;
$$;

grant execute on function public.bridge_private_listing_seller_portal_payload(text, text, boolean) to anon, authenticated;

notify pgrst, 'reload schema';

commit;
