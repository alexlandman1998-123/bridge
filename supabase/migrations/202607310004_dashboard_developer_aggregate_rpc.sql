begin;

create index if not exists dashboard_developments_org_idx
  on public.developments (organisation_id);

create index if not exists dashboard_units_development_idx
  on public.units (development_id);

create index if not exists dashboard_transactions_unit_active_updated_idx
  on public.transactions (unit_id, is_active, updated_at desc);

create or replace function public.bridge_dashboard_developer_overview_aggregate(
  p_development_id uuid default null,
  p_organisation_id uuid default null
)
returns jsonb
language sql
security invoker
set search_path = public
as $$
with scoped_developments as (
  select d.id, d.name
  from public.developments d
  where (p_development_id is null or d.id = p_development_id)
    and (p_organisation_id is null or d.organisation_id = p_organisation_id)
),
scoped_units as (
  select
    u.id,
    u.development_id,
    u.unit_number,
    u.price,
    u.status,
    sd.name as development_name
  from public.units u
  join scoped_developments sd on sd.id = u.development_id
),
latest_transactions as (
  select distinct on (t.unit_id)
    t.id,
    t.unit_id,
    t.development_id,
    t.stage,
    t.sales_price,
    t.purchase_price,
    t.updated_at,
    t.created_at
  from public.transactions t
  join scoped_units su on su.id = t.unit_id
  where coalesce(t.is_active, true) is true
    and coalesce(t.stage, '') <> 'Available'
  order by t.unit_id, t.updated_at desc nulls last, t.created_at desc nulls last, t.id
),
unit_rows as (
  select
    su.id as unit_id,
    su.development_id,
    su.development_name,
    coalesce(nullif(lt.stage, ''), nullif(su.status, ''), 'Available') as stage,
    lt.id as transaction_id,
    lt.updated_at,
    lt.created_at,
    coalesce(lt.sales_price, lt.purchase_price, su.price, 0) as value
  from scoped_units su
  left join latest_transactions lt on lt.unit_id = su.id
),
portfolio_metrics as (
  select
    count(distinct development_id)::integer as total_developments,
    count(*)::integer as total_units,
    count(*) filter (
      where transaction_id is not null
        and stage <> 'Available'
        and stage <> 'Registered'
    )::integer as active_transactions,
    count(*) filter (
      where stage in ('Proceed to Attorneys', 'Transfer in Progress', 'Transfer Lodged')
    )::integer as units_in_transfer,
    count(*) filter (where stage = 'Registered')::integer as units_registered,
    coalesce(sum(value) filter (where stage <> 'Available'), 0)::numeric as total_revenue
  from unit_rows
),
development_rollups as (
  select
    development_id,
    development_name,
    count(*)::integer as total_units,
    count(*) filter (where stage <> 'Available')::integer as units_sold,
    count(*) filter (
      where stage in ('Proceed to Attorneys', 'Transfer in Progress', 'Transfer Lodged')
    )::integer as units_in_transfer,
    count(*) filter (where stage = 'Registered')::integer as units_registered,
    max(coalesce(updated_at, created_at)) as last_activity
  from unit_rows
  group by development_id, development_name
),
development_payload as (
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', development_id,
        'name', coalesce(development_name, 'Unknown Development'),
        'totalUnits', total_units,
        'unitsSold', units_sold,
        'unitsInTransfer', units_in_transfer,
        'unitsRegistered', units_registered,
        'lastActivity', last_activity
      )
      order by coalesce(development_name, 'Unknown Development')
    ),
    '[]'::jsonb
  ) as items
  from development_rollups
)
select jsonb_build_object(
  'metrics',
  jsonb_build_object(
    'totalDevelopments', coalesce(pm.total_developments, 0),
    'totalUnits', coalesce(pm.total_units, 0),
    'activeTransactions', coalesce(pm.active_transactions, 0),
    'unitsInTransfer', coalesce(pm.units_in_transfer, 0),
    'unitsRegistered', coalesce(pm.units_registered, 0),
    'totalRevenue', coalesce(pm.total_revenue, 0)
  ),
  'developmentSummaries',
  coalesce(dp.items, '[]'::jsonb),
  'alerts',
  jsonb_build_object(
    'waitingBondApproval', '[]'::jsonb,
    'waitingAttorneys', '[]'::jsonb,
    'recentUpdates', '[]'::jsonb
  )
)
from portfolio_metrics pm
cross join development_payload dp;
$$;

grant execute on function public.bridge_dashboard_developer_overview_aggregate(uuid, uuid) to authenticated, service_role;

comment on function public.bridge_dashboard_developer_overview_aggregate(uuid, uuid)
is 'Returns developer dashboard KPI and development summary aggregates without hydrating the full dashboard row graph.';

commit;
