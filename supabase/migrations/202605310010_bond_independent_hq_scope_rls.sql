begin;
create or replace function public.bridge_can_access_bond_application_scope(application_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with app as (
    select
      tba.id,
      tba.transaction_id,
      coalesce(tba.assigned_organisation_id, t.bond_workspace_id, t.organisation_id) as organisation_id,
      coalesce(tba.assigned_team_id, tba.assigned_branch_id, tba.assigned_workspace_unit_id, t.bond_workspace_unit_id) as unit_id,
      coalesce(
        tba.assigned_region_id,
        t.bond_region_id,
        (
          select wu.region_id
          from public.workspace_units wu
          where wu.id = coalesce(tba.assigned_team_id, tba.assigned_branch_id, tba.assigned_workspace_unit_id, t.bond_workspace_unit_id)
          limit 1
        )
      ) as region_id,
      tba.assigned_user_id,
      coalesce(tba.scope_level, case
        when tba.assigned_user_id is not null and tba.assigned_region_id is null and tba.assigned_branch_id is null and tba.assigned_team_id is null and tba.assigned_workspace_unit_id is null then 'independent'
        else null
      end) as scope_level
    from public.transaction_bond_applications tba
    join public.transactions t on t.id = tba.transaction_id
    where tba.id = application_id
  ),
  memberships as (
    select ou.*
    from public.organisation_users ou
    join app on app.organisation_id = ou.organisation_id
    where ou.user_id = auth.uid()
      and coalesce(ou.status, 'active') in ('active', 'accepted')
  )
  select coalesce((
    select
      auth.uid() is not null
      and (
        public.bridge_transaction_scope_is_internal_user()
        or app.assigned_user_id = auth.uid()
        or exists (
          select 1
          from public.transactions t
          where t.id = app.transaction_id
            and auth.uid() in (
              t.primary_bond_consultant_user_id,
              t.assigned_bond_processor_user_id,
              t.assigned_bond_manager_user_id,
              t.assigned_bond_compliance_user_id
            )
        )
        or exists (
          select 1
          from memberships ou
          left join public.workspace_units target_unit on target_unit.id = app.unit_id
          where
            ou.scope_level in ('organisation', 'organization', 'workspace_hq')
            or coalesce(ou.workspace_role, ou.organisation_role, ou.role) in ('owner', 'principal', 'director', 'partner', 'admin', 'admin_staff', 'manager', 'hq_manager', 'bond_hq_admin', 'bond_hq_manager')
            or (
              coalesce(app.scope_level, '') <> 'independent'
              and (
                (ou.scope_level = 'region' and ou.region_id = app.region_id)
                or (
                  ou.scope_level in ('branch', 'team')
                  and (
                    ou.workspace_unit_id = app.unit_id
                    or ou.workspace_unit_id = target_unit.parent_unit_id
                  )
                )
                or (
                  ou.scope_level in ('user', 'assigned')
                  and ou.user_id = app.assigned_user_id
                )
              )
            )
        )
      )
    from app
  ), false)
$$;
grant execute on function public.bridge_can_access_bond_application_scope(uuid) to authenticated;
notify pgrst, 'reload schema';
commit;
