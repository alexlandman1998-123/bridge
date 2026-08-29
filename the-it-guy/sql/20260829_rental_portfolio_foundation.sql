-- Rentals Phase 9: operational portfolios and scoped property assignments.
-- Depends on Phases 7/8 and deliberately does not alter Sales tables.
begin;

create table if not exists public.rental_portfolios (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  branch_id uuid references public.organisation_branches(id) on delete set null,
  assigned_manager_id uuid references public.profiles(id) on delete set null,
  name text not null,
  description text,
  status text not null default 'active',
  metadata_json jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rental_portfolios_status_check check (status in ('active', 'archived')),
  constraint rental_portfolios_org_name_unique unique (organisation_id, name)
);
create index if not exists rental_portfolios_org_branch_status_idx on public.rental_portfolios(organisation_id, branch_id, status, updated_at desc);
create index if not exists rental_portfolios_org_manager_idx on public.rental_portfolios(organisation_id, assigned_manager_id, updated_at desc);

create table if not exists public.rental_portfolio_properties (
  portfolio_id uuid not null references public.rental_portfolios(id) on delete cascade,
  property_id uuid primary key references public.rental_properties(id) on delete cascade,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  assigned_by uuid references auth.users(id) on delete set null,
  assigned_at timestamptz not null default now(),
  constraint rental_portfolio_properties_portfolio_property_unique unique (portfolio_id, property_id)
);
create index if not exists rental_portfolio_properties_portfolio_idx on public.rental_portfolio_properties(portfolio_id, assigned_at desc);

create or replace function public.rental_portfolio_property_validate_scope()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare portfolio_org uuid; portfolio_branch uuid; property_org uuid; property_branch uuid;
begin
  select organisation_id, branch_id into portfolio_org, portfolio_branch from public.rental_portfolios where id = new.portfolio_id;
  select organisation_id, branch_id into property_org, property_branch from public.rental_properties where id = new.property_id;
  if portfolio_org is null or property_org is null or new.organisation_id <> portfolio_org or new.organisation_id <> property_org then
    raise exception 'Rental portfolio and property must belong to the assignment organisation';
  end if;
  if portfolio_branch is not null and property_branch is distinct from portfolio_branch then
    raise exception 'A branch portfolio can only contain properties from its branch';
  end if;
  return new;
end; $$;
drop trigger if exists trg_rental_portfolio_properties_validate_scope on public.rental_portfolio_properties;
create trigger trg_rental_portfolio_properties_validate_scope before insert or update of portfolio_id, property_id, organisation_id on public.rental_portfolio_properties for each row execute function public.rental_portfolio_property_validate_scope();
drop trigger if exists trg_rental_portfolios_updated_at on public.rental_portfolios;
create trigger trg_rental_portfolios_updated_at before update on public.rental_portfolios for each row execute function public.rental_set_updated_at();

alter table public.rental_portfolios enable row level security;
alter table public.rental_portfolio_properties enable row level security;
revoke all on public.rental_portfolios, public.rental_portfolio_properties from anon, authenticated;
grant select, insert, update on public.rental_portfolios, public.rental_portfolio_properties to authenticated;

drop policy if exists rental_portfolios_select_scoped on public.rental_portfolios;
create policy rental_portfolios_select_scoped on public.rental_portfolios for select to authenticated using (public.rental_branch_access(organisation_id, branch_id));
drop policy if exists rental_portfolios_insert_scoped on public.rental_portfolios;
create policy rental_portfolios_insert_scoped on public.rental_portfolios for insert to authenticated with check (public.rental_branch_access(organisation_id, branch_id) and (public.bridge_is_org_admin(organisation_id) or assigned_manager_id = (select auth.uid()) or created_by = (select auth.uid())));
drop policy if exists rental_portfolios_update_scoped on public.rental_portfolios;
create policy rental_portfolios_update_scoped on public.rental_portfolios for update to authenticated using (public.rental_branch_access(organisation_id, branch_id) and (public.bridge_is_org_admin(organisation_id) or assigned_manager_id = (select auth.uid()) or created_by = (select auth.uid()))) with check (public.rental_branch_access(organisation_id, branch_id) and (public.bridge_is_org_admin(organisation_id) or assigned_manager_id = (select auth.uid()) or created_by = (select auth.uid())));

drop policy if exists rental_portfolio_properties_select_scoped on public.rental_portfolio_properties;
create policy rental_portfolio_properties_select_scoped on public.rental_portfolio_properties for select to authenticated using (exists (select 1 from public.rental_portfolios rp where rp.id = portfolio_id and public.rental_branch_access(rp.organisation_id, rp.branch_id)));
drop policy if exists rental_portfolio_properties_insert_scoped on public.rental_portfolio_properties;
create policy rental_portfolio_properties_insert_scoped on public.rental_portfolio_properties for insert to authenticated with check (exists (select 1 from public.rental_portfolios portfolio join public.rental_properties property on property.id = property_id where portfolio.id = portfolio_id and public.rental_branch_access(portfolio.organisation_id, portfolio.branch_id) and public.rental_branch_access(property.organisation_id, property.branch_id) and (public.bridge_is_org_admin(portfolio.organisation_id) or portfolio.assigned_manager_id = (select auth.uid()) or property.assigned_manager_id = (select auth.uid()) or property.created_by = (select auth.uid()))));
drop policy if exists rental_portfolio_properties_update_scoped on public.rental_portfolio_properties;
create policy rental_portfolio_properties_update_scoped on public.rental_portfolio_properties for update to authenticated using (exists (select 1 from public.rental_portfolios rp where rp.id = portfolio_id and public.rental_branch_access(rp.organisation_id, rp.branch_id))) with check (exists (select 1 from public.rental_portfolios portfolio join public.rental_properties property on property.id = property_id where portfolio.id = portfolio_id and public.rental_branch_access(portfolio.organisation_id, portfolio.branch_id) and public.rental_branch_access(property.organisation_id, property.branch_id) and (public.bridge_is_org_admin(portfolio.organisation_id) or portfolio.assigned_manager_id = (select auth.uid()) or property.assigned_manager_id = (select auth.uid()) or property.created_by = (select auth.uid()))));

-- security_invoker preserves the scoped RLS policies of the caller. The index
-- can therefore fetch portfolio, property, and unit totals in one request.
create or replace view public.rental_portfolio_summaries with (security_invoker = true) as
select portfolio.id, portfolio.organisation_id, portfolio.branch_id, portfolio.assigned_manager_id, portfolio.name, portfolio.description, portfolio.status, portfolio.metadata_json, portfolio.created_by, portfolio.created_at, portfolio.updated_at,
  count(distinct assignment.property_id)::integer as property_count,
  count(unit.id)::integer as unit_count
from public.rental_portfolios portfolio
left join public.rental_portfolio_properties assignment on assignment.portfolio_id = portfolio.id
left join public.rental_units unit on unit.property_id = assignment.property_id
group by portfolio.id;
revoke all on public.rental_portfolio_summaries from anon, authenticated;
grant select on public.rental_portfolio_summaries to authenticated;
commit;
