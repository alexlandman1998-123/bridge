-- Public development pages read only a curated JSON projection. The source
-- tables remain protected by RLS; this function returns a record only when
-- marketing has explicitly been made public and marked live.
create or replace function public.get_public_development_landing(requested_slug text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with published as (
    select
      d.id,
      d.name,
      d.location,
      d.suburb,
      d.city,
      d.province,
      d.developer_company,
      d.total_units_expected,
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
    'name', published.name,
    'location', published.location,
    'suburb', published.suburb,
    'city', published.city,
    'province', published.province,
    'developerCompany', published.developer_company,
    'totalUnitsExpected', published.total_units_expected,
    'marketing', published.marketing_content,
    'inventory', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', u.id,
        'unitNumber', u.unit_number,
        'unitType', u.unit_type,
        'block', u.block,
        'sizeSqm', u.size_sqm,
        'price', coalesce(u.current_price, u.list_price, u.price),
        'status', u.status
      ) order by u.unit_number)
      from public.units u
      where u.development_id = published.id
    ), '[]'::jsonb),
    'assets', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', doc.id,
        'title', doc.title,
        'documentType', doc.document_type,
        'fileUrl', doc.file_url,
        'linkedUnitType', doc.linked_unit_type
      ) order by doc.created_at)
      from public.development_documents doc
      where doc.development_id = published.id
        and lower(coalesce(doc.document_type, '')) in ('floorplan', 'site_plan', 'marketing', 'logo', 'brochure')
    ), '[]'::jsonb)
  )
  from published;
$$;

revoke execute on function public.get_public_development_landing(text) from public;
grant execute on function public.get_public_development_landing(text) to anon, authenticated;

notify pgrst, 'reload schema';
