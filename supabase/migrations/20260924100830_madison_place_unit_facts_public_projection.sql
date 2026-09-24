-- Madison Place's imported inventory has no unit-level room/parking facts.
-- Store the supplied 3 bed / 2.5 bath / 2 garage specification once on its
-- catalogue type, then expose the linked type's facts to the public detail card.
-- The existing shared scope trigger accesses floorplan-only fields while
-- inserting a unit type because PL/pgSQL does not short-circuit that test.
-- Keep its validations but branch on the table before reading table-specific
-- NEW fields.
create or replace function public.bridge_validate_development_catalogue_scope()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  linked_development_id uuid;
begin
  if tg_table_name = 'development_floorplans' then
    if new.unit_type_id is not null then
      select development_id into linked_development_id
      from public.development_unit_types where id = new.unit_type_id;
      if linked_development_id is distinct from new.development_id then
        raise exception 'Floorplans must link to a unit type in the same development.';
      end if;
    end if;
  elsif tg_table_name = 'development_unit_prices' then
    select development_id into linked_development_id
    from public.development_price_books where id = new.price_book_id;
    if linked_development_id is distinct from new.development_id then
      raise exception 'Price books must belong to the same development.';
    end if;
    if new.unit_type_id is not null then
      select development_id into linked_development_id
      from public.development_unit_types where id = new.unit_type_id;
      if linked_development_id is distinct from new.development_id then
        raise exception 'Price unit types must belong to the same development.';
      end if;
    end if;
    if new.floorplan_id is not null then
      select development_id into linked_development_id
      from public.development_floorplans where id = new.floorplan_id;
      if linked_development_id is distinct from new.development_id then
        raise exception 'Price floorplans must belong to the same development.';
      end if;
    end if;
    if new.unit_id is not null then
      select development_id into linked_development_id
      from public.units where id = new.unit_id;
      if linked_development_id is distinct from new.development_id then
        raise exception 'Price units must belong to the same development.';
      end if;
    end if;
  elsif tg_table_name = 'units' then
    if new.unit_type_id is not null then
      select development_id into linked_development_id
      from public.development_unit_types where id = new.unit_type_id;
      if linked_development_id is distinct from new.development_id then
        raise exception 'Units must link to a unit type in the same development.';
      end if;
    end if;
    if new.catalogue_floorplan_id is not null then
      select development_id into linked_development_id
      from public.development_floorplans where id = new.catalogue_floorplan_id;
      if linked_development_id is distinct from new.development_id then
        raise exception 'Units must link to a floorplan in the same development.';
      end if;
    end if;
  end if;
  return new;
end;
$$;

do $$
declare
  target_development_id uuid;
  target_type_id uuid;
  unit_count integer;
begin
  select d.id into strict target_development_id
  from public.developments d
  join public.development_profiles p on p.development_id = d.id
  where lower(p.marketing_content #>> '{listingConfiguration,listingSlug}') = 'madison-place-abcf1b8a';

  select count(*) into unit_count
  from public.units
  where development_id = target_development_id;
  if unit_count <> 63 then
    raise exception 'Expected 63 Madison Place units, found %', unit_count;
  end if;

  insert into public.development_unit_types
    (development_id, code, name, bedrooms, bathrooms, parking_count, internal_size_sqm)
  select target_development_id, 'MADISON-3BR', '3 Bedroom Residence', 3, 2.5, 2, 230
  where not exists (
    select 1 from public.development_unit_types
    where development_id = target_development_id
      and lower(name) = '3 bedroom residence'
  );

  select id into strict target_type_id
  from public.development_unit_types
  where development_id = target_development_id
    and lower(name) = '3 bedroom residence';

  update public.development_unit_types
  set bedrooms = 3, bathrooms = 2.5, parking_count = 2,
      internal_size_sqm = 230, updated_at = now()
  where id = target_type_id;

  update public.units
  set unit_type_id = target_type_id
  where development_id = target_development_id
    and lower(unit_type) = '3 bedroom residence'
    and unit_type_id is null;

  select count(*) into unit_count
  from public.units
  where development_id = target_development_id
    and unit_type_id = target_type_id;
  if unit_count <> 63 then
    raise exception 'Expected 63 Madison Place units linked to the catalogue type, found %', unit_count;
  end if;
end $$;

create or replace function public.get_public_development_landing(requested_slug text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with published as (
    select d.id, d.organisation_id, d.name, d.location, d.suburb, d.city,
      d.province, d.developer_company, d.total_units_expected,
      p.marketing_content
    from public.developments d
    join public.development_profiles p on p.development_id = d.id
    where lower(p.marketing_content #>> '{listingConfiguration,listingSlug}') = lower(trim(requested_slug))
      and coalesce((p.marketing_content #>> '{listingConfiguration,publicVisibility}')::boolean, false)
      and lower(coalesce(p.marketing_content #>> '{listingConfiguration,marketingStatus}', 'draft')) = 'live'
    limit 1
  )
  select jsonb_build_object(
    'id', published.id,
    'organisationId', published.organisation_id,
    'name', published.name,
    'location', published.location,
    'suburb', published.suburb,
    'city', published.city,
    'province', published.province,
    'developerCompany', published.developer_company,
    'totalUnitsExpected', published.total_units_expected,
    'organisationBranding', jsonb_build_object(
      'organisationName', coalesce(org.display_name, org.name, published.developer_company),
      'logoUrl', coalesce(to_jsonb(branding)->>'logo_high_contrast_url', to_jsonb(branding)->>'logo_dark_url', to_jsonb(branding)->>'logo_light_url', to_jsonb(branding)->>'logo_icon_url', org.logo_url),
      'logoHighContrastUrl', to_jsonb(branding)->>'logo_high_contrast_url',
      'logoLightUrl', coalesce(to_jsonb(branding)->>'logo_light_url', org.logo_url),
      'logoDarkUrl', to_jsonb(branding)->>'logo_dark_url',
      'logoIconUrl', to_jsonb(branding)->>'logo_icon_url',
      'primaryColour', branding.primary_brand_color,
      'secondaryColour', branding.secondary_brand_color,
      'accentColour', branding.accent_brand_color
    ),
    'marketing', published.marketing_content,
    'inventory', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', u.id, 'unitNumber', u.unit_number, 'unitType', u.unit_type,
        'block', u.block, 'sizeSqm', u.size_sqm,
        'bedrooms', coalesce(u.bedrooms::numeric, t.bedrooms),
        'bathrooms', coalesce(u.bathrooms::numeric, t.bathrooms),
        'parkingCount', coalesce(u.parking_count::numeric, t.parking_count),
        'price', coalesce(u.current_price, u.list_price, u.price), 'status', u.status
      ) order by u.unit_number)
      from public.units u
      left join public.development_unit_types t
        on t.id = u.unit_type_id and t.development_id = u.development_id
      where u.development_id = published.id
    ), '[]'::jsonb),
    'assets', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', doc.id, 'title', doc.title, 'documentType', doc.document_type,
        'fileUrl', doc.file_url, 'linkedUnitType', doc.linked_unit_type
      ) order by doc.created_at)
      from public.development_documents doc
      where doc.development_id = published.id
        and lower(coalesce(doc.document_type, '')) in ('cover', 'floorplan', 'site_plan', 'marketing', 'logo', 'brochure')
    ), '[]'::jsonb)
  )
  from published
  left join public.organisations org on org.id = published.organisation_id
  left join public.organisation_branding branding on branding.organisation_id = published.organisation_id;
$$;

revoke execute on function public.get_public_development_landing(text) from public;
grant execute on function public.get_public_development_landing(text) to anon, authenticated;

notify pgrst, 'reload schema';
