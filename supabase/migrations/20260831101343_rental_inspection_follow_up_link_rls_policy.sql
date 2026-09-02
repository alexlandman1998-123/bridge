-- The bridge itself stays function-driven, but its read policy preserves the
-- same branch boundary if it is queried by an authenticated internal client.
create policy "rental_inspection_item_maintenance_links_branch_read"
on public.rental_inspection_item_maintenance_links
for select
to authenticated
using (
  exists (
    select 1
    from public.rental_field_inspection_items item
    join public.rental_field_inspections inspection on inspection.id = item.inspection_id
    join public.rental_properties property on property.id = inspection.property_id
    where item.id = rental_inspection_item_maintenance_links.inspection_item_id
      and public.rental_branch_access(property.organisation_id, property.branch_id)
  )
);
