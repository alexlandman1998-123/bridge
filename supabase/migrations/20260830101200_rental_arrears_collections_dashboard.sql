-- Rentals Phase 41: scoped arrears projection and collections queue.
begin;

create index if not exists rental_tenancies_active_property_idx on public.rental_tenancies(status, property_id, id) where status = 'active';
create index if not exists rental_financial_charges_tenancy_due_amount_idx on public.rental_financial_charges(tenancy_id, due_date) include (amount);
create index if not exists rental_financial_adjustments_tenancy_type_date_idx on public.rental_financial_adjustments(tenancy_id, adjustment_type, effective_date) include (amount);

create or replace function public.rental_get_arrears_dashboard(p_as_of date default current_date, p_limit integer default 250)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare result jsonb; effective_limit integer := greatest(1, least(coalesce(p_limit, 250), 1000)); effective_date date := coalesce(p_as_of, current_date);
begin
  if auth.uid() is null then raise exception 'Authentication is required'; end if;
  select jsonb_build_object(
    'as_of_date', effective_date,
    'summary', jsonb_build_object(
      'active_tenancies', coalesce((select count(*) from public.rental_tenancies tenancy join public.rental_properties property on property.id = tenancy.property_id where tenancy.status = 'active' and public.rental_branch_access(property.organisation_id, property.branch_id)), 0),
      'rent_roll_amount', coalesce((select sum(row.month_rent_roll) from (
        select tenancy.id, coalesce(sum(charge.amount) filter (where charge.due_date between date_trunc('month', effective_date)::date and effective_date), 0) as month_rent_roll
        from public.rental_tenancies tenancy join public.rental_properties property on property.id = tenancy.property_id left join public.rental_financial_charges charge on charge.tenancy_id = tenancy.id and charge.charge_type = 'rent'
        where tenancy.status = 'active' and public.rental_branch_access(property.organisation_id, property.branch_id) group by tenancy.id
      ) row), 0),
      'collected_amount', coalesce((select sum(row.month_collected) from (
        select tenancy.id, coalesce(sum(allocation.amount) filter (where charge.due_date between date_trunc('month', effective_date)::date and effective_date), 0) as month_collected
        from public.rental_tenancies tenancy join public.rental_properties property on property.id = tenancy.property_id left join public.rental_financial_charges charge on charge.tenancy_id = tenancy.id left join public.rental_financial_allocations allocation on allocation.charge_id = charge.id
        where tenancy.status = 'active' and public.rental_branch_access(property.organisation_id, property.branch_id) group by tenancy.id
      ) row), 0),
      'outstanding_amount', coalesce((select sum(row.net_outstanding_amount) from public.rental_get_arrears_dashboard_rows(effective_date, 1000000) row), 0),
      'arrears_tenancy_count', coalesce((select count(*) from public.rental_get_arrears_dashboard_rows(effective_date, 1000000) row where row.net_outstanding_amount > 0), 0)
    ),
    'rows', coalesce((select jsonb_agg(jsonb_build_object('tenancy_id', row.tenancy_id, 'property_name', row.property_name, 'unit_label', row.unit_label, 'tenant_name', row.tenant_name, 'rent_roll_amount', row.rent_roll_amount, 'collected_amount', row.collected_amount, 'net_outstanding_amount', row.net_outstanding_amount, 'credit_balance_amount', row.credit_balance_amount, 'aging_0_30', row.aging_0_30, 'aging_31_60', row.aging_31_60, 'aging_61_90', row.aging_61_90, 'aging_91_plus', row.aging_91_plus, 'oldest_due_date', row.oldest_due_date, 'next_action', row.next_action) order by row.net_outstanding_amount desc, row.oldest_due_date nulls last) from public.rental_get_arrears_dashboard_rows(effective_date, effective_limit) row), '[]'::jsonb)
  ) into result;
  return result;
end; $$;

create or replace function public.rental_get_arrears_dashboard_rows(p_as_of date, p_limit integer)
returns table(tenancy_id uuid, property_name text, unit_label text, tenant_name text, rent_roll_amount numeric, collected_amount numeric, net_outstanding_amount numeric, credit_balance_amount numeric, aging_0_30 numeric, aging_31_60 numeric, aging_61_90 numeric, aging_91_plus numeric, oldest_due_date date, next_action text)
language sql stable security definer set search_path = '' as $$
  with scoped as (
    select tenancy.id, tenancy.tenant_snapshot_json, property.name as property_name, unit.unit_label
    from public.rental_tenancies tenancy
    join public.rental_properties property on property.id = tenancy.property_id
    join public.rental_units unit on unit.id = tenancy.unit_id
    where tenancy.status = 'active' and public.rental_branch_access(property.organisation_id, property.branch_id)
  ), charge_rows as (
    select charge.tenancy_id, charge.due_date, charge.charge_type, greatest(charge.amount - coalesce(sum(allocation.amount), 0), 0) as outstanding_amount, charge.amount, coalesce(sum(allocation.amount), 0) as allocated_amount
    from public.rental_financial_charges charge left join public.rental_financial_allocations allocation on allocation.charge_id = charge.id
    where charge.due_date <= p_as_of group by charge.id, charge.tenancy_id, charge.due_date, charge.charge_type, charge.amount
  ), adjustment_rows as (
    select adjustment.tenancy_id, coalesce(sum(adjustment.amount) filter (where adjustment.adjustment_type = 'debit'), 0) as debits, coalesce(sum(adjustment.amount) filter (where adjustment.adjustment_type = 'credit'), 0) as credits
    from public.rental_financial_adjustments adjustment where adjustment.effective_date <= p_as_of group by adjustment.tenancy_id
  ), aggregates as (
    select scoped.id as tenancy_id, scoped.property_name, scoped.unit_label, coalesce(scoped.tenant_snapshot_json ->> 'name', scoped.tenant_snapshot_json ->> 'full_name', 'Tenant') as tenant_name,
      coalesce(sum(charge.amount) filter (where charge.charge_type = 'rent' and charge.due_date between date_trunc('month', p_as_of)::date and p_as_of), 0) as rent_roll_amount,
      coalesce(sum(charge.allocated_amount) filter (where charge.charge_type = 'rent' and charge.due_date between date_trunc('month', p_as_of)::date and p_as_of), 0) as collected_amount,
      coalesce(sum(charge.outstanding_amount), 0) + coalesce(adjustment.debits, 0) - coalesce(adjustment.credits, 0) as raw_outstanding,
      coalesce(sum(charge.outstanding_amount) filter (where p_as_of - charge.due_date between 0 and 30), 0) as aging_0_30,
      coalesce(sum(charge.outstanding_amount) filter (where p_as_of - charge.due_date between 31 and 60), 0) as aging_31_60,
      coalesce(sum(charge.outstanding_amount) filter (where p_as_of - charge.due_date between 61 and 90), 0) as aging_61_90,
      coalesce(sum(charge.outstanding_amount) filter (where p_as_of - charge.due_date > 90), 0) as aging_91_plus,
      min(charge.due_date) filter (where charge.outstanding_amount > 0) as oldest_due_date
    from scoped left join charge_rows charge on charge.tenancy_id = scoped.id left join adjustment_rows adjustment on adjustment.tenancy_id = scoped.id
    group by scoped.id, scoped.property_name, scoped.unit_label, scoped.tenant_snapshot_json, adjustment.debits, adjustment.credits
  )
  select tenancy_id, property_name, unit_label, tenant_name, rent_roll_amount, collected_amount, greatest(raw_outstanding, 0), greatest(-raw_outstanding, 0), aging_0_30, aging_31_60, aging_61_90, aging_91_plus, oldest_due_date,
    case when raw_outstanding <= 0 then 'No collection action' when aging_91_plus > 0 then 'Escalate: 90+ days overdue' when aging_61_90 > 0 then 'Priority follow-up: 61+ days overdue' when aging_31_60 > 0 then 'Contact tenant: 31+ days overdue' else 'Monitor current arrears' end
  from aggregates where raw_outstanding <> 0 order by raw_outstanding desc, oldest_due_date nulls last limit p_limit;
$$;

revoke execute on function public.rental_get_arrears_dashboard(date, integer), public.rental_get_arrears_dashboard_rows(date, integer) from public, anon;
grant execute on function public.rental_get_arrears_dashboard(date, integer) to authenticated;
comment on function public.rental_get_arrears_dashboard(date, integer) is 'Phase 41 scoped collections dashboard. Amounts reconcile to append-only rental charges, allocations and approved adjustments.';
commit;
