-- Keep portfolio totals independent of the bounded arrears queue.
create or replace function public.rental_get_arrears_dashboard(p_as_of date default current_date, p_limit integer default 250)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare d date := coalesce(p_as_of, current_date); l integer := greatest(1, least(coalesce(p_limit, 250), 1000)); result jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication is required'; end if;
  select jsonb_build_object('as_of_date', d, 'summary', jsonb_build_object(
    'active_tenancies', coalesce((select count(*) from public.rental_tenancies t join public.rental_properties p on p.id = t.property_id where t.status = 'active' and public.rental_branch_access(p.organisation_id, p.branch_id)), 0),
    'rent_roll_amount', coalesce((select sum(c.amount) from public.rental_financial_charges c join public.rental_tenancies t on t.id = c.tenancy_id join public.rental_properties p on p.id = t.property_id where t.status = 'active' and c.charge_type = 'rent' and c.due_date between date_trunc('month', d)::date and d and public.rental_branch_access(p.organisation_id, p.branch_id)), 0),
    'collected_amount', coalesce((select sum(a.amount) from public.rental_financial_allocations a join public.rental_financial_charges c on c.id = a.charge_id join public.rental_tenancies t on t.id = c.tenancy_id join public.rental_properties p on p.id = t.property_id where t.status = 'active' and c.charge_type = 'rent' and c.due_date between date_trunc('month', d)::date and d and public.rental_branch_access(p.organisation_id, p.branch_id)), 0),
    'outstanding_amount', coalesce((select sum(r.net_outstanding_amount) from public.rental_get_arrears_dashboard_rows(d, 1000000) r), 0),
    'arrears_tenancy_count', coalesce((select count(*) from public.rental_get_arrears_dashboard_rows(d, 1000000) r where r.net_outstanding_amount > 0), 0)
  ), 'rows', coalesce((select jsonb_agg(jsonb_build_object('tenancy_id', r.tenancy_id, 'property_name', r.property_name, 'unit_label', r.unit_label, 'tenant_name', r.tenant_name, 'rent_roll_amount', r.rent_roll_amount, 'collected_amount', r.collected_amount, 'net_outstanding_amount', r.net_outstanding_amount, 'credit_balance_amount', r.credit_balance_amount, 'aging_0_30', r.aging_0_30, 'aging_31_60', r.aging_31_60, 'aging_61_90', r.aging_61_90, 'aging_91_plus', r.aging_91_plus, 'oldest_due_date', r.oldest_due_date, 'next_action', r.next_action) order by r.net_outstanding_amount desc, r.oldest_due_date nulls last) from public.rental_get_arrears_dashboard_rows(d, l) r where r.net_outstanding_amount > 0), '[]'::jsonb)) into result;
  return result;
end; $$;
