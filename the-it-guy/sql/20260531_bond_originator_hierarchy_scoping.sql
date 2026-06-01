begin;

alter table if exists public.organisation_users
  add column if not exists workspace_role text,
  add column if not exists organisation_role text,
  add column if not exists workspace_type text,
  add column if not exists scope_level text,
  add column if not exists region_id uuid references public.workspace_regions(id) on delete set null,
  add column if not exists workspace_unit_id uuid references public.workspace_units(id) on delete set null,
  add column if not exists scope_metadata jsonb not null default '{}'::jsonb;

alter table if exists public.organisation_users
  drop constraint if exists organisation_users_scope_level_check;

alter table if exists public.organisation_users
  add constraint organisation_users_scope_level_check
  check (
    scope_level is null
    or scope_level in ('organisation', 'organization', 'workspace_hq', 'region', 'branch', 'team', 'user', 'assigned', 'independent')
  );

alter table if exists public.organisation_users
  drop constraint if exists organisation_users_workspace_role_check;

alter table if exists public.organisation_users
  add constraint organisation_users_workspace_role_check
  check (
    workspace_role is null
    or workspace_role in (
      'owner',
      'principal',
      'director',
      'partner',
      'admin',
      'admin_staff',
      'manager',
      'hq_manager',
      'regional_manager',
      'branch_manager',
      'team_lead',
      'consultant',
      'processor',
      'compliance',
      'viewer',
      'agent',
      'attorney',
      'firm_admin',
      'agency_admin',
      'super_admin',
      'developer',
      'internal_admin',
      'bond_originator',
      'bond_hq_admin',
      'bond_hq_manager',
      'bond_regional_manager',
      'bond_branch_manager',
      'bond_team_lead',
      'bond_consultant',
      'bond_processor',
      'bond_independent_consultant'
    )
  );

create index if not exists organisation_users_bond_scope_idx
  on public.organisation_users (organisation_id, scope_level, region_id, workspace_unit_id, user_id)
  where workspace_type = 'bond_originator' or role = 'bond_originator';

alter table if exists public.transaction_bond_applications
  add column if not exists assigned_organisation_id uuid references public.organisations(id) on delete set null,
  add column if not exists assigned_region_id uuid references public.workspace_regions(id) on delete set null,
  add column if not exists assigned_branch_id uuid references public.workspace_units(id) on delete set null,
  add column if not exists assigned_team_id uuid references public.workspace_units(id) on delete set null,
  add column if not exists assigned_workspace_unit_id uuid references public.workspace_units(id) on delete set null,
  add column if not exists assigned_user_id uuid references public.profiles(id) on delete set null,
  add column if not exists assignment_status text not null default 'organisation_queue',
  add column if not exists assignment_source text not null default 'transaction_roleplayer_propagation',
  add column if not exists buyer_party_id uuid references public.buyers(id) on delete set null,
  add column if not exists application_type text,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

update public.transaction_bond_applications tba
set
  assigned_workspace_unit_id = coalesce(tba.assigned_workspace_unit_id, tba.assigned_team_id, tba.assigned_branch_id),
  assignment_status = coalesce(nullif(tba.assignment_status, ''), 'organisation_queue'),
  assignment_source = coalesce(nullif(tba.assignment_source, ''), 'legacy_backfill')
where true;

alter table if exists public.transaction_bond_applications
  drop constraint if exists transaction_bond_applications_assignment_status_check;

alter table if exists public.transaction_bond_applications
  add constraint transaction_bond_applications_assignment_status_check
  check (
    assignment_status in (
      'organisation_queue',
      'region_queue',
      'branch_queue',
      'team_queue',
      'consultant_assigned',
      'independent_assigned',
      'processor_assigned',
      'fully_assigned',
      'inactive',
      'declined'
    )
  );

alter table if exists public.transaction_bond_applications
  drop constraint if exists transaction_bond_applications_assignment_source_check;

alter table if exists public.transaction_bond_applications
  add constraint transaction_bond_applications_assignment_source_check
  check (
    assignment_source in (
      'transaction_roleplayer_propagation',
      'agent_selected_organisation',
      'agent_selected_region',
      'agent_selected_branch',
      'agent_selected_team',
      'agent_selected_consultant',
      'assigned_from_intake',
      'accepted_from_intake',
      'manual',
      'legacy_backfill',
      'system_repair'
    )
  );

drop index if exists public.transaction_bond_applications_originator_intake_uidx;

create unique index transaction_bond_applications_originator_intake_uidx
  on public.transaction_bond_applications (transaction_id, coalesce(application_type, 'originator_intake'))
  where coalesce(application_type, 'originator_intake') = 'originator_intake';

create index if not exists transaction_bond_applications_assignment_scope_idx
  on public.transaction_bond_applications (
    assigned_organisation_id,
    assigned_region_id,
    assigned_branch_id,
    assigned_team_id,
    assigned_user_id,
    assignment_status
  );

create or replace function public.bridge_current_bond_scope_level(workspace_id uuid)
returns text
language sql
stable
as $$
  select case
    when ou.scope_level in ('organisation', 'organization') then 'workspace_hq'
    when ou.scope_level in ('user', 'independent') then 'assigned'
    else ou.scope_level
  end
  from public.organisation_users ou
  where ou.organisation_id = workspace_id
    and ou.user_id = auth.uid()
    and coalesce(ou.status, 'active') = 'active'
  order by ou.active_workspace_selected_at desc nulls last, ou.updated_at desc nulls last
  limit 1
$$;

create or replace function public.bridge_is_bond_workspace_hq_member(workspace_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.organisation_users ou
    where ou.organisation_id = workspace_id
      and ou.user_id = auth.uid()
      and coalesce(ou.status, 'active') = 'active'
      and (
        ou.scope_level in ('organisation', 'organization', 'workspace_hq')
        or coalesce(ou.workspace_role, ou.role) in ('owner', 'director', 'hq_manager', 'bond_hq_admin', 'bond_hq_manager')
      )
  )
$$;

create or replace function public.bridge_bond_application_workspace_id(application_id uuid)
returns uuid
language sql
stable
as $$
  select coalesce(tba.assigned_organisation_id, t.bond_workspace_id, t.organisation_id)
  from public.transaction_bond_applications tba
  join public.transactions t on t.id = tba.transaction_id
  where tba.id = application_id
  limit 1
$$;

drop function if exists public.bridge_can_access_bond_application(uuid);

create function public.bridge_can_access_bond_application(application_id uuid)
returns boolean
language sql
stable
as $$
  with app as (
    select
      tba.*,
      coalesce(tba.assigned_organisation_id, t.bond_workspace_id, t.organisation_id) as workspace_id,
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
      ) as region_id
    from public.transaction_bond_applications tba
    join public.transactions t on t.id = tba.transaction_id
    where tba.id = application_id
  )
  select coalesce((
    select
      public.bridge_can_access_bond_transaction_phase5b(app.transaction_id)
      and (
        app.assigned_user_id = auth.uid()
        or public.bridge_can_access_bond_assignment(app.transaction_id)
        or public.bridge_is_bond_workspace_hq_member(app.workspace_id)
        or public.bridge_can_access_bond_region(app.workspace_id, app.region_id)
        or public.bridge_can_access_bond_workspace_unit(app.workspace_id, app.unit_id)
      )
    from app
  ), false)
$$;

drop policy if exists transaction_bond_applications_select on public.transaction_bond_applications;
drop policy if exists transaction_bond_applications_select_scoped on public.transaction_bond_applications;

create policy transaction_bond_applications_select_scoped
  on public.transaction_bond_applications
  for select
  to authenticated
  using (public.bridge_can_access_bond_application(id));

drop policy if exists transaction_bond_applications_modify on public.transaction_bond_applications;
drop policy if exists transaction_bond_applications_modify_scoped on public.transaction_bond_applications;

create policy transaction_bond_applications_modify_scoped
  on public.transaction_bond_applications
  for all
  to authenticated
  using (
    public.bridge_can_access_bond_application(id)
    and (
      assigned_user_id = auth.uid()
      or public.bridge_can_manage_bond_assignment_phase5d(transaction_id)
    )
  )
  with check (
    public.bridge_can_access_bond_transaction_phase5b(transaction_id)
  );

grant execute on function public.bridge_bond_application_workspace_id(uuid) to authenticated;
grant execute on function public.bridge_can_access_bond_application(uuid) to authenticated;

commit;
