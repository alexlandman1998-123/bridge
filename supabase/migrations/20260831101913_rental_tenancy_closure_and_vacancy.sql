-- Phase 61: atomic tenancy closure. The receipt preserves history while the
-- unit is made available only when it still belongs to the closing tenancy.
create table public.rental_tenancy_closures (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  tenancy_id uuid not null unique references public.rental_tenancies(id) on delete restrict,
  unit_id uuid not null references public.rental_units(id) on delete restrict,
  move_out_workflow_id uuid not null unique references public.rental_move_out_workflows(id) on delete restrict,
  closed_on date not null,
  created_vacancy_id uuid references public.rental_vacancies(id) on delete restrict,
  closed_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create index rental_tenancy_closures_unit_id_idx on public.rental_tenancy_closures (unit_id);
create index rental_tenancy_closures_created_vacancy_id_idx on public.rental_tenancy_closures (created_vacancy_id);
create index rental_tenancy_closures_closed_by_idx on public.rental_tenancy_closures (closed_by);

alter table public.rental_tenancy_closures enable row level security;
create policy "rental_tenancy_closures_branch_read"
on public.rental_tenancy_closures for select to authenticated
using (exists (
  select 1 from public.rental_tenancies tenancy
  join public.rental_properties property on property.id = tenancy.property_id
  where tenancy.id = rental_tenancy_closures.tenancy_id
    and public.rental_branch_access(property.organisation_id, property.branch_id)
));

create or replace function public.rental_get_tenancy_closure(p_tenancy_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_tenancy public.rental_tenancies%rowtype; v_workflow public.rental_move_out_workflows%rowtype; v_closure public.rental_tenancy_closures%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_tenancy from public.rental_tenancies where id = p_tenancy_id;
  if not found or not exists (select 1 from public.rental_properties property where property.id = v_tenancy.property_id and public.rental_branch_access(property.organisation_id, property.branch_id)) then raise exception 'Not authorized'; end if;
  select * into v_workflow from public.rental_move_out_workflows where tenancy_id = v_tenancy.id;
  select * into v_closure from public.rental_tenancy_closures where tenancy_id = v_tenancy.id;
  return jsonb_build_object(
    'tenancy', jsonb_build_object('id', v_tenancy.id, 'status', v_tenancy.status, 'unit_id', v_tenancy.unit_id),
    'workflow', case when v_workflow.id is null then null else jsonb_build_object('id', v_workflow.id, 'status', v_workflow.status, 'move_out_on', v_workflow.move_out_on) end,
    'blockers', coalesce((select jsonb_agg(item.label order by item.position) from public.rental_move_out_checklist_items item where item.workflow_id = v_workflow.id and item.status not in ('completed', 'waived')), '[]'::jsonb),
    'closure', case when v_closure.id is null then null else jsonb_build_object('id', v_closure.id, 'closed_on', v_closure.closed_on, 'vacancy_id', v_closure.created_vacancy_id, 'created_at', v_closure.created_at) end
  );
end $$;

create or replace function public.rental_close_tenancy(p_tenancy_id uuid, p_create_vacancy boolean default false, p_available_from date default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_tenancy public.rental_tenancies%rowtype; v_unit public.rental_units%rowtype; v_workflow public.rental_move_out_workflows%rowtype; v_closure public.rental_tenancy_closures%rowtype; v_vacancy_id uuid; v_available_from date;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_tenancy from public.rental_tenancies where id = p_tenancy_id for update;
  if not found or not exists (select 1 from public.rental_properties property where property.id = v_tenancy.property_id and public.rental_branch_access(property.organisation_id, property.branch_id)) then raise exception 'Not authorized'; end if;
  select * into v_closure from public.rental_tenancy_closures where tenancy_id = v_tenancy.id;
  if found then return jsonb_build_object('closure_id', v_closure.id, 'vacancy_id', v_closure.created_vacancy_id, 'closed', true, 'idempotent', true); end if;
  select * into v_workflow from public.rental_move_out_workflows where tenancy_id = v_tenancy.id for update;
  if not found or v_workflow.status <> 'ready' or exists (select 1 from public.rental_move_out_checklist_items item where item.workflow_id = v_workflow.id and item.status not in ('completed', 'waived')) then raise exception 'Move-out closure blockers remain'; end if;
  select * into v_unit from public.rental_units where id = v_tenancy.unit_id for update;
  if not found or v_unit.active_tenancy_id is distinct from v_tenancy.id then raise exception 'Unit occupancy has changed; tenancy cannot be closed'; end if;
  perform pg_catalog.pg_advisory_xact_lock(hashtextextended(v_unit.id::text, 61));
  v_available_from := coalesce(p_available_from, v_workflow.move_out_on, current_date);
  if v_available_from < v_workflow.move_out_on then raise exception 'Vacancy availability cannot precede the move-out date'; end if;
  if p_create_vacancy then
    select id into v_vacancy_id from public.rental_vacancies where unit_id = v_unit.id and status in ('draft', 'preparing', 'marketing', 'applications_open', 'paused') order by created_at desc limit 1 for update;
    if v_vacancy_id is null then
      insert into public.rental_vacancies (organisation_id, property_id, unit_id, branch_id, status, available_from, asking_rent, deposit_amount, vacancy_reason, created_by)
      values (v_tenancy.organisation_id, v_tenancy.property_id, v_unit.id, v_unit.branch_id, 'draft', v_available_from, coalesce(v_unit.target_rent, 0), coalesce(v_unit.deposit_amount, 0), 'tenant_move_out', auth.uid())
      returning id into v_vacancy_id;
    end if;
  end if;
  update public.rental_tenancies set status = 'closed', updated_at = now() where id = v_tenancy.id;
  update public.rental_units set status = 'vacant', active_tenancy_id = null, available_from = v_available_from, updated_at = now() where id = v_unit.id;
  insert into public.rental_tenancy_closures (organisation_id, tenancy_id, unit_id, move_out_workflow_id, closed_on, created_vacancy_id, closed_by)
  values (v_tenancy.organisation_id, v_tenancy.id, v_unit.id, v_workflow.id, v_workflow.move_out_on, v_vacancy_id, auth.uid())
  returning id into v_closure.id;
  return jsonb_build_object('closure_id', v_closure.id, 'vacancy_id', v_vacancy_id, 'closed', true, 'idempotent', false, 'unit_status', 'vacant');
end $$;

revoke all on function public.rental_get_tenancy_closure(uuid) from public, anon;
revoke all on function public.rental_close_tenancy(uuid, boolean, date) from public, anon;
grant execute on function public.rental_get_tenancy_closure(uuid) to authenticated;
grant execute on function public.rental_close_tenancy(uuid, boolean, date) to authenticated;
