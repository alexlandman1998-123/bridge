-- Rentals Phase 35: bounded, tenancy-scoped workspace read models.
-- No Sales tables, financial ledger, or maintenance records are introduced here.
begin;

create or replace function public.rental_get_tenancy_workspace_summary(p_tenancy_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  tenancy_row public.rental_tenancies%rowtype;
  property_row public.rental_properties%rowtype;
  unit_row public.rental_units%rowtype;
  lease_row public.rental_leases%rowtype;
  lease_version_row public.rental_lease_versions%rowtype;
  inspection_row public.rental_incoming_inspections%rowtype;
  activation_row public.rental_tenancy_activation_events%rowtype;
  readiness_total integer := 0;
  readiness_complete integer := 0;
begin
  if auth.uid() is null then raise exception 'Authentication is required'; end if;
  select tenancy.* into tenancy_row from public.rental_tenancies tenancy where tenancy.id = p_tenancy_id;
  if not found then raise exception 'Tenancy not found'; end if;
  select property.* into property_row from public.rental_properties property where property.id = tenancy_row.property_id;
  if not found or not public.rental_branch_access(property_row.organisation_id, property_row.branch_id) then
    raise exception 'You are not authorized for this tenancy';
  end if;
  select unit.* into unit_row from public.rental_units unit where unit.id = tenancy_row.unit_id;
  select lease.* into lease_row from public.rental_leases lease where lease.tenancy_id = tenancy_row.id;
  select version.* into lease_version_row from public.rental_lease_versions version where version.lease_id = lease_row.id and version.is_current;
  select inspection.* into inspection_row from public.rental_incoming_inspections inspection where inspection.tenancy_id = tenancy_row.id;
  select activation.* into activation_row from public.rental_tenancy_activation_events activation where activation.tenancy_id = tenancy_row.id;
  select count(*), count(*) filter (where status in ('verified', 'waived')) into readiness_total, readiness_complete
  from public.rental_move_in_readiness_items where tenancy_id = tenancy_row.id;
  return jsonb_build_object(
    'tenancy', jsonb_build_object('id', tenancy_row.id, 'status', tenancy_row.status, 'intended_occupation_date', tenancy_row.intended_occupation_date, 'tenant_snapshot', tenancy_row.tenant_snapshot_json),
    'property', jsonb_build_object('id', property_row.id, 'name', property_row.name, 'address', property_row.address_json),
    'unit', jsonb_build_object('id', unit_row.id, 'label', unit_row.unit_label, 'status', unit_row.status),
    'lease', jsonb_build_object('id', lease_row.id, 'status', lease_row.status, 'terms', lease_row.terms_json, 'current_version_number', lease_version_row.version_number, 'start_date', lease_version_row.effective_start_date, 'end_date', lease_version_row.effective_end_date, 'occupation_date', lease_version_row.occupation_date, 'monthly_rent', lease_version_row.monthly_rent),
    'move_in_readiness', jsonb_build_object('total', readiness_total, 'complete', readiness_complete, 'ready', readiness_total > 0 and readiness_total = readiness_complete),
    'incoming_inspection', case when inspection_row.id is null then null else jsonb_build_object('id', inspection_row.id, 'status', inspection_row.status, 'completed_at', inspection_row.completed_at) end,
    'activation', case when activation_row.id is null then null else jsonb_build_object('id', activation_row.id, 'activated_at', activation_row.activated_at) end
  );
end; $$;

create or replace function public.rental_get_tenancy_activity(p_tenancy_id uuid, p_limit integer default 40)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  tenancy_row public.rental_tenancies%rowtype;
  max_rows integer := least(greatest(coalesce(p_limit, 40), 1), 100);
  result jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication is required'; end if;
  select tenancy.* into tenancy_row from public.rental_tenancies tenancy where tenancy.id = p_tenancy_id;
  if not found or not exists (select 1 from public.rental_properties property where property.id = tenancy_row.property_id and public.rental_branch_access(property.organisation_id, property.branch_id)) then
    raise exception 'You are not authorized for this tenancy';
  end if;
  select coalesce(jsonb_agg(entry order by (entry ->> 'occurred_at') desc), '[]'::jsonb) into result from (
    select entry from (
    select jsonb_build_object('type', 'tenancy_activated', 'occurred_at', activation.activated_at, 'detail', activation.result_json) as entry from public.rental_tenancy_activation_events activation where activation.tenancy_id = tenancy_row.id
    union all
    select jsonb_build_object('type', event.event_type, 'occurred_at', event.occurred_at, 'detail', event.evidence_json) from public.rental_incoming_inspection_events event where event.tenancy_id = tenancy_row.id
    union all
    select jsonb_build_object('type', concat('readiness_', event.to_status), 'occurred_at', event.occurred_at, 'detail', event.evidence_json) from public.rental_move_in_readiness_events event where event.tenancy_id = tenancy_row.id
    union all
    select jsonb_build_object('type', event.event_type, 'occurred_at', event.occurred_at, 'detail', event.evidence_json) from public.rental_lease_signing_events event join public.rental_lease_versions version on version.id = event.lease_version_id join public.rental_leases lease on lease.id = version.lease_id where lease.tenancy_id = tenancy_row.id
    ) activity order by (entry ->> 'occurred_at') desc limit max_rows
  ) limited_activity;
  return result;
end; $$;

create or replace function public.rental_get_tenancy_documents(p_tenancy_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare tenancy_row public.rental_tenancies%rowtype; result jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication is required'; end if;
  select tenancy.* into tenancy_row from public.rental_tenancies tenancy where tenancy.id = p_tenancy_id;
  if not found or not exists (select 1 from public.rental_properties property where property.id = tenancy_row.property_id and public.rental_branch_access(property.organisation_id, property.branch_id)) then
    raise exception 'You are not authorized for this tenancy';
  end if;
  select coalesce(jsonb_agg(document order by (document ->> 'created_at') desc), '[]'::jsonb) into result from (
    select jsonb_build_object('type', 'lease_document', 'label', document.document_label, 'link', document.document_link, 'created_at', document.created_at) as document from public.rental_lease_version_documents document join public.rental_lease_versions version on version.id = document.lease_version_id join public.rental_leases lease on lease.id = version.lease_id where lease.tenancy_id = tenancy_row.id
    union all
    select jsonb_build_object('type', 'condition_media', 'label', coalesce(media.caption, 'Condition evidence'), 'link', media.media_link, 'created_at', media.created_at) from public.rental_incoming_inspection_media media join public.rental_incoming_inspections inspection on inspection.id = media.inspection_id where inspection.tenancy_id = tenancy_row.id
    union all
    select jsonb_build_object('type', 'handover_evidence', 'label', replace(item.item_key, '_', ' '), 'link', item.evidence_link, 'created_at', item.completed_at) from public.rental_incoming_inspection_items item join public.rental_incoming_inspections inspection on inspection.id = item.inspection_id where inspection.tenancy_id = tenancy_row.id and item.evidence_link is not null
    union all
    select jsonb_build_object('type', 'readiness_evidence', 'label', replace(item.obligation_type, '_', ' '), 'link', item.evidence_link, 'created_at', item.reviewed_at) from public.rental_move_in_readiness_items item where item.tenancy_id = tenancy_row.id and item.evidence_link is not null
  ) documents;
  return result;
end; $$;

revoke execute on function public.rental_get_tenancy_workspace_summary(uuid) from public, anon;
revoke execute on function public.rental_get_tenancy_activity(uuid, integer) from public, anon;
revoke execute on function public.rental_get_tenancy_documents(uuid) from public, anon;
grant execute on function public.rental_get_tenancy_workspace_summary(uuid) to authenticated;
grant execute on function public.rental_get_tenancy_activity(uuid, integer) to authenticated;
grant execute on function public.rental_get_tenancy_documents(uuid) to authenticated;

commit;
