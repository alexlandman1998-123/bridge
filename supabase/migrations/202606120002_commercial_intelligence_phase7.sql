begin;

create materialized view if not exists public.commercial_market_area_rollups as
with property_base as (
  select
    p.organisation_id,
    coalesce(nullif(trim(p.suburb), ''), nullif(trim(p.city), ''), nullif(trim(p.province), ''), 'Unspecified Area') as area,
    coalesce(nullif(trim(p.property_type), ''), 'unclassified') as property_type,
    count(*) as property_count,
    coalesce(sum(p.gla_m2), 0) as total_gla,
    coalesce(sum(p.available_space_m2), 0) as property_available_space
  from public.commercial_properties p
  where coalesce(p.status, 'active') not in ('archived', 'inactive')
  group by 1, 2, 3
),
vacancy_base as (
  select
    v.organisation_id,
    coalesce(nullif(trim(p.suburb), ''), nullif(trim(p.city), ''), nullif(trim(p.province), ''), 'Unspecified Area') as area,
    coalesce(nullif(trim(p.property_type), ''), 'unclassified') as property_type,
    count(*) filter (where coalesce(v.status, 'available') not in ('occupied', 'withdrawn', 'suspended', 'archived')) as active_vacancies,
    count(*) filter (where coalesce(v.status, '') = 'occupied' or v.occupied_at is not null) as occupied_vacancies,
    count(*) filter (where coalesce(v.status, '') = 'withdrawn' or v.withdrawn_at is not null) as withdrawn_vacancies,
    coalesce(sum(v.available_area_m2) filter (where coalesce(v.status, 'available') not in ('occupied', 'withdrawn', 'suspended', 'archived')), 0) as available_space,
    avg(v.asking_rental) filter (where v.asking_rental is not null) as average_rental
  from public.commercial_vacancies v
  left join public.commercial_properties p on p.id = v.property_id
  group by 1, 2, 3
),
listing_base as (
  select
    l.organisation_id,
    coalesce(nullif(trim(p.suburb), ''), nullif(trim(p.city), ''), nullif(trim(p.province), ''), 'Unspecified Area') as area,
    coalesce(nullif(trim(l.listing_category), ''), nullif(trim(p.property_type), ''), 'unclassified') as property_type,
    count(*) filter (where coalesce(l.listing_status, l.status, 'draft') not in ('closed', 'withdrawn', 'expired', 'archived')) as active_listings
  from public.commercial_listings l
  left join public.commercial_properties p on p.id = l.property_id
  group by 1, 2, 3
),
demand_base as (
  select
    r.organisation_id,
    coalesce(nullif(trim(split_part(coalesce(r.preferred_locations::text, ''), ',', 1)), ''), 'Unspecified Area') as area,
    coalesce(nullif(trim(r.property_type), ''), nullif(trim(r.requirement_type), ''), 'unclassified') as property_type,
    count(*) filter (where coalesce(r.stage, r.status, 'new') not in ('won', 'lost', 'closed_won', 'closed_lost', 'archived')) as active_requirements,
    coalesce(sum(coalesce(r.max_size_m2, r.min_size_m2, 0)) filter (where coalesce(r.stage, r.status, 'new') not in ('won', 'lost', 'closed_won', 'closed_lost', 'archived')), 0) as active_demand_space
  from public.commercial_requirements r
  group by 1, 2, 3
),
transaction_base as (
  select
    t.organisation_id,
    coalesce(nullif(trim(p.suburb), ''), nullif(trim(p.city), ''), nullif(trim(p.province), ''), 'Unspecified Area') as area,
    coalesce(nullif(trim(p.property_type), ''), 'unclassified') as property_type,
    count(*) as transaction_count,
    count(*) filter (where t.status = 'completed') as completed_transactions,
    coalesce(sum(t.target_value), 0) as transaction_value
  from public.commercial_transactions t
  left join public.commercial_properties p on p.id = t.property_id
  group by 1, 2, 3
),
keys as (
  select organisation_id, area, property_type from property_base
  union
  select organisation_id, area, property_type from vacancy_base
  union
  select organisation_id, area, property_type from listing_base
  union
  select organisation_id, area, property_type from demand_base
  union
  select organisation_id, area, property_type from transaction_base
)
select
  k.organisation_id,
  k.area,
  k.property_type,
  coalesce(pb.property_count, 0) as property_count,
  coalesce(vb.active_vacancies, 0) as active_vacancies,
  coalesce(lb.active_listings, 0) as active_listings,
  coalesce(db.active_requirements, 0) as active_requirements,
  coalesce(pb.total_gla, 0) as total_gla,
  coalesce(vb.available_space, pb.property_available_space, 0) as available_space,
  greatest(coalesce(pb.total_gla, 0) - coalesce(vb.available_space, pb.property_available_space, 0), 0) as occupied_space,
  case when coalesce(pb.total_gla, 0) > 0 then round((coalesce(vb.available_space, pb.property_available_space, 0) / pb.total_gla) * 100, 2) else 0 end as vacancy_rate,
  case when coalesce(pb.total_gla, 0) > 0 then round(100 - ((coalesce(vb.available_space, pb.property_available_space, 0) / pb.total_gla) * 100), 2) else 0 end as occupancy_rate,
  coalesce(db.active_demand_space, 0) as active_demand_space,
  coalesce(db.active_demand_space, 0) - coalesce(vb.available_space, pb.property_available_space, 0) as supply_demand_gap,
  coalesce(tb.transaction_count, 0) as transaction_count,
  coalesce(tb.completed_transactions, 0) as completed_transactions,
  coalesce(tb.transaction_value, 0) as transaction_value,
  coalesce(vb.average_rental, 0) as average_rental,
  now() as refreshed_at
from keys k
left join property_base pb on pb.organisation_id = k.organisation_id and pb.area = k.area and pb.property_type = k.property_type
left join vacancy_base vb on vb.organisation_id = k.organisation_id and vb.area = k.area and vb.property_type = k.property_type
left join listing_base lb on lb.organisation_id = k.organisation_id and lb.area = k.area and lb.property_type = k.property_type
left join demand_base db on db.organisation_id = k.organisation_id and db.area = k.area and db.property_type = k.property_type
left join transaction_base tb on tb.organisation_id = k.organisation_id and tb.area = k.area and tb.property_type = k.property_type;

create unique index if not exists commercial_market_area_rollups_unique_idx
  on public.commercial_market_area_rollups (organisation_id, area, property_type);

create index if not exists commercial_market_area_rollups_org_area_idx
  on public.commercial_market_area_rollups (organisation_id, area);

create materialized view if not exists public.commercial_data_quality_rollups as
select
  o.id as organisation_id,
  (
    select count(*)
    from public.commercial_properties p
    where p.organisation_id = o.id
      and (p.property_type is null or p.gla_m2 is null or p.city is null or p.broker_id is null)
  ) as missing_property_data,
  (
    select count(*)
    from public.commercial_vacancies v
    where v.organisation_id = o.id
      and (v.property_id is null or v.available_area_m2 is null or v.asking_rental is null or coalesce(v.broker_id, v.broker_assignment) is null)
  ) as missing_vacancy_data,
  (
    select count(*)
    from public.commercial_companies c
    where c.organisation_id = o.id
      and not exists (select 1 from public.commercial_contacts cc where cc.company_id = c.id)
  ) as companies_without_contacts,
  (
    select count(*)
    from public.commercial_transactions t
    where t.organisation_id = o.id
      and t.broker_id is null
  ) as transactions_without_brokers,
  now() as refreshed_at
from public.organisations o;

create unique index if not exists commercial_data_quality_rollups_org_idx
  on public.commercial_data_quality_rollups (organisation_id);

create or replace function public.bridge_refresh_commercial_intelligence_rollups()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  refresh materialized view concurrently public.commercial_market_area_rollups;
  refresh materialized view concurrently public.commercial_data_quality_rollups;
end;
$$;

create or replace function public.bridge_get_commercial_market_area_rollups(p_organisation_id uuid)
returns setof public.commercial_market_area_rollups
language sql
stable
security definer
set search_path = public
as $$
  select *
  from public.commercial_market_area_rollups r
  where r.organisation_id = p_organisation_id
    and exists (select 1 from public.bridge_commercial_user_scope(r.organisation_id));
$$;

create or replace function public.bridge_get_commercial_data_quality_rollup(p_organisation_id uuid)
returns setof public.commercial_data_quality_rollups
language sql
stable
security definer
set search_path = public
as $$
  select *
  from public.commercial_data_quality_rollups r
  where r.organisation_id = p_organisation_id
    and exists (select 1 from public.bridge_commercial_user_scope(r.organisation_id));
$$;

grant execute on function public.bridge_get_commercial_market_area_rollups(uuid) to authenticated;
grant execute on function public.bridge_get_commercial_data_quality_rollup(uuid) to authenticated;

commit;
