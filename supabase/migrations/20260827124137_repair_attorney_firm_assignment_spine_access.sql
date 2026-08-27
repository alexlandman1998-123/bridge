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
        or public.bridge_support_can_access_record(
          tx.organisation_id,
          tx.assigned_branch_id,
          'transaction',
          tx.owner_user_id,
          tx.assigned_user_id,
          tx.created_by
        )
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
          from public.transaction_attorney_assignments taa
          join public.attorney_firm_members afm
            on afm.firm_id = coalesce(taa.attorney_firm_id, taa.firm_id)
          where taa.transaction_id = target_transaction_id
            and coalesce(taa.status, 'active') <> 'removed'
            and coalesce(taa.assignment_status, taa.status, 'active') <> 'removed'
            and afm.user_id = auth.uid()
            and coalesce(afm.status, 'active') in ('active', 'accepted')
            and coalesce(afm.role, afm.professional_role) in ('firm_admin', 'director_partner')
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

grant execute on function public.bridge_can_access_transaction_spine(uuid) to authenticated;

comment on function public.bridge_can_access_transaction_spine(uuid) is
  'Canonical transaction access resolver. Includes firm-level attorney assignment visibility so active firm admins/director partners can intake matters allocated to their firm before a staff member is assigned.';
