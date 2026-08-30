-- Rentals Phase 37: idempotent monthly charge schedules. Payments remain out of scope.
begin;
create table public.rental_charge_schedules (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null references public.organisations(id) on delete restrict,
  tenancy_id uuid not null references public.rental_tenancies(id) on delete restrict, lease_version_id uuid references public.rental_lease_versions(id) on delete restrict,
  charge_type text not null check (charge_type in ('rent', 'utility', 'fee')), amount numeric(14,2) not null check (amount > 0), currency_code text not null default 'ZAR' check (currency_code = 'ZAR'),
  start_date date not null, end_date date, due_day integer not null check (due_day between 1 and 28), status text not null default 'active' check (status in ('active', 'paused', 'cancelled')),
  created_by uuid references auth.users(id) on delete set null, created_at timestamptz not null default now(), unique(tenancy_id, charge_type, start_date)
);
create index rental_charge_schedules_tenancy_active_idx on public.rental_charge_schedules(tenancy_id, status, start_date);
alter table public.rental_charge_schedules enable row level security;
revoke all on public.rental_charge_schedules from anon, authenticated;
grant select on public.rental_charge_schedules to authenticated;
create policy rental_charge_schedules_staff_read on public.rental_charge_schedules for select to authenticated using (exists (select 1 from public.rental_tenancies tenancy join public.rental_properties property on property.id = tenancy.property_id where tenancy.id = tenancy_id and public.rental_branch_access(property.organisation_id, property.branch_id)));

create or replace function public.rental_seed_tenancy_rent_schedule(p_tenancy_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare tenancy_row public.rental_tenancies%rowtype; lease_row public.rental_leases%rowtype; version_row public.rental_lease_versions%rowtype;
begin
  select tenancy.* into tenancy_row from public.rental_tenancies tenancy where tenancy.id = p_tenancy_id;
  if not found then raise exception 'Tenancy not found'; end if;
  select lease.* into lease_row from public.rental_leases lease where lease.tenancy_id = tenancy_row.id;
  select version.* into version_row from public.rental_lease_versions version where version.lease_id = lease_row.id and version.is_current;
  if version_row.id is null or version_row.monthly_rent is null or version_row.monthly_rent <= 0 or version_row.effective_start_date is null then raise exception 'A dated lease with monthly rent is required for charge scheduling'; end if;
  insert into public.rental_charge_schedules(organisation_id, tenancy_id, lease_version_id, charge_type, amount, currency_code, start_date, end_date, due_day, created_by)
  values (tenancy_row.organisation_id, tenancy_row.id, version_row.id, 'rent', version_row.monthly_rent, 'ZAR', version_row.effective_start_date, version_row.effective_end_date, least(extract(day from version_row.effective_start_date)::integer, 28), auth.uid())
  on conflict (tenancy_id, charge_type, start_date) do nothing;
end; $$;

create or replace function public.rental_generate_tenancy_charges(p_tenancy_id uuid, p_through_date date default current_date)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare tenancy_row public.rental_tenancies%rowtype; schedule_row public.rental_charge_schedules%rowtype; final_date date; inserted_count integer := 0; new_count integer := 0;
begin
  if auth.uid() is null then raise exception 'Authentication is required'; end if;
  select tenancy.* into tenancy_row from public.rental_tenancies tenancy where tenancy.id = p_tenancy_id for update;
  if not found or not exists (select 1 from public.rental_properties property where property.id = tenancy_row.property_id and public.rental_branch_access(property.organisation_id, property.branch_id)) then raise exception 'You are not authorized for this tenancy'; end if;
  if tenancy_row.status <> 'active' then raise exception 'Charges can only be generated for an active tenancy'; end if;
  for schedule_row in select * from public.rental_charge_schedules where tenancy_id = tenancy_row.id and status = 'active' for update loop
    final_date := least(coalesce(schedule_row.end_date, p_through_date), p_through_date);
    if final_date < schedule_row.start_date then continue; end if;
    insert into public.rental_financial_charges(organisation_id, tenancy_id, currency_code, charge_type, effective_date, due_date, amount, description, source_key, created_by)
    select tenancy_row.organisation_id, tenancy_row.id, schedule_row.currency_code, schedule_row.charge_type,
      period_start::date,
      (period_start::date + (schedule_row.due_day - 1))::date,
      schedule_row.amount, concat(initcap(replace(schedule_row.charge_type, '_', ' ')), ' charge for ', to_char(period_start, 'Mon YYYY')),
      concat('schedule:', schedule_row.id::text, ':period:', to_char(period_start, 'YYYY-MM')), auth.uid()
    from generate_series(date_trunc('month', schedule_row.start_date)::date, date_trunc('month', final_date)::date, interval '1 month') period_start
    on conflict (tenancy_id, source_key) do nothing;
    get diagnostics new_count = row_count;
    inserted_count := inserted_count + new_count;
  end loop;
  return jsonb_build_object('tenancy_id', tenancy_row.id, 'through_date', p_through_date, 'generated_count', inserted_count);
end; $$;

create or replace function public.rental_seed_tenancy_rent_schedule_on_activation()
returns trigger language plpgsql security definer set search_path = '' as $$
begin if new.status = 'active' and old.status is distinct from 'active' then perform public.rental_seed_tenancy_rent_schedule(new.id); end if; return new; end; $$;
create trigger trg_rental_tenancies_seed_charge_schedule after update of status on public.rental_tenancies for each row execute function public.rental_seed_tenancy_rent_schedule_on_activation();
insert into public.rental_charge_schedules(organisation_id, tenancy_id, lease_version_id, charge_type, amount, currency_code, start_date, end_date, due_day, created_by)
select tenancy.organisation_id, tenancy.id, version.id, 'rent', version.monthly_rent, 'ZAR', version.effective_start_date, version.effective_end_date, least(extract(day from version.effective_start_date)::integer, 28), tenancy.created_by
from public.rental_tenancies tenancy join public.rental_leases lease on lease.tenancy_id = tenancy.id join public.rental_lease_versions version on version.lease_id = lease.id and version.is_current
where tenancy.status = 'active' and version.monthly_rent > 0 and version.effective_start_date is not null
on conflict (tenancy_id, charge_type, start_date) do nothing;
revoke execute on function public.rental_seed_tenancy_rent_schedule(uuid) from public, anon, authenticated;
revoke execute on function public.rental_generate_tenancy_charges(uuid, date) from public, anon;
grant execute on function public.rental_generate_tenancy_charges(uuid, date) to authenticated;
commit;
