begin;

-- The three legacy policies below were all permissive ALL/SELECT policies.
-- Postgres therefore evaluated overlapping profile, participant, transaction,
-- and token checks for every workflow row. Preserve their union exactly, but
-- give SELECT one authenticated policy and keep write predicates off reads.
drop policy if exists transaction_finance_workflows_modify
  on public.transaction_finance_workflows;
drop policy if exists transaction_finance_workflows_owner_agent_access
  on public.transaction_finance_workflows;
drop policy if exists transaction_finance_workflows_select
  on public.transaction_finance_workflows;

create policy transaction_finance_workflows_authenticated_select
on public.transaction_finance_workflows
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and coalesce(p.role, '') in ('developer', 'internal_admin', 'bond_originator')
  )
  or exists (
    select 1
    from public.transaction_participants tp
    where tp.transaction_id = transaction_finance_workflows.transaction_id
      and tp.status <> 'removed'
      and (
        (tp.can_edit_finance_workflow is true and tp.user_id = (select auth.uid()))
        or tp.user_id = (select auth.uid())
        or lower(coalesce(tp.participant_email, '')) = (
          select lower(coalesce(p.email, ''))
          from public.profiles p
          where p.id = (select auth.uid())
        )
      )
  )
  or (select public.bridge_transaction_scope_is_internal_user())
  or exists (
    select 1
    from public.transactions t
    where t.id = transaction_finance_workflows.transaction_id
      and (
        t.owner_user_id = (select auth.uid())
        or t.assigned_user_id = (select auth.uid())
        or lower(coalesce(t.assigned_agent_email, '')) = (
          select lower(coalesce(auth.jwt() ->> 'email', ''))
        )
        or public.bridge_can_access_transaction_spine(t.id)
      )
  )
);

create policy transaction_finance_workflows_authenticated_insert
on public.transaction_finance_workflows
for insert
to authenticated
with check (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and coalesce(p.role, '') in ('developer', 'internal_admin', 'bond_originator')
  )
  or exists (
    select 1 from public.transaction_participants tp
    where tp.transaction_id = transaction_finance_workflows.transaction_id
      and tp.status <> 'removed'
      and tp.can_edit_finance_workflow is true
      and tp.user_id = (select auth.uid())
  )
  or (select public.bridge_transaction_scope_is_internal_user())
  or exists (
    select 1 from public.transactions t
    where t.id = transaction_finance_workflows.transaction_id
      and (
        t.owner_user_id = (select auth.uid())
        or t.assigned_user_id = (select auth.uid())
        or lower(coalesce(t.assigned_agent_email, '')) = (
          select lower(coalesce(auth.jwt() ->> 'email', ''))
        )
        or public.bridge_can_access_transaction_spine(t.id)
      )
  )
);

create policy transaction_finance_workflows_authenticated_update
on public.transaction_finance_workflows
for update
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and coalesce(p.role, '') in ('developer', 'internal_admin', 'bond_originator')
  )
  or exists (
    select 1 from public.transaction_participants tp
    where tp.transaction_id = transaction_finance_workflows.transaction_id
      and tp.status <> 'removed'
      and tp.can_edit_finance_workflow is true
      and tp.user_id = (select auth.uid())
  )
  or (select public.bridge_transaction_scope_is_internal_user())
  or exists (
    select 1 from public.transactions t
    where t.id = transaction_finance_workflows.transaction_id
      and (
        t.owner_user_id = (select auth.uid())
        or t.assigned_user_id = (select auth.uid())
        or lower(coalesce(t.assigned_agent_email, '')) = (
          select lower(coalesce(auth.jwt() ->> 'email', ''))
        )
        or public.bridge_can_access_transaction_spine(t.id)
      )
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and coalesce(p.role, '') in ('developer', 'internal_admin', 'bond_originator')
  )
  or exists (
    select 1 from public.transaction_participants tp
    where tp.transaction_id = transaction_finance_workflows.transaction_id
      and tp.status <> 'removed'
      and tp.can_edit_finance_workflow is true
      and tp.user_id = (select auth.uid())
  )
  or (select public.bridge_transaction_scope_is_internal_user())
  or exists (
    select 1 from public.transactions t
    where t.id = transaction_finance_workflows.transaction_id
      and (
        t.owner_user_id = (select auth.uid())
        or t.assigned_user_id = (select auth.uid())
        or lower(coalesce(t.assigned_agent_email, '')) = (
          select lower(coalesce(auth.jwt() ->> 'email', ''))
        )
        or public.bridge_can_access_transaction_spine(t.id)
      )
  )
);

create policy transaction_finance_workflows_authenticated_delete
on public.transaction_finance_workflows
for delete
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and coalesce(p.role, '') in ('developer', 'internal_admin', 'bond_originator')
  )
  or exists (
    select 1 from public.transaction_participants tp
    where tp.transaction_id = transaction_finance_workflows.transaction_id
      and tp.status <> 'removed'
      and tp.can_edit_finance_workflow is true
      and tp.user_id = (select auth.uid())
  )
  or (select public.bridge_transaction_scope_is_internal_user())
  or exists (
    select 1 from public.transactions t
    where t.id = transaction_finance_workflows.transaction_id
      and (
        t.owner_user_id = (select auth.uid())
        or t.assigned_user_id = (select auth.uid())
        or lower(coalesce(t.assigned_agent_email, '')) = (
          select lower(coalesce(auth.jwt() ->> 'email', ''))
        )
        or public.bridge_can_access_transaction_spine(t.id)
      )
  )
);

notify pgrst, 'reload schema';

commit;
