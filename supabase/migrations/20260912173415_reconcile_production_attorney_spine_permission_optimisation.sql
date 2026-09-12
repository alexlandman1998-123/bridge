-- Reconciles the production attorney-firm access expansion with the later
-- identity-local permission reader optimisation.  The production function
-- intentionally permits an active member of the assigned firm/organisation
-- to open its intake matters; retain that rule while avoiding repeated JWT
-- and auth.uid() evaluation for every branch.
--
-- This is append-only.  The preceding optimisation was already recorded in
-- staging, but production safely refused it because its function had evolved.

do $guard$
begin
  if to_regprocedure('public.bridge_can_access_transaction_spine(uuid)') is null
     or to_regprocedure('public.bridge_has_transaction_access(uuid)') is null then
    raise exception 'Transaction permission functions must exist before reconciliation';
  end if;
end;
$guard$;

create or replace function public.bridge_can_access_transaction_spine(target_transaction_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_email text;
  tx record;
begin
  if v_uid is null then
    return false;
  end if;

  select
    t.owner_user_id,
    t.assigned_user_id,
    t.assigned_agent_email,
    t.assigned_attorney_email,
    t.assigned_bond_originator_email,
    t.organisation_id,
    t.assigned_branch_id
  into tx
  from public.transactions t
  where t.id = target_transaction_id;

  if not found then
    return false;
  end if;

  v_email := lower(coalesce(auth.jwt() ->> 'email', ''));

  if public.bridge_transaction_scope_is_internal_user() then return true; end if;
  if tx.owner_user_id = v_uid then return true; end if;
  if tx.assigned_user_id = v_uid then return true; end if;
  if lower(coalesce(tx.assigned_agent_email, '')) = v_email then return true; end if;
  if lower(coalesce(tx.assigned_attorney_email, '')) = v_email then return true; end if;
  if lower(coalesce(tx.assigned_bond_originator_email, '')) = v_email then return true; end if;

  if public.bridge_support_can_access_record(
    tx.organisation_id,
    tx.assigned_branch_id,
    'transaction',
    tx.owner_user_id,
    tx.assigned_user_id,
    null
  ) then return true; end if;

  if exists (
    select 1
    from public.organisation_users ou
    where ou.organisation_id = tx.organisation_id
      and ou.user_id = v_uid
      and coalesce(ou.status, 'active') in ('active', 'accepted')
      and (
        ou.scope_level in ('organisation', 'organization', 'workspace_hq')
        or coalesce(ou.workspace_role, ou.organisation_role, ou.role) in (
          'owner', 'principal', 'director', 'partner', 'admin', 'admin_staff', 'manager', 'hq_manager'
        )
        or (ou.scope_level = 'branch' and ou.workspace_unit_id = tx.assigned_branch_id)
      )
  ) then return true; end if;

  if exists (
    select 1
    from public.transaction_participants tp
    where tp.transaction_id = target_transaction_id
      and coalesce(tp.status, 'active') = 'active'
      and tp.removed_at is null
      and (
        tp.user_id = v_uid
        or tp.assigned_user_id = v_uid
        or lower(coalesce(tp.participant_email, '')) = v_email
      )
  ) then return true; end if;

  if exists (
    select 1
    from public.transaction_role_players trp
    where trp.transaction_id = target_transaction_id
      and coalesce(trp.status, 'active') <> 'removed'
      and trp.removed_at is null
      and (
        trp.user_id = v_uid
        or trp.assigned_user_id = v_uid
        or lower(coalesce(trp.email_address, '')) = v_email
      )
  ) then return true; end if;

  -- Keep production's firm-first visibility: an active member may access a
  -- matter assigned to either its firm or the firm's organisation.
  if exists (
    select 1
    from public.transaction_attorney_assignments taa
    left join public.attorney_firms af
      on af.id = coalesce(taa.attorney_firm_id, taa.firm_id)
    where taa.transaction_id = target_transaction_id
      and coalesce(taa.assignment_status, 'pending') in ('pending', 'active', 'paused')
      and coalesce(taa.status, 'active') <> 'removed'
      and (
        taa.assigned_user_id = v_uid
        or taa.primary_attorney_id = v_uid
        or taa.attorney_user_id = v_uid
        or public.bridge_is_active_member(taa.assigned_organisation_id)
        or public.bridge_is_active_member(af.organisation_id)
        or exists (
          select 1
          from public.attorney_firm_members member
          where member.firm_id = coalesce(taa.attorney_firm_id, taa.firm_id, taa.assigned_organisation_id)
            and member.user_id = v_uid
            and coalesce(member.status, 'active') in ('active', 'accepted')
        )
      )
  ) then return true; end if;

  if exists (
    select 1
    from public.transaction_bond_applications tba
    where tba.transaction_id = target_transaction_id
      and public.bridge_can_access_bond_application_scope(tba.id)
  ) then return true; end if;

  return false;
end;
$function$;

grant execute on function public.bridge_can_access_transaction_spine(uuid) to authenticated;
