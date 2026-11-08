-- User-approved Madison Place schedule, 5 November 2026.
-- parking_count is the existing garage count in development inventory.
-- Garden area is separate from the existing 230 m² internal floor area.
alter table public.units
  add column garden_size_sqm numeric check (garden_size_sqm >= 0),
  add column visitor_parking_bays integer[];

comment on column public.units.garden_size_sqm is 'Private garden area in square metres; excludes internal floor area.';
comment on column public.units.visitor_parking_bays is 'Allocated visitor bay numbers, separate from the garage count in parking_count.';

-- Only the supplied Madison Place schedule in Samlin Construction is changed.
do $update$
declare
  target_id uuid;
  changed_count integer;
begin
  select d.id into strict target_id
  from public.developments d
  join public.organisations o on o.id = d.organisation_id
  join public.development_profiles p on p.development_id = d.id
  where d.name = 'Madison Place'
    and o.name = 'Samlin Construction'
    and p.marketing_content #>> '{listingConfiguration,listingSlug}' = 'madison-place-abcf1b8a';

  if (select count(*) from public.units where development_id = target_id) <> 63
     or (select count(distinct unit_number) from public.units where development_id = target_id
         and unit_number ~ '^[0-9]{3}$' and unit_number::integer between 1 and 63) <> 63 then
    raise exception 'Madison Place inventory differs from the approved 63-unit schedule';
  end if;

  with schedule(unit_number, garden, visitor_bays, selling_price) as (
    values
    (1, 101, array[141]::integer[], 2800000),
    (2, 89, array[142]::integer[], 2800000),
    (3, 89, array[144]::integer[], 2800000),
    (4, 95, array[145]::integer[], 2800000),
    (5, 161, array[25]::integer[], 2750000),
    (6, 103, array[24]::integer[], 2750000),
    (7, 117, array[22,21]::integer[], 2750000),
    (8, 117, array[17,18]::integer[], 2750000),
    (9, 117, array[14,15]::integer[], 2750000),
    (10, 117, array[10,11]::integer[], 2750000),
    (11, 117, array[7,8]::integer[], 2750000),
    (12, 106, array[5,6]::integer[], 2750000),
    (13, 126, array[2,3]::integer[], 2750000),
    (14, 127, array[26]::integer[], 2850000),
    (15, 133, array[27]::integer[], 2850000),
    (16, 133, array[30]::integer[], 2850000),
    (17, 134, array[31]::integer[], 2850000),
    (18, 133, array[34]::integer[], 2850000),
    (19, 129, array[35]::integer[], 2850000),
    (20, 129, array[37]::integer[], 2850000),
    (21, 115, array[38]::integer[], 2850000),
    (22, 112, array[40]::integer[], 2850000),
    (23, 129, array[41]::integer[], 2850000),
    (24, 128, array[44]::integer[], 2850000),
    (25, 129, array[45]::integer[], 2850000),
    (26, 133, array[116]::integer[], 2850000),
    (27, 222, array[48,49]::integer[], 2850000),
    (28, 160, array[52,53]::integer[], 2850000),
    (29, 239, array[55,56]::integer[], 2850000),
    (30, 219, array[60,59]::integer[], 2850000),
    (31, 190, array[96,97]::integer[], 2850000),
    (32, 169, array[100,101]::integer[], 2850000),
    (33, 145, array[102,103]::integer[], 2850000),
    (34, 130, array[106,107]::integer[], 2850000),
    (35, 115, array[109,108]::integer[], 2850000),
    (36, 94, array[112,113]::integer[], 2850000),
    (37, 94, array[114]::integer[], 2850000),
    (38, 99, array[115]::integer[], 2850000),
    (39, 194, array[94,95]::integer[], 2850000),
    (40, 160, array[92,93]::integer[], 2850000),
    (41, 150, array[88,89]::integer[], 2850000),
    (42, 233, array[85,86]::integer[], 2850000),
    (43, 205, array[81,82]::integer[], 2850000),
    (44, 189, array[149]::integer[], 2850000),
    (45, 164, array[150]::integer[], 2850000),
    (46, 146, array[152]::integer[], 2850000),
    (47, 124, array[153]::integer[], 2850000),
    (48, 113, array[155]::integer[], 2850000),
    (49, 88, array[156]::integer[], 2850000),
    (50, 88, array[157]::integer[], 2850000),
    (51, 98, array[158]::integer[], 2850000),
    (52, 221, array[117]::integer[], 2850000),
    (53, 94, array[118]::integer[], 2850000),
    (54, 95, array[120]::integer[], 2850000),
    (55, 93, array[122]::integer[], 2850000),
    (56, 161, array[123]::integer[], 2850000),
    (57, 93, array[128]::integer[], 2800000),
    (58, 100, array[129]::integer[], 2800000),
    (59, 101, array[131]::integer[], 2800000),
    (60, 101, array[132]::integer[], 2800000),
    (61, 100, array[134]::integer[], 2800000),
    (62, 101, array[135]::integer[], 2800000),
    (63, 100, array[139]::integer[], 2800000)
  )
  update public.units u
  set price = s.selling_price,
      list_price = s.selling_price,
      current_price = s.selling_price,
      garden_size_sqm = s.garden,
      visitor_parking_bays = s.visitor_bays,
      parking_count = 2
  from schedule s
  where u.development_id = target_id
    and u.unit_number = lpad(s.unit_number::text, 3, '0');

  get diagnostics changed_count = row_count;
  if changed_count <> 63 then
    raise exception 'Expected 63 unit updates; got %', changed_count;
  end if;
end
$update$;

-- Preserve the existing publication and organisation-branding rules.
CREATE OR REPLACE FUNCTION public.get_public_development_landing(requested_slug text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
        'gardenSizeSqm', u.garden_size_sqm,
        'visitorParkingBays', u.visitor_parking_bays,
        'visitorParkingCount', cardinality(u.visitor_parking_bays),
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
$function$
;

notify pgrst, 'reload schema';
;
