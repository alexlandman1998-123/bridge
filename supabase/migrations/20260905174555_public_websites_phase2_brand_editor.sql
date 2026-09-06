begin;

create or replace function public.website_update_draft_brand(
  p_website_site_id uuid,
  p_revision_id uuid,
  p_brand_patch jsonb default '{}'::jsonb,
  p_reset_to_organisation boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_site public.website_sites%rowtype;
  v_organisation public.organisations%rowtype;
  v_branding public.organisation_branding%rowtype;
  v_current_brand jsonb;
  v_next_brand jsonb;
  v_value text;
  v_logo_light_url text;
  v_logo_dark_url text;
begin
  if v_user_id is null then
    raise exception 'Authentication is required to edit website branding.' using errcode = '42501';
  end if;

  if p_brand_patch is null or jsonb_typeof(p_brand_patch) <> 'object' then
    raise exception 'Website branding must be a JSON object.' using errcode = '22023';
  end if;

  if (p_brand_patch - array[
    'name',
    'logoLightUrl',
    'logoDarkUrl',
    'primaryColor',
    'secondaryColor',
    'accentColor',
    'phone',
    'email',
    'website',
    'whatsappNumber'
  ]) <> '{}'::jsonb then
    raise exception 'Website branding contains unsupported fields.' using errcode = '22023';
  end if;

  foreach v_value in array array[
    'name',
    'logoLightUrl',
    'logoDarkUrl',
    'primaryColor',
    'secondaryColor',
    'accentColor',
    'phone',
    'email',
    'website',
    'whatsappNumber'
  ] loop
    if p_brand_patch ? v_value and jsonb_typeof(p_brand_patch -> v_value) <> 'string' then
      raise exception '% must be a text value.', v_value using errcode = '22023';
    end if;
  end loop;

  select site.*
  into v_site
  from public.website_sites site
  where site.id = p_website_site_id;

  if not found then
    raise exception 'Website site not found.' using errcode = 'P0002';
  end if;

  if not public.bridge_is_org_admin(v_site.organisation_id) then
    raise exception 'Only organisation administrators can edit website branding.' using errcode = '42501';
  end if;

  select revision.brand_json
  into v_current_brand
  from public.website_site_revisions revision
  where revision.id = p_revision_id
    and revision.website_site_id = v_site.id
    and revision.status = 'draft'
  for update;

  if not found then
    raise exception 'An editable website draft was not found.' using errcode = 'P0002';
  end if;

  if p_reset_to_organisation then
    select organisation.*
    into v_organisation
    from public.organisations organisation
    where organisation.id = v_site.organisation_id;

    select branding.*
    into v_branding
    from public.organisation_branding branding
    where branding.organisation_id = v_site.organisation_id;

    v_logo_light_url := coalesce(nullif(trim(v_branding.logo_light_url), ''), nullif(trim(v_organisation.logo_url), ''));
    v_logo_dark_url := coalesce(nullif(trim(v_branding.logo_dark_url), ''), nullif(trim(v_organisation.logo_dark_url), ''), v_logo_light_url);

    v_next_brand := jsonb_strip_nulls(jsonb_build_object(
      'name', coalesce(
        nullif(trim(v_branding.organisation_display_name), ''),
        nullif(trim(v_organisation.display_name), ''),
        nullif(trim(v_organisation.name), ''),
        nullif(trim(v_organisation.legal_name), ''),
        'Property Agency'
      ),
      'logoUrl', coalesce(v_logo_dark_url, v_logo_light_url),
      'logoLightUrl', v_logo_light_url,
      'logoDarkUrl', v_logo_dark_url,
      'primaryColor', coalesce(nullif(trim(v_branding.primary_brand_color), ''), nullif(trim(v_organisation.primary_colour), ''), '#125b50'),
      'secondaryColor', coalesce(nullif(trim(v_branding.secondary_brand_color), ''), nullif(trim(v_organisation.secondary_colour), ''), '#e7bc71'),
      'accentColor', coalesce(nullif(trim(v_branding.accent_brand_color), ''), nullif(trim(v_branding.secondary_brand_color), ''), nullif(trim(v_organisation.secondary_colour), ''), '#e7bc71'),
      'phone', coalesce(
        nullif(trim(v_branding.support_phone), ''),
        nullif(trim(v_organisation.support_phone), ''),
        nullif(trim(v_organisation.company_phone), ''),
        nullif(trim(v_organisation.phone), '')
      ),
      'email', coalesce(
        nullif(lower(trim(v_branding.support_email)), ''),
        nullif(lower(trim(v_organisation.support_email)), ''),
        nullif(lower(trim(v_organisation.company_email)), ''),
        nullif(lower(trim(v_organisation.email)), '')
      ),
      'website', coalesce(nullif(trim(v_branding.support_website), ''), nullif(trim(v_organisation.website), '')),
      'whatsappNumber', coalesce(
        nullif(trim(v_branding.metadata_json ->> 'whatsappNumber'), ''),
        nullif(trim(v_branding.metadata_json ->> 'whatsapp_number'), ''),
        nullif(trim(v_branding.metadata_json ->> 'whatsapp'), ''),
        nullif(trim(v_branding.support_phone), ''),
        nullif(trim(v_organisation.support_phone), ''),
        nullif(trim(v_organisation.company_phone), ''),
        nullif(trim(v_organisation.phone), '')
      ),
      'seedSource', 'organisation_branding',
      'seededAt', coalesce(v_current_brand -> 'seededAt', to_jsonb(now())),
      'resetAt', now(),
      'updatedAt', now(),
      'updatedBy', v_user_id
    ));
  else
    v_next_brand := coalesce(v_current_brand, '{}'::jsonb);

    if p_brand_patch ? 'name' then
      v_value := left(trim(p_brand_patch ->> 'name'), 160);
      if v_value = '' then raise exception 'Company display name is required.' using errcode = '22023'; end if;
      v_next_brand := jsonb_set(v_next_brand, '{name}', to_jsonb(v_value), true);
    end if;

    if p_brand_patch ? 'primaryColor' then
      v_value := lower(trim(p_brand_patch ->> 'primaryColor'));
      if v_value !~ '^#[0-9a-f]{6}$' then raise exception 'Primary colour must be a six-digit hex colour.' using errcode = '22023'; end if;
      v_next_brand := jsonb_set(v_next_brand, '{primaryColor}', to_jsonb(v_value), true);
    end if;

    if p_brand_patch ? 'secondaryColor' then
      v_value := lower(trim(p_brand_patch ->> 'secondaryColor'));
      if v_value !~ '^#[0-9a-f]{6}$' then raise exception 'Secondary colour must be a six-digit hex colour.' using errcode = '22023'; end if;
      v_next_brand := jsonb_set(v_next_brand, '{secondaryColor}', to_jsonb(v_value), true);
    end if;

    if p_brand_patch ? 'accentColor' then
      v_value := lower(trim(p_brand_patch ->> 'accentColor'));
      if v_value !~ '^#[0-9a-f]{6}$' then raise exception 'Accent colour must be a six-digit hex colour.' using errcode = '22023'; end if;
      v_next_brand := jsonb_set(v_next_brand, '{accentColor}', to_jsonb(v_value), true);
    end if;

    foreach v_value in array array['logoLightUrl', 'logoDarkUrl', 'website'] loop
      if p_brand_patch ? v_value then
        if nullif(trim(p_brand_patch ->> v_value), '') is null then
          v_next_brand := v_next_brand - v_value;
        elsif length(trim(p_brand_patch ->> v_value)) > 2048 or trim(p_brand_patch ->> v_value) !~* '^https://[^[:space:]]+$' then
          raise exception '% must be a valid HTTPS URL.', v_value using errcode = '22023';
        else
          v_next_brand := jsonb_set(v_next_brand, array[v_value], to_jsonb(trim(p_brand_patch ->> v_value)), true);
        end if;
      end if;
    end loop;

    if p_brand_patch ? 'email' then
      v_value := lower(trim(p_brand_patch ->> 'email'));
      if v_value = '' then
        v_next_brand := v_next_brand - 'email';
      elsif length(v_value) > 254 or v_value !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then
        raise exception 'Contact email must be valid.' using errcode = '22023';
      else
        v_next_brand := jsonb_set(v_next_brand, '{email}', to_jsonb(v_value), true);
      end if;
    end if;

    foreach v_value in array array['phone', 'whatsappNumber'] loop
      if p_brand_patch ? v_value then
        if nullif(trim(p_brand_patch ->> v_value), '') is null then
          v_next_brand := v_next_brand - v_value;
        elsif length(trim(p_brand_patch ->> v_value)) > 64 then
          raise exception '% is too long.', v_value using errcode = '22023';
        else
          v_next_brand := jsonb_set(v_next_brand, array[v_value], to_jsonb(trim(p_brand_patch ->> v_value)), true);
        end if;
      end if;
    end loop;

    v_logo_light_url := nullif(v_next_brand ->> 'logoLightUrl', '');
    v_logo_dark_url := nullif(v_next_brand ->> 'logoDarkUrl', '');
    if coalesce(v_logo_dark_url, v_logo_light_url) is null then
      v_next_brand := v_next_brand - 'logoUrl';
    else
      v_next_brand := jsonb_set(v_next_brand, '{logoUrl}', to_jsonb(coalesce(v_logo_dark_url, v_logo_light_url)), true);
    end if;
    v_next_brand := jsonb_set(v_next_brand, '{updatedAt}', to_jsonb(now()), true);
    v_next_brand := jsonb_set(v_next_brand, '{updatedBy}', to_jsonb(v_user_id), true);
  end if;

  update public.website_site_revisions revision
  set brand_json = jsonb_strip_nulls(v_next_brand),
      updated_at = now()
  where revision.id = p_revision_id;

  return jsonb_strip_nulls(v_next_brand);
end;
$$;

revoke all on function public.website_update_draft_brand(uuid, uuid, jsonb, boolean) from public, anon;
grant execute on function public.website_update_draft_brand(uuid, uuid, jsonb, boolean) to authenticated;

comment on function public.website_update_draft_brand(uuid, uuid, jsonb, boolean) is
  'Updates allow-listed website identity values on an organisation-admin-owned draft, or resets that draft from current organisation branding.';

notify pgrst, 'reload schema';

commit;
