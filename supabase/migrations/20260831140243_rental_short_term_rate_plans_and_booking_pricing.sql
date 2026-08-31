-- Phase 6: unit-level Short-Term rates and immutable booking price snapshots.
create table public.rental_short_term_rate_plans (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  branch_id uuid references public.organisation_branches(id) on delete set null,
  property_id uuid not null references public.rental_properties(id) on delete cascade,
  unit_id uuid not null references public.rental_units(id) on delete cascade,
  name text not null check (length(btrim(name)) > 0),
  status text not null default 'draft' check (status in ('draft', 'active', 'retired')),
  effective_from date not null default current_date,
  effective_to date,
  currency_code text not null default 'ZAR' check (currency_code = upper(currency_code) and length(currency_code) = 3),
  nightly_rate numeric(12,2) not null check (nightly_rate >= 0),
  cleaning_fee numeric(12,2) not null default 0 check (cleaning_fee >= 0),
  minimum_nights integer not null default 1 check (minimum_nights > 0),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (effective_to is null or effective_to > effective_from)
);

alter table public.rental_short_term_rate_plans
  add constraint rental_short_term_rate_plans_no_active_overlap
  exclude using gist (
    unit_id with =,
    daterange(effective_from, coalesce(effective_to, 'infinity'::date), '[)') with &&
  ) where (status = 'active');

create index rental_short_term_rate_plans_unit_active_idx
  on public.rental_short_term_rate_plans (unit_id, effective_from desc)
  where status = 'active';

create index rental_short_term_rate_plans_org_status_idx
  on public.rental_short_term_rate_plans (organisation_id, status);

create index rental_short_term_rate_plans_branch_id_idx on public.rental_short_term_rate_plans (branch_id);
create index rental_short_term_rate_plans_property_id_idx on public.rental_short_term_rate_plans (property_id);
create index rental_short_term_rate_plans_created_by_idx on public.rental_short_term_rate_plans (created_by);

alter table public.rental_short_term_bookings
  add column rate_plan_id uuid references public.rental_short_term_rate_plans(id) on delete restrict,
  add column currency_code text,
  add column nightly_rate numeric(12,2),
  add column cleaning_fee numeric(12,2),
  add column total_amount numeric(12,2),
  add constraint rental_short_term_bookings_pricing_snapshot_check
    check ((rate_plan_id is null and currency_code is null and nightly_rate is null and cleaning_fee is null and total_amount is null)
      or (rate_plan_id is not null and currency_code is not null and nightly_rate >= 0 and cleaning_fee >= 0 and total_amount >= 0));

create index rental_short_term_bookings_rate_plan_id_idx on public.rental_short_term_bookings (rate_plan_id);

create or replace function public.rental_short_term_rate_plan_validate_scope()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_unit record;
begin
  select organisation_id, property_id, branch_id into v_unit from public.rental_units where id = new.unit_id;
  if not found then raise exception 'Rental unit does not exist'; end if;
  if new.organisation_id is distinct from v_unit.organisation_id
    or new.property_id is distinct from v_unit.property_id
    or new.branch_id is distinct from v_unit.branch_id then
    raise exception 'Short-Term rate plan scope must match its unit';
  end if;
  return new;
end;
$$;

create or replace function public.rental_short_term_booking_apply_rate_plan()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_plan public.rental_short_term_rate_plans%rowtype;
  v_nights integer;
begin
  if new.rate_plan_id is null then
    new.currency_code := null;
    new.nightly_rate := null;
    new.cleaning_fee := null;
    new.total_amount := null;
    return new;
  end if;

  select * into v_plan from public.rental_short_term_rate_plans where id = new.rate_plan_id;
  if not found or v_plan.status <> 'active' then raise exception 'Select an active Short-Term rate plan'; end if;
  if v_plan.organisation_id is distinct from new.organisation_id
    or v_plan.property_id is distinct from new.property_id
    or v_plan.unit_id is distinct from new.unit_id
    or v_plan.branch_id is distinct from new.branch_id then
    raise exception 'Short-Term rate plan scope must match its booking';
  end if;
  if new.check_in_at::date < v_plan.effective_from
    or (v_plan.effective_to is not null and new.check_in_at::date >= v_plan.effective_to) then
    raise exception 'Short-Term rate plan is not effective for this check-in date';
  end if;

  v_nights := greatest(1, ceil(extract(epoch from (new.check_out_at - new.check_in_at)) / 86400.0)::integer);
  if v_nights < v_plan.minimum_nights then raise exception 'This rate plan requires a minimum stay of % nights', v_plan.minimum_nights; end if;

  new.currency_code := v_plan.currency_code;
  new.nightly_rate := v_plan.nightly_rate;
  new.cleaning_fee := v_plan.cleaning_fee;
  new.total_amount := (v_plan.nightly_rate * v_nights) + v_plan.cleaning_fee;
  return new;
end;
$$;

create trigger rental_short_term_rate_plans_validate_scope
before insert or update on public.rental_short_term_rate_plans
for each row execute function public.rental_short_term_rate_plan_validate_scope();

create trigger rental_short_term_rate_plans_set_updated_at
before update on public.rental_short_term_rate_plans
for each row execute function public.rental_set_updated_at();

create trigger rental_short_term_bookings_apply_rate_plan
before insert or update of rate_plan_id, check_in_at, check_out_at on public.rental_short_term_bookings
for each row execute function public.rental_short_term_booking_apply_rate_plan();

alter table public.rental_short_term_rate_plans enable row level security;
revoke all on public.rental_short_term_rate_plans from anon;
grant select, insert, update on public.rental_short_term_rate_plans to authenticated;

create policy rental_short_term_rate_plans_select_scoped on public.rental_short_term_rate_plans for select to authenticated using (
  exists (select 1 from public.rental_properties property where property.id = rental_short_term_rate_plans.property_id and public.rental_branch_access(property.organisation_id, property.branch_id))
);
create policy rental_short_term_rate_plans_insert_scoped on public.rental_short_term_rate_plans for insert to authenticated with check (
  exists (select 1 from public.rental_properties property where property.id = rental_short_term_rate_plans.property_id and public.rental_branch_access(property.organisation_id, property.branch_id) and (public.bridge_is_org_admin(property.organisation_id) or property.assigned_manager_id = (select auth.uid()) or property.created_by = (select auth.uid())))
);
create policy rental_short_term_rate_plans_update_scoped on public.rental_short_term_rate_plans for update to authenticated using (
  exists (select 1 from public.rental_properties property where property.id = rental_short_term_rate_plans.property_id and public.rental_branch_access(property.organisation_id, property.branch_id) and (public.bridge_is_org_admin(property.organisation_id) or property.assigned_manager_id = (select auth.uid()) or property.created_by = (select auth.uid())))
) with check (
  exists (select 1 from public.rental_properties property where property.id = rental_short_term_rate_plans.property_id and public.rental_branch_access(property.organisation_id, property.branch_id) and (public.bridge_is_org_admin(property.organisation_id) or property.assigned_manager_id = (select auth.uid()) or property.created_by = (select auth.uid())))
);
