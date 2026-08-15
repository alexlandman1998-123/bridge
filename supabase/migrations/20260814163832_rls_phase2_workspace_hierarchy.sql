begin;
-- Phase 2 covers the workspace hierarchy reference tables classified in
-- docs/supabase-rls-phase-0-policy-classification.md.

create or replace function public.bridge_can_manage_workspace_hierarchy(
  target_workspace_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.bridge_phase5_can_manage_hierarchy(target_workspace_id), false)
      or coalesce(public.bridge_has_workspace_permission(target_workspace_id, 'manage_branches'), false)
      or coalesce(public.bridge_is_org_admin(target_workspace_id), false)
$$;
revoke all on function public.bridge_can_manage_workspace_hierarchy(uuid)
  from public, anon;
grant execute on function public.bridge_can_manage_workspace_hierarchy(uuid)
  to authenticated, service_role;
create or replace function public.bridge_workspace_unit_hierarchy_shape_is_valid(
  target_workspace_id uuid,
  target_region_id uuid,
  target_parent_unit_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select target_workspace_id is not null
    and (
      target_region_id is null
      or exists (
        select 1
        from public.workspace_regions wr
        where wr.id = target_region_id
          and wr.workspace_id = target_workspace_id
      )
    )
    and (
      target_parent_unit_id is null
      or exists (
        select 1
        from public.workspace_units wu
        where wu.id = target_parent_unit_id
          and wu.workspace_id = target_workspace_id
      )
    )
$$;
revoke all on function public.bridge_workspace_unit_hierarchy_shape_is_valid(uuid, uuid, uuid)
  from public, anon;
grant execute on function public.bridge_workspace_unit_hierarchy_shape_is_valid(uuid, uuid, uuid)
  to authenticated, service_role;
alter table if exists public.workspace_regions enable row level security;
revoke all on table public.workspace_regions from public, anon, authenticated;
grant select, insert, update on table public.workspace_regions to authenticated;
grant all on table public.workspace_regions to service_role;
drop policy if exists workspace_regions_member_select
  on public.workspace_regions;
create policy workspace_regions_member_select
  on public.workspace_regions
  for select
  to authenticated
  using (public.bridge_is_active_member(workspace_id));
drop policy if exists workspace_regions_manager_insert
  on public.workspace_regions;
create policy workspace_regions_manager_insert
  on public.workspace_regions
  for insert
  to authenticated
  with check (public.bridge_can_manage_workspace_hierarchy(workspace_id));
drop policy if exists workspace_regions_manager_update
  on public.workspace_regions;
create policy workspace_regions_manager_update
  on public.workspace_regions
  for update
  to authenticated
  using (public.bridge_can_manage_workspace_hierarchy(workspace_id))
  with check (public.bridge_can_manage_workspace_hierarchy(workspace_id));
comment on table public.workspace_regions is
  'Workspace hierarchy regions. Members may read rows for their workspace; hierarchy managers may create/update; hard delete remains disabled.';
alter table if exists public.workspace_units enable row level security;
revoke all on table public.workspace_units from public, anon, authenticated;
grant select, insert, update on table public.workspace_units to authenticated;
grant all on table public.workspace_units to service_role;
drop policy if exists workspace_units_member_select
  on public.workspace_units;
create policy workspace_units_member_select
  on public.workspace_units
  for select
  to authenticated
  using (public.bridge_is_active_member(workspace_id));
drop policy if exists workspace_units_manager_insert
  on public.workspace_units;
create policy workspace_units_manager_insert
  on public.workspace_units
  for insert
  to authenticated
  with check (
    public.bridge_can_manage_workspace_hierarchy(workspace_id)
    and public.bridge_workspace_unit_hierarchy_shape_is_valid(workspace_id, region_id, parent_unit_id)
  );
drop policy if exists workspace_units_manager_update
  on public.workspace_units;
create policy workspace_units_manager_update
  on public.workspace_units
  for update
  to authenticated
  using (public.bridge_can_manage_workspace_hierarchy(workspace_id))
  with check (
    public.bridge_can_manage_workspace_hierarchy(workspace_id)
    and public.bridge_workspace_unit_hierarchy_shape_is_valid(workspace_id, region_id, parent_unit_id)
  );
comment on table public.workspace_units is
  'Workspace hierarchy units. Members may read rows for their workspace; hierarchy managers may create/update valid same-workspace units; hard delete remains disabled.';
notify pgrst, 'reload schema';
commit;
