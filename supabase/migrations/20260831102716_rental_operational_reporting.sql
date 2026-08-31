-- Phase 67: access-scoped, read-only operational snapshot. It is deliberately
-- computed from canonical records and does not introduce accounting claims.
create or replace function public.rental_get_operational_report(p_org uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.rental_financial_manager_authorized(p_org) then raise exception 'Not authorized';end if;
 return jsonb_build_object(
  'generated_at',now(),
  'portfolio',jsonb_build_object('properties',(select count(*)from public.rental_properties where organisation_id=p_org),'units',(select count(*)from public.rental_units where organisation_id=p_org)),
  'occupancy',jsonb_build_object('occupied',(select count(*)from public.rental_units where organisation_id=p_org and status='occupied'),'vacant',(select count(*)from public.rental_units where organisation_id=p_org and status='vacant'),'notice_given',(select count(*)from public.rental_units where organisation_id=p_org and status='notice_given')),
  'vacancies',jsonb_build_object('open',(select count(*)from public.rental_vacancies where organisation_id=p_org and status in('draft','preparing','marketing','applications_open','paused')),'aging_over_30',(select count(*)from public.rental_vacancies where organisation_id=p_org and status in('draft','preparing','marketing','applications_open','paused') and created_at<now()-interval '30 days')),
  'maintenance',jsonb_build_object('open',(select count(*)from public.rental_maintenance_requests where organisation_id=p_org and status not in('resolved','cancelled')),'urgent',(select count(*)from public.rental_maintenance_requests where organisation_id=p_org and priority in('emergency','urgent') and status not in('resolved','cancelled'))),
  'expiry',jsonb_build_object('next_120_days',(select count(*)from public.rental_leases l join public.rental_tenancies t on t.id=l.tenancy_id join public.rental_lease_versions v on v.lease_id=l.id where t.organisation_id=p_org and v.is_current and v.end_date between current_date and current_date+120)),
  'applications',jsonb_build_object('note','Application and arrears totals remain sourced from their dedicated work queues until their canonical reporting projections are added.')
 );
end $$;
revoke all on function public.rental_get_operational_report(uuid) from public,anon;grant execute on function public.rental_get_operational_report(uuid) to authenticated;
