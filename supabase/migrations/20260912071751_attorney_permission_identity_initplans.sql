-- Version reconciled to the staging apply_migration history entry.
-- Preserve existing authorisation predicates and grants. Only execution strategy changes:
-- lazily plan independent access branches and reuse identity within each invocation.
-- No session/global cache; revocations and JWT changes are read again on the next call.
-- Fail closed on definition drift instead of replacing newer permission logic.
do $guard$
begin
  if (select md5(prosrc) from pg_proc where oid='public.bridge_can_access_transaction_spine(uuid)'::regprocedure)
      <> '2ce33b6eaf408cea2976bbd7d2bee34c'
    or (select md5(prosrc) from pg_proc where oid='public.bridge_has_transaction_access(uuid)'::regprocedure)
      <> '98f9fbc79a42f8766fdf5e099b9f5a7d' then
    raise exception 'Permission definitions changed: reconcile before applying this optimisation';
  end if;
end;
$guard$;

CREATE OR REPLACE FUNCTION public.bridge_can_access_transaction_spine(target_transaction_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_email text;
  tx record;
begin
  if v_uid is null then return false; end if;
  select t.owner_user_id, t.assigned_user_id, t.assigned_agent_email,
    t.assigned_attorney_email, t.assigned_bond_originator_email,
    t.organisation_id, t.assigned_branch_id
    into tx from public.transactions t where t.id = target_transaction_id;
  if not found then return false; end if;
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
              or coalesce(ou.workspace_role, ou.organisation_role, ou.role) in ('owner', 'principal', 'director', 'partner', 'admin', 'admin_staff', 'manager', 'hq_manager')
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
  if exists (
          select 1
          from public.transaction_attorney_assignments taa
          where taa.transaction_id = target_transaction_id
            and coalesce(taa.status, 'active') <> 'removed'
            and (
              taa.assigned_user_id = v_uid
              or taa.primary_attorney_id = v_uid
              or taa.attorney_user_id = v_uid
            )
        ) then return true; end if;
  if exists (
          select 1
          from public.transaction_attorney_assignments taa
          join public.attorney_firm_members member
            on member.firm_id = coalesce(taa.attorney_firm_id, taa.firm_id)
           and member.user_id = v_uid
           and member.status = 'active'
           and member.role in ('firm_admin', 'director_partner')
          where taa.transaction_id = target_transaction_id
            and coalesce(taa.assignment_status, 'pending') in ('pending', 'active', 'paused')
            and coalesce(taa.status, 'active') <> 'removed'
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

CREATE OR REPLACE FUNCTION public.bridge_has_transaction_access(target_transaction_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_profile_role text;
begin
  if v_uid is null then return false; end if;
  v_email := public.bridge_current_user_email();
  if public.bridge_is_admin() then return true; end if;
  if exists (
        select 1
        from public.transactions t
        where t.id = target_transaction_id
          and v_uid in (
            t.created_by,
            t.owner_user_id,
            t.assigned_user_id,
            t.assigned_agent_id
          )
      ) then return true; end if;
  if exists (
        select 1
        from public.transaction_participants tp
        where tp.transaction_id = target_transaction_id
          and tp.can_view = true
          and (
            tp.user_id = v_uid
            or lower(coalesce(tp.participant_email, '')) = v_email
          )
      ) then return true; end if;
  v_profile_role := public.bridge_current_profile_role();
  if exists (
        select 1
        from public.transactions t
        where t.id = target_transaction_id
          and (
            (
              v_profile_role = 'developer'
              and t.development_id is not null
              and public.bridge_has_development_access(t.development_id)
            )
            or (
              v_profile_role = 'agent'
              and lower(coalesce(t.assigned_agent_email, '')) = v_email
            )
            or (
              v_profile_role = 'attorney'
              and lower(coalesce(t.assigned_attorney_email, '')) = v_email
            )
            or (
              v_profile_role = 'bond_originator'
              and lower(coalesce(t.assigned_bond_originator_email, '')) = v_email
            )
          )
      ) then return true; end if;
  if exists (
        select 1
        from public.transactions t
        join public.buyers b
          on b.id = t.buyer_id
        where t.id = target_transaction_id
          and v_profile_role = 'client'
          and lower(coalesce(b.email, '')) = v_email
      ) then return true; end if;
  return false;
end;
$function$;
