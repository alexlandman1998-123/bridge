begin;
create table if not exists public.bond_rls_cutover_exclusions (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  exclusion_type text not null,
  reason text,
  source text,
  reviewed_by text,
  reviewed_at timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists bond_rls_cutover_exclusions_transaction_idx
  on public.bond_rls_cutover_exclusions(transaction_id);
create index if not exists bond_rls_cutover_exclusions_active_type_idx
  on public.bond_rls_cutover_exclusions(active, exclusion_type);
create or replace function public.bridge_bond_transaction_workspace_id(transaction_id uuid)
returns uuid
language sql
stable
as $$
  select coalesce(t.bond_workspace_id, t.organisation_id)
  from public.transactions t
  where t.id = transaction_id
  limit 1
$$;
create or replace function public.bridge_bond_transaction_region_id(transaction_id uuid)
returns uuid
language sql
stable
as $$
  select t.bond_region_id
  from public.transactions t
  where t.id = transaction_id
  limit 1
$$;
create or replace function public.bridge_bond_transaction_workspace_unit_id(transaction_id uuid)
returns uuid
language sql
stable
as $$
  select t.bond_workspace_unit_id
  from public.transactions t
  where t.id = transaction_id
  limit 1
$$;
create or replace function public.bridge_bond_primary_consultant_user_id(transaction_id uuid)
returns uuid
language sql
stable
as $$
  select t.primary_bond_consultant_user_id
  from public.transactions t
  where t.id = transaction_id
  limit 1
$$;
create or replace function public.bridge_bond_processor_user_id(transaction_id uuid)
returns uuid
language sql
stable
as $$
  select t.assigned_bond_processor_user_id
  from public.transactions t
  where t.id = transaction_id
  limit 1
$$;
create or replace function public.bridge_bond_manager_user_id(transaction_id uuid)
returns uuid
language sql
stable
as $$
  select t.assigned_bond_manager_user_id
  from public.transactions t
  where t.id = transaction_id
  limit 1
$$;
create or replace function public.bridge_bond_compliance_user_id(transaction_id uuid)
returns uuid
language sql
stable
as $$
  select t.assigned_bond_compliance_user_id
  from public.transactions t
  where t.id = transaction_id
  limit 1
$$;
create or replace function public.bridge_current_bond_workspace_role(workspace_id uuid)
returns text
language sql
stable
as $$
  select coalesce(ou.workspace_role, ou.role)
  from public.organisation_users ou
  where ou.organisation_id = workspace_id
    and ou.user_id = auth.uid()
    and coalesce(ou.status, 'active') = 'active'
  order by ou.active_workspace_selected_at desc nulls last, ou.updated_at desc nulls last
  limit 1
$$;
create or replace function public.bridge_current_bond_scope_level(workspace_id uuid)
returns text
language sql
stable
as $$
  select ou.scope_level
  from public.organisation_users ou
  where ou.organisation_id = workspace_id
    and ou.user_id = auth.uid()
    and coalesce(ou.status, 'active') = 'active'
  order by ou.active_workspace_selected_at desc nulls last, ou.updated_at desc nulls last
  limit 1
$$;
create or replace function public.bridge_current_bond_region_id(workspace_id uuid)
returns uuid
language sql
stable
as $$
  select ou.region_id
  from public.organisation_users ou
  where ou.organisation_id = workspace_id
    and ou.user_id = auth.uid()
    and coalesce(ou.status, 'active') = 'active'
  order by ou.active_workspace_selected_at desc nulls last, ou.updated_at desc nulls last
  limit 1
$$;
create or replace function public.bridge_current_bond_workspace_unit_id(workspace_id uuid)
returns uuid
language sql
stable
as $$
  select ou.workspace_unit_id
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
        ou.scope_level = 'workspace_hq'
        or coalesce(ou.workspace_role, ou.role) in ('owner', 'director', 'hq_manager')
      )
  )
$$;
create or replace function public.bridge_can_access_bond_region(workspace_id uuid, region_id uuid)
returns boolean
language sql
stable
as $$
  select
    public.bridge_is_bond_workspace_hq_member(workspace_id)
    or exists (
      select 1
      from public.organisation_users ou
      where ou.organisation_id = workspace_id
        and ou.user_id = auth.uid()
        and coalesce(ou.status, 'active') = 'active'
        and ou.scope_level = 'region'
        and ou.region_id = region_id
    )
$$;
create or replace function public.bridge_can_access_bond_workspace_unit(workspace_id uuid, workspace_unit_id uuid)
returns boolean
language sql
stable
as $$
  select
    public.bridge_is_bond_workspace_hq_member(workspace_id)
    or exists (
      select 1
      from public.organisation_users ou
      where ou.organisation_id = workspace_id
        and ou.user_id = auth.uid()
        and coalesce(ou.status, 'active') = 'active'
        and ou.scope_level in ('branch', 'team')
        and ou.workspace_unit_id = workspace_unit_id
    )
$$;
create or replace function public.bridge_can_access_bond_assignment(transaction_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.transactions t
    where t.id = transaction_id
      and auth.uid() in (
        t.primary_bond_consultant_user_id,
        t.assigned_bond_processor_user_id,
        t.assigned_bond_manager_user_id,
        t.assigned_bond_compliance_user_id
      )
  )
$$;
create or replace function public.bridge_has_bond_transaction_participant_access(transaction_id uuid)
returns boolean
language sql
stable
as $$
  with current_email as (
    select lower(u.email) as email
    from auth.users u
    where u.id = auth.uid()
  )
  select exists (
    select 1
    from public.transaction_participants tp
    left join current_email ce on true
    where tp.transaction_id = transaction_id
      and coalesce(tp.status, 'active') = 'active'
      and (
        tp.user_id = auth.uid()
        or (
          ce.email is not null
          and lower(coalesce(tp.participant_email, '')) = ce.email
        )
      )
  )
$$;
create or replace function public.bridge_can_access_bond_transaction_shadow(transaction_id uuid)
returns boolean
language sql
stable
as $$
  with tx as (
    select *
    from public.transactions t
    where t.id = transaction_id
  ),
  ws as (
    select public.bridge_bond_transaction_workspace_id(transaction_id) as workspace_id
  ),
  current_email as (
    select lower(u.email) as email
    from auth.users u
    where u.id = auth.uid()
  ),
  excluded as (
    select exists(
      select 1
      from public.bond_rls_cutover_exclusions ex
      where ex.transaction_id = transaction_id
        and ex.active = true
    ) as is_excluded
  )
  select
    (select is_excluded from excluded)
    or public.bridge_can_access_bond_assignment(transaction_id)
    or public.bridge_has_bond_transaction_participant_access(transaction_id)
    or (
      (select workspace_id from ws) is not null
      and (
        public.bridge_is_bond_workspace_hq_member((select workspace_id from ws))
        or public.bridge_can_access_bond_region((select workspace_id from ws), public.bridge_bond_transaction_region_id(transaction_id))
        or public.bridge_can_access_bond_workspace_unit((select workspace_id from ws), public.bridge_bond_transaction_workspace_unit_id(transaction_id))
      )
    )
    or exists (
      select 1
      from tx
      left join current_email ce on true
      where ce.email is not null
        and (
          lower(coalesce(tx.assigned_bond_originator_email, '')) = ce.email
          or lower(coalesce(tx.bond_originator, '')) = ce.email
        )
    )
$$;
grant execute on function public.bridge_bond_transaction_workspace_id(uuid) to authenticated;
grant execute on function public.bridge_bond_transaction_region_id(uuid) to authenticated;
grant execute on function public.bridge_bond_transaction_workspace_unit_id(uuid) to authenticated;
grant execute on function public.bridge_bond_primary_consultant_user_id(uuid) to authenticated;
grant execute on function public.bridge_bond_processor_user_id(uuid) to authenticated;
grant execute on function public.bridge_bond_manager_user_id(uuid) to authenticated;
grant execute on function public.bridge_bond_compliance_user_id(uuid) to authenticated;
grant execute on function public.bridge_current_bond_workspace_role(uuid) to authenticated;
grant execute on function public.bridge_current_bond_scope_level(uuid) to authenticated;
grant execute on function public.bridge_current_bond_region_id(uuid) to authenticated;
grant execute on function public.bridge_current_bond_workspace_unit_id(uuid) to authenticated;
grant execute on function public.bridge_is_bond_workspace_hq_member(uuid) to authenticated;
grant execute on function public.bridge_can_access_bond_region(uuid, uuid) to authenticated;
grant execute on function public.bridge_can_access_bond_workspace_unit(uuid, uuid) to authenticated;
grant execute on function public.bridge_can_access_bond_assignment(uuid) to authenticated;
grant execute on function public.bridge_has_bond_transaction_participant_access(uuid) to authenticated;
grant execute on function public.bridge_can_access_bond_transaction_shadow(uuid) to authenticated;
commit;
