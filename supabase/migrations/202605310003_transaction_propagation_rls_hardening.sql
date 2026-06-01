begin;

alter table if exists public.transactions
  add column if not exists external_onboarding_submitted_at timestamptz;

alter table if exists public.transaction_role_players
  add column if not exists assigned_organisation_id uuid,
  add column if not exists assigned_workspace_unit_id uuid,
  add column if not exists assigned_branch_id uuid,
  add column if not exists assigned_region_id uuid,
  add column if not exists assigned_team_id uuid,
  add column if not exists assigned_user_id uuid,
  add column if not exists scope_level text,
  add column if not exists scope_metadata jsonb not null default '{}'::jsonb;

update public.transaction_role_players trp
set
  assigned_organisation_id = coalesce(trp.assigned_organisation_id, trp.organisation_id),
  assigned_workspace_unit_id = coalesce(trp.assigned_workspace_unit_id, trp.workspace_unit_id),
  assigned_branch_id = coalesce(trp.assigned_branch_id, trp.branch_id),
  assigned_user_id = coalesce(trp.assigned_user_id, trp.user_id),
  scope_level = coalesce(nullif(trp.scope_level, ''), case
    when coalesce(trp.assigned_user_id, trp.user_id) is not null then 'user'
    when coalesce(trp.assigned_team_id, trp.assigned_workspace_unit_id, trp.workspace_unit_id) is not null then 'team'
    when coalesce(trp.assigned_branch_id, trp.branch_id) is not null then 'branch'
    when trp.assigned_region_id is not null then 'region'
    when coalesce(trp.assigned_organisation_id, trp.organisation_id) is not null then 'organisation'
    else null
  end)
where true;

alter table if exists public.transaction_participants
  add column if not exists assigned_organisation_id uuid,
  add column if not exists assigned_workspace_unit_id uuid,
  add column if not exists assigned_branch_id uuid,
  add column if not exists assigned_region_id uuid,
  add column if not exists assigned_team_id uuid,
  add column if not exists assigned_user_id uuid,
  add column if not exists scope_level text,
  add column if not exists scope_metadata jsonb not null default '{}'::jsonb;

update public.transaction_participants tp
set
  assigned_user_id = coalesce(tp.assigned_user_id, tp.user_id),
  scope_level = coalesce(nullif(tp.scope_level, ''), case when coalesce(tp.assigned_user_id, tp.user_id) is not null then 'user' else null end)
where true;

alter table if exists public.transaction_attorney_assignments
  add column if not exists assigned_region_id uuid,
  add column if not exists assigned_team_id uuid,
  add column if not exists scope_level text,
  add column if not exists scope_metadata jsonb not null default '{}'::jsonb;

update public.transaction_attorney_assignments taa
set
  scope_level = coalesce(nullif(taa.scope_level, ''), case
    when taa.assigned_user_id is not null then 'user'
    when taa.assigned_team_id is not null then 'team'
    when taa.assigned_branch_id is not null then 'branch'
    when taa.assigned_region_id is not null then 'region'
    when taa.assigned_organisation_id is not null then 'organisation'
    else null
  end)
where true;

alter table if exists public.transaction_bond_applications
  add column if not exists assigned_region_id uuid,
  add column if not exists assigned_team_id uuid,
  add column if not exists assigned_workspace_unit_id uuid,
  add column if not exists assigned_user_id uuid,
  add column if not exists scope_level text,
  add column if not exists scope_metadata jsonb not null default '{}'::jsonb;

update public.transaction_bond_applications tba
set
  assigned_workspace_unit_id = coalesce(tba.assigned_workspace_unit_id, tba.assigned_team_id, tba.assigned_branch_id),
  scope_level = coalesce(nullif(tba.scope_level, ''), case
    when tba.assigned_user_id is not null and tba.assigned_region_id is null and tba.assigned_branch_id is null and tba.assigned_team_id is null and tba.assigned_workspace_unit_id is null then 'independent'
    when tba.assigned_user_id is not null then 'user'
    when tba.assigned_team_id is not null then 'team'
    when tba.assigned_branch_id is not null or tba.assigned_workspace_unit_id is not null then 'branch'
    when tba.assigned_region_id is not null then 'region'
    when tba.assigned_organisation_id is not null then 'organisation'
    else null
  end)
where true;

create index if not exists transaction_role_players_assignment_scope_idx
  on public.transaction_role_players (assigned_organisation_id, assigned_region_id, assigned_branch_id, assigned_team_id, assigned_user_id);

create index if not exists transaction_participants_assignment_scope_idx
  on public.transaction_participants (assigned_organisation_id, assigned_region_id, assigned_branch_id, assigned_team_id, assigned_user_id);

create index if not exists transaction_attorney_assignments_assignment_scope_idx
  on public.transaction_attorney_assignments (assigned_organisation_id, assigned_region_id, assigned_branch_id, assigned_team_id, assigned_user_id);

create index if not exists transaction_bond_applications_assignment_scope_v2_idx
  on public.transaction_bond_applications (assigned_organisation_id, assigned_region_id, assigned_branch_id, assigned_team_id, assigned_user_id);

alter table if exists public.transaction_events
  drop constraint if exists transaction_events_event_type_check;

alter table if exists public.transaction_events
  add constraint transaction_events_event_type_check
  check (
    event_type in (
      'TransactionCreated',
      'TransactionUpdated',
      'TransactionStageChanged',
      'DocumentUploaded',
      'DocumentVisibilityChanged',
      'CommentAdded',
      'ParticipantAssigned',
      'WorkflowStepUpdated',
      'StatusLinkCreated',
      'OccupationalRentUpdated',
      'BondHybridFinanceWorkflowUpdated',
      'BondHybridFinanceApplicationUpdated',
      'BondHybridFinanceQuoteUpdated',
      'BondHybridFinanceInstructionSent',
      'AttorneyCriticalBlockerCreated',
      'AttorneyDocumentUploaded',
      'AttorneyLaneBlocked',
      'AttorneyLaneCompleted',
      'AttorneyLaneCreated',
      'AttorneyLaneStageUpdated',
      'AttorneyUnauthorizedAccessAttempt',
      'transaction_created',
      'transfer_attorney_assigned',
      'bond_originator_assigned',
      'cancellation_attorney_assigned',
      'attorney_assignment_created',
      'bond_application_created',
      'roleplayer_visibility_granted',
      'roleplayer_reassigned'
    )
  );

create or replace function public.bridge_transaction_scope_is_internal_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and lower(coalesce(p.role, '')) in ('developer', 'internal_admin', 'admin', 'super_admin')
  )
$$;

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
        or (
          coalesce(app.scope_level, '') <> 'independent'
          and exists (
            select 1
            from memberships ou
            left join public.workspace_units target_unit on target_unit.id = app.unit_id
            where
              ou.scope_level in ('organisation', 'organization', 'workspace_hq')
              or coalesce(ou.workspace_role, ou.organisation_role, ou.role) in ('owner', 'principal', 'director', 'partner', 'admin', 'admin_staff', 'manager', 'hq_manager', 'bond_hq_admin', 'bond_hq_manager')
              or (ou.scope_level = 'region' and ou.region_id = app.region_id)
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
    from app
  ), false)
$$;

create or replace function public.bridge_can_access_transaction_spine(target_transaction_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with tx as (
    select *
    from public.transactions t
    where t.id = target_transaction_id
  )
  select coalesce((
    select
      auth.uid() is not null
      and (
        public.bridge_transaction_scope_is_internal_user()
        or tx.owner_user_id = auth.uid()
        or tx.assigned_user_id = auth.uid()
        or tx.created_by = auth.uid()
        or lower(coalesce(tx.assigned_agent_email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
        or lower(coalesce(tx.assigned_attorney_email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
        or lower(coalesce(tx.assigned_bond_originator_email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
        or exists (
          select 1
          from public.organisation_users ou
          where ou.organisation_id = tx.organisation_id
            and ou.user_id = auth.uid()
            and coalesce(ou.status, 'active') in ('active', 'accepted')
            and (
              ou.scope_level in ('organisation', 'organization', 'workspace_hq')
              or coalesce(ou.workspace_role, ou.organisation_role, ou.role) in ('owner', 'principal', 'director', 'partner', 'admin', 'admin_staff', 'manager', 'hq_manager')
              or (ou.scope_level = 'branch' and ou.workspace_unit_id = tx.assigned_branch_id)
            )
        )
        or exists (
          select 1
          from public.transaction_participants tp
          where tp.transaction_id = target_transaction_id
            and coalesce(tp.status, 'active') = 'active'
            and tp.removed_at is null
            and (
              tp.user_id = auth.uid()
              or tp.assigned_user_id = auth.uid()
              or lower(coalesce(tp.participant_email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
            )
        )
        or exists (
          select 1
          from public.transaction_role_players trp
          where trp.transaction_id = target_transaction_id
            and coalesce(trp.status, 'active') <> 'removed'
            and trp.removed_at is null
            and (
              trp.user_id = auth.uid()
              or trp.assigned_user_id = auth.uid()
              or lower(coalesce(trp.email_address, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
            )
        )
        or exists (
          select 1
          from public.transaction_attorney_assignments taa
          where taa.transaction_id = target_transaction_id
            and coalesce(taa.status, 'active') <> 'removed'
            and (
              taa.assigned_user_id = auth.uid()
              or taa.primary_attorney_id = auth.uid()
              or taa.attorney_user_id = auth.uid()
            )
        )
        or exists (
          select 1
          from public.transaction_bond_applications tba
          where tba.transaction_id = target_transaction_id
            and public.bridge_can_access_bond_application_scope(tba.id)
        )
      )
    from tx
  ), false)
$$;

alter table if exists public.transactions enable row level security;
alter table if exists public.transaction_role_players enable row level security;
alter table if exists public.transaction_participants enable row level security;
alter table if exists public.transaction_events enable row level security;
alter table if exists public.transaction_attorney_assignments enable row level security;
alter table if exists public.transaction_bond_applications enable row level security;

drop policy if exists transactions_demo_all on public.transactions;
drop policy if exists transaction_role_players_demo_all on public.transaction_role_players;
drop policy if exists transaction_participants_demo_all on public.transaction_participants;
drop policy if exists transaction_events_demo_all on public.transaction_events;
drop policy if exists transaction_bond_applications_demo_all on public.transaction_bond_applications;
drop policy if exists transaction_bond_applications_select_scoped on public.transaction_bond_applications;
drop policy if exists transaction_bond_applications_modify_scoped on public.transaction_bond_applications;

drop policy if exists transactions_select_transaction_spine_scope on public.transactions;
create policy transactions_select_transaction_spine_scope
  on public.transactions
  for select
  to authenticated
  using (public.bridge_can_access_transaction_spine(id));

drop policy if exists transactions_insert_transaction_spine_scope on public.transactions;
create policy transactions_insert_transaction_spine_scope
  on public.transactions
  for insert
  to authenticated
  with check (
    auth.uid() is not null
    and (
      owner_user_id is null
      or owner_user_id = auth.uid()
      or assigned_user_id = auth.uid()
      or lower(coalesce(assigned_agent_email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
    )
  );

drop policy if exists transactions_update_transaction_spine_scope on public.transactions;
create policy transactions_update_transaction_spine_scope
  on public.transactions
  for update
  to authenticated
  using (public.bridge_can_access_transaction_spine(id))
  with check (public.bridge_can_access_transaction_spine(id));

drop policy if exists transaction_bond_applications_select_scope_hardened on public.transaction_bond_applications;
create policy transaction_bond_applications_select_scope_hardened
  on public.transaction_bond_applications
  for select
  to authenticated
  using (public.bridge_can_access_bond_application_scope(id));

drop policy if exists transaction_bond_applications_insert_scope_hardened on public.transaction_bond_applications;
create policy transaction_bond_applications_insert_scope_hardened
  on public.transaction_bond_applications
  for insert
  to authenticated
  with check (public.bridge_can_access_transaction_spine(transaction_id));

drop policy if exists transaction_bond_applications_update_scope_hardened on public.transaction_bond_applications;
create policy transaction_bond_applications_update_scope_hardened
  on public.transaction_bond_applications
  for update
  to authenticated
  using (public.bridge_can_access_bond_application_scope(id) or public.bridge_can_access_transaction_spine(transaction_id))
  with check (public.bridge_can_access_transaction_spine(transaction_id));

drop policy if exists transaction_participants_select_transaction_spine_scope on public.transaction_participants;
create policy transaction_participants_select_transaction_spine_scope
  on public.transaction_participants
  for select
  to authenticated
  using (public.bridge_can_access_transaction_spine(transaction_id));

drop policy if exists transaction_participants_insert_transaction_spine_scope on public.transaction_participants;
create policy transaction_participants_insert_transaction_spine_scope
  on public.transaction_participants
  for insert
  to authenticated
  with check (public.bridge_can_access_transaction_spine(transaction_id));

drop policy if exists transaction_participants_update_transaction_spine_scope on public.transaction_participants;
create policy transaction_participants_update_transaction_spine_scope
  on public.transaction_participants
  for update
  to authenticated
  using (public.bridge_can_access_transaction_spine(transaction_id))
  with check (public.bridge_can_access_transaction_spine(transaction_id));

drop policy if exists transaction_role_players_select_transaction_spine_scope on public.transaction_role_players;
create policy transaction_role_players_select_transaction_spine_scope
  on public.transaction_role_players
  for select
  to authenticated
  using (public.bridge_can_access_transaction_spine(transaction_id));

drop policy if exists transaction_role_players_insert_transaction_spine_scope on public.transaction_role_players;
create policy transaction_role_players_insert_transaction_spine_scope
  on public.transaction_role_players
  for insert
  to authenticated
  with check (public.bridge_can_access_transaction_spine(transaction_id));

drop policy if exists transaction_role_players_update_transaction_spine_scope on public.transaction_role_players;
create policy transaction_role_players_update_transaction_spine_scope
  on public.transaction_role_players
  for update
  to authenticated
  using (public.bridge_can_access_transaction_spine(transaction_id))
  with check (public.bridge_can_access_transaction_spine(transaction_id));

drop policy if exists transaction_events_select_transaction_spine_scope on public.transaction_events;
create policy transaction_events_select_transaction_spine_scope
  on public.transaction_events
  for select
  to authenticated
  using (public.bridge_can_access_transaction_spine(transaction_id));

drop policy if exists transaction_events_insert_transaction_spine_scope on public.transaction_events;
create policy transaction_events_insert_transaction_spine_scope
  on public.transaction_events
  for insert
  to authenticated
  with check (public.bridge_can_access_transaction_spine(transaction_id));

drop policy if exists transaction_attorney_assignments_select_transaction_spine_scope on public.transaction_attorney_assignments;
create policy transaction_attorney_assignments_select_transaction_spine_scope
  on public.transaction_attorney_assignments
  for select
  to authenticated
  using (
    public.bridge_can_access_transaction_spine(transaction_id)
    and (
      assigned_user_id = auth.uid()
      or primary_attorney_id = auth.uid()
      or attorney_user_id = auth.uid()
      or public.bridge_transaction_scope_is_internal_user()
      or exists (
        select 1
        from public.transactions t
        where t.id = transaction_attorney_assignments.transaction_id
          and (
            t.owner_user_id = auth.uid()
            or t.assigned_user_id = auth.uid()
            or lower(coalesce(t.assigned_agent_email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
          )
      )
    )
  );

grant execute on function public.bridge_transaction_scope_is_internal_user() to authenticated;
grant execute on function public.bridge_can_access_bond_application_scope(uuid) to authenticated;
grant execute on function public.bridge_can_access_transaction_spine(uuid) to authenticated;

notify pgrst, 'reload schema';

commit;
