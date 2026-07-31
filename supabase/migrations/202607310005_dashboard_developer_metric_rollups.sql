begin;

create table if not exists public.dashboard_developer_metric_rollups (
  development_id uuid primary key references public.developments(id) on delete cascade,
  organisation_id uuid,
  development_name text not null default 'Unknown Development',
  total_units integer not null default 0,
  active_transactions integer not null default 0,
  units_sold integer not null default 0,
  units_in_transfer integer not null default 0,
  units_registered integer not null default 0,
  total_revenue numeric not null default 0,
  last_activity timestamptz,
  refreshed_at timestamptz not null default now()
);

create index if not exists dashboard_developer_metric_rollups_org_idx
  on public.dashboard_developer_metric_rollups (organisation_id);

create index if not exists dashboard_developer_metric_rollups_refreshed_idx
  on public.dashboard_developer_metric_rollups (refreshed_at desc);

alter table if exists public.dashboard_developer_metric_rollups enable row level security;

drop policy if exists dashboard_developer_metric_rollups_member_select
  on public.dashboard_developer_metric_rollups;

create policy dashboard_developer_metric_rollups_member_select
  on public.dashboard_developer_metric_rollups
  for select
  to authenticated
  using (public.bridge_is_active_member(organisation_id));

create or replace function public.bridge_refresh_dashboard_developer_metric_rollups(
  p_organisation_id uuid default null,
  p_development_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_refreshed integer := 0;
  v_actor uuid := auth.uid();
begin
  if auth.role() <> 'service_role' then
    if p_organisation_id is null then
      raise exception 'Organisation scope is required to refresh dashboard rollups.'
        using errcode = '42501';
    end if;

    if not public.bridge_is_active_member(p_organisation_id) then
      raise exception 'Dashboard rollup refresh requires active organisation membership.'
        using errcode = '42501';
    end if;
  end if;

  with scoped_developments as (
    select d.id, d.organisation_id, d.name
    from public.developments d
    where (p_development_id is null or d.id = p_development_id)
      and (p_organisation_id is null or d.organisation_id = p_organisation_id)
  ),
  scoped_units as (
    select
      sd.id as development_id,
      sd.organisation_id,
      sd.name as development_name,
      u.id as unit_id,
      u.price,
      u.status
    from scoped_developments sd
    left join public.units u on u.development_id = sd.id
  ),
  latest_transactions as (
    select distinct on (t.unit_id)
      t.id,
      t.unit_id,
      t.stage,
      t.sales_price,
      t.purchase_price,
      t.updated_at,
      t.created_at
    from public.transactions t
    join scoped_units su on su.unit_id = t.unit_id
    where su.unit_id is not null
      and coalesce(t.is_active, true) is true
      and coalesce(t.stage, '') <> 'Available'
    order by t.unit_id, t.updated_at desc nulls last, t.created_at desc nulls last, t.id
  ),
  unit_rows as (
    select
      su.development_id,
      su.organisation_id,
      coalesce(su.development_name, 'Unknown Development') as development_name,
      su.unit_id,
      coalesce(nullif(lt.stage, ''), nullif(su.status, ''), 'Available') as stage,
      lt.id as transaction_id,
      lt.updated_at,
      lt.created_at,
      coalesce(lt.sales_price, lt.purchase_price, su.price, 0) as value
    from scoped_units su
    left join latest_transactions lt on lt.unit_id = su.unit_id
  ),
  rollups as (
    select
      development_id,
      organisation_id,
      development_name,
      count(unit_id)::integer as total_units,
      count(unit_id) filter (
        where transaction_id is not null
          and stage <> 'Available'
          and stage <> 'Registered'
      )::integer as active_transactions,
      count(unit_id) filter (where stage <> 'Available')::integer as units_sold,
      count(unit_id) filter (
        where stage in ('Proceed to Attorneys', 'Transfer in Progress', 'Transfer Lodged')
      )::integer as units_in_transfer,
      count(unit_id) filter (where stage = 'Registered')::integer as units_registered,
      coalesce(sum(value) filter (where stage <> 'Available'), 0)::numeric as total_revenue,
      max(coalesce(updated_at, created_at)) as last_activity
    from unit_rows
    group by development_id, organisation_id, development_name
  ),
  upserted as (
    insert into public.dashboard_developer_metric_rollups (
      development_id,
      organisation_id,
      development_name,
      total_units,
      active_transactions,
      units_sold,
      units_in_transfer,
      units_registered,
      total_revenue,
      last_activity,
      refreshed_at
    )
    select
      development_id,
      organisation_id,
      development_name,
      total_units,
      active_transactions,
      units_sold,
      units_in_transfer,
      units_registered,
      total_revenue,
      last_activity,
      now()
    from rollups
    on conflict (development_id) do update set
      organisation_id = excluded.organisation_id,
      development_name = excluded.development_name,
      total_units = excluded.total_units,
      active_transactions = excluded.active_transactions,
      units_sold = excluded.units_sold,
      units_in_transfer = excluded.units_in_transfer,
      units_registered = excluded.units_registered,
      total_revenue = excluded.total_revenue,
      last_activity = excluded.last_activity,
      refreshed_at = excluded.refreshed_at
    returning development_id
  )
  select count(*)::integer into v_refreshed from upserted;

  return jsonb_build_object(
    'contract', 'dashboard-developer-rollups-phase5-v1',
    'refreshed', v_refreshed,
    'organisationId', p_organisation_id,
    'developmentId', p_development_id,
    'refreshedAt', now(),
    'actorId', v_actor
  );
end;
$$;

grant execute on function public.bridge_refresh_dashboard_developer_metric_rollups(uuid, uuid)
  to authenticated, service_role;

create or replace function public.bridge_dashboard_developer_overview_aggregate(
  p_development_id uuid default null,
  p_organisation_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_scoped_development_count integer := 0;
  v_rollup_count integer := 0;
  v_payload jsonb;
begin
  if auth.role() <> 'service_role' then
    if p_organisation_id is not null then
      if not public.bridge_is_active_member(p_organisation_id) then
        raise exception 'Dashboard aggregate requires active organisation membership.'
          using errcode = '42501';
      end if;
    elsif p_development_id is not null then
      if not exists (
        select 1
        from public.developments d
        where d.id = p_development_id
          and public.bridge_is_active_member(d.organisation_id)
      ) then
        raise exception 'Dashboard aggregate requires active organisation membership.'
          using errcode = '42501';
      end if;
    else
      raise exception 'Organisation or development scope is required for dashboard aggregates.'
        using errcode = '42501';
    end if;
  end if;

  select count(*)::integer
    into v_scoped_development_count
  from public.developments d
  where (p_development_id is null or d.id = p_development_id)
    and (p_organisation_id is null or d.organisation_id = p_organisation_id);

  if v_scoped_development_count = 0 then
    return jsonb_build_object(
      'aggregateSource', 'empty',
      'metrics',
      jsonb_build_object(
        'totalDevelopments', 0,
        'totalUnits', 0,
        'activeTransactions', 0,
        'unitsInTransfer', 0,
        'unitsRegistered', 0,
        'totalRevenue', 0
      ),
      'developmentSummaries', '[]'::jsonb,
      'alerts',
      jsonb_build_object(
        'waitingBondApproval', '[]'::jsonb,
        'waitingAttorneys', '[]'::jsonb,
        'recentUpdates', '[]'::jsonb
      )
    );
  end if;

  select count(*)::integer
    into v_rollup_count
  from public.dashboard_developer_metric_rollups r
  join public.developments d on d.id = r.development_id
  where (p_development_id is null or r.development_id = p_development_id)
    and (p_organisation_id is null or r.organisation_id = p_organisation_id);

  if v_rollup_count = v_scoped_development_count then
    with scoped_rollups as (
      select r.*
      from public.dashboard_developer_metric_rollups r
      where (p_development_id is null or r.development_id = p_development_id)
        and (p_organisation_id is null or r.organisation_id = p_organisation_id)
    ),
    portfolio_metrics as (
      select
        count(*)::integer as total_developments,
        coalesce(sum(total_units), 0)::integer as total_units,
        coalesce(sum(active_transactions), 0)::integer as active_transactions,
        coalesce(sum(units_in_transfer), 0)::integer as units_in_transfer,
        coalesce(sum(units_registered), 0)::integer as units_registered,
        coalesce(sum(total_revenue), 0)::numeric as total_revenue,
        max(refreshed_at) as refreshed_at
      from scoped_rollups
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
      from scoped_rollups
    )
    select jsonb_build_object(
      'aggregateSource', 'rollup',
      'rollupGeneratedAt', pm.refreshed_at,
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
      into v_payload
    from portfolio_metrics pm
    cross join development_payload dp;

    return v_payload;
  end if;

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
    'aggregateSource', 'live',
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
    into v_payload
  from portfolio_metrics pm
  cross join development_payload dp;

  return v_payload;
end;
$$;

grant execute on function public.bridge_dashboard_developer_overview_aggregate(uuid, uuid)
  to authenticated, service_role;

comment on table public.dashboard_developer_metric_rollups
is 'Cached developer dashboard portfolio metrics by development. Refreshed through bridge_refresh_dashboard_developer_metric_rollups.';

comment on function public.bridge_refresh_dashboard_developer_metric_rollups(uuid, uuid)
is 'Refreshes cached developer dashboard rollups for an organisation or development scope.';

comment on function public.bridge_dashboard_developer_overview_aggregate(uuid, uuid)
is 'Returns developer dashboard KPI and development summary aggregates, preferring cached rollups before falling back to live calculation.';

commit;
