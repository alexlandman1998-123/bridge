begin;

create or replace function public.rental_get_landlord_portal_portfolio(p_property_id uuid default null)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_result jsonb;
begin
  if auth.uid() is null then raise exception 'Not authorized'; end if;
  select coalesce(jsonb_agg(property_payload order by property_payload->>'name'), '[]'::jsonb) into v_result
  from (
    select jsonb_build_object(
      'property_id', property.id,
      'name', property.name,
      'property_type', property.property_type,
      'status', property.status,
      'address', concat_ws(', ', property.address_line_1, nullif(property.suburb, ''), nullif(property.city, '')),
      'ownership_share', relationship.ownership_share,
      'units', coalesce((select count(*) from public.rental_units unit where unit.property_id = property.id), 0),
      'active_tenancies', coalesce((select count(*) from public.rental_tenancies tenancy where tenancy.property_id = property.id and tenancy.status = 'active'), 0),
      'financial', jsonb_build_object(
        'charges_total', coalesce((select sum(charge.amount) from public.rental_financial_charges charge join public.rental_tenancies tenancy on tenancy.id = charge.tenancy_id where tenancy.property_id = property.id), 0),
        'payments_total', coalesce((select sum(payment.amount) from public.rental_financial_payments payment join public.rental_tenancies tenancy on tenancy.id = payment.tenancy_id where tenancy.property_id = property.id and payment.reversal_of_payment_id is null), 0),
        'last_payment_date', (select max(payment.received_date) from public.rental_financial_payments payment join public.rental_tenancies tenancy on tenancy.id = payment.tenancy_id where tenancy.property_id = property.id and payment.reversal_of_payment_id is null)
      ),
      'maintenance', coalesce((select jsonb_agg(jsonb_build_object('request_id', request.id, 'category', request.category, 'priority', request.priority, 'status', request.status, 'reported_at', request.reported_at) order by request.reported_at desc) from (select * from public.rental_maintenance_requests where property_id = property.id order by reported_at desc limit 30) request), '[]'::jsonb),
      'inspections', coalesce((select jsonb_agg(jsonb_build_object('inspection_id', inspection.id, 'inspection_type', inspection.inspection_type, 'status', inspection.status, 'started_at', inspection.started_at, 'completed_at', inspection.completed_at) order by inspection.started_at desc) from (select * from public.rental_field_inspections where property_id = property.id order by started_at desc limit 30) inspection), '[]'::jsonb),
      'documents', coalesce((select jsonb_agg(jsonb_build_object('document_id', document.id, 'label', document.document_label, 'link', document.document_link, 'created_at', document.created_at) order by document.created_at desc) from public.rental_lease_version_documents document join public.rental_lease_versions version on version.id = document.lease_version_id join public.rental_leases lease on lease.id = version.lease_id join public.rental_tenancies tenancy on tenancy.id = lease.tenancy_id where tenancy.property_id = property.id), '[]'::jsonb)
    ) as property_payload
    from public.rental_landlord_portal_access access
    join public.rental_property_landlords relationship on relationship.id = access.landlord_relationship_id
    join public.rental_properties property on property.id = access.property_id
    where access.user_id = auth.uid()
      and access.status = 'active'
      and relationship.relationship_status = 'active'
      and (relationship.effective_from is null or relationship.effective_from <= current_date)
      and (relationship.effective_to is null or relationship.effective_to >= current_date)
      and (p_property_id is null or property.id = p_property_id)
  ) scoped;
  return jsonb_build_object('properties', v_result);
end $$;

revoke all on function public.rental_get_landlord_portal_portfolio(uuid) from public, anon;
grant execute on function public.rental_get_landlord_portal_portfolio(uuid) to authenticated;
comment on function public.rental_get_landlord_portal_portfolio(uuid) is 'Phase 54 landlord read model: ownership-bound property summaries without tenant identity, payment references, staff assignments, or internal notes.';

commit;
