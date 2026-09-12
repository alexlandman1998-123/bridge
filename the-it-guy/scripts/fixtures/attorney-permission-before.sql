CREATE OR REPLACE FUNCTION public.bridge_can_access_transaction_spine(target_transaction_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
        or lower(coalesce(tx.assigned_agent_email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
        or lower(coalesce(tx.assigned_attorney_email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
        or lower(coalesce(tx.assigned_bond_originator_email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
        or public.bridge_support_can_access_record(
          tx.organisation_id,
          tx.assigned_branch_id,
          'transaction',
          tx.owner_user_id,
          tx.assigned_user_id,
          null
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
          join public.attorney_firm_members member
            on member.firm_id = coalesce(taa.attorney_firm_id, taa.firm_id)
           and member.user_id = auth.uid()
           and member.status = 'active'
           and member.role in ('firm_admin', 'director_partner')
          where taa.transaction_id = target_transaction_id
            and coalesce(taa.assignment_status, 'pending') in ('pending', 'active', 'paused')
            and coalesce(taa.status, 'active') <> 'removed'
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
$function$

CREATE OR REPLACE FUNCTION public.bridge_has_transaction_access(target_transaction_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    case
      when auth.uid() is null then false
      when public.bridge_is_admin() then true
      when exists (
        select 1
        from public.transactions t
        where t.id = target_transaction_id
          and auth.uid() in (
            t.created_by,
            t.owner_user_id,
            t.assigned_user_id,
            t.assigned_agent_id
          )
      ) then true
      when exists (
        select 1
        from public.transaction_participants tp
        where tp.transaction_id = target_transaction_id
          and tp.can_view = true
          and (
            tp.user_id = auth.uid()
            or lower(coalesce(tp.participant_email, '')) = public.bridge_current_user_email()
          )
      ) then true
      when exists (
        select 1
        from public.transactions t
        where t.id = target_transaction_id
          and (
            (
              public.bridge_current_profile_role() = 'developer'
              and t.development_id is not null
              and public.bridge_has_development_access(t.development_id)
            )
            or (
              public.bridge_current_profile_role() = 'agent'
              and lower(coalesce(t.assigned_agent_email, '')) = public.bridge_current_user_email()
            )
            or (
              public.bridge_current_profile_role() = 'attorney'
              and lower(coalesce(t.assigned_attorney_email, '')) = public.bridge_current_user_email()
            )
            or (
              public.bridge_current_profile_role() = 'bond_originator'
              and lower(coalesce(t.assigned_bond_originator_email, '')) = public.bridge_current_user_email()
            )
          )
      ) then true
      when exists (
        select 1
        from public.transactions t
        join public.buyers b
          on b.id = t.buyer_id
        where t.id = target_transaction_id
          and public.bridge_current_profile_role() = 'client'
          and lower(coalesce(b.email, '')) = public.bridge_current_user_email()
      ) then true
      else false
    end
$function$
