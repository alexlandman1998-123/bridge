-- Close blank-email identity matches and apply the reviewed Developer tenant
-- boundary. Existing portal tokens, legal-team/retired-partner checks and
-- other roles' existing policies remain additional requirements.
create or replace function public.bridge_transaction_scope_is_internal_user()
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.profiles p where p.id=auth.uid()
    and lower(coalesce(p.role,'')) in ('internal_admin','admin','super_admin'));
$$;

CREATE OR REPLACE FUNCTION public.bridge_can_access_transaction_spine_pre_team(target_transaction_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_email text;
  tx record;
begin
  if v_uid is null then
    return false;
  end if;

  select
    t.created_by,
    t.assigned_agent_id,
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

  if coalesce(public.bridge_current_profile_role(),'') <> 'developer'
    and not public.bridge_agency_transaction_scope(target_transaction_id) then return false; end if;
  if public.bridge_agency_open_operations(tx.organisation_id) then return true; end if;

  v_email := lower(coalesce(nullif(btrim(auth.jwt() ->> 'email'), ''), ''));

  if public.bridge_transaction_scope_is_internal_user() then return true; end if;
  -- Developer is a tenant role, not a platform-wide internal administrator.
  if public.bridge_current_profile_role() = 'developer' and exists (
    select 1 from public.transactions t
    left join public.developments d on d.id=t.development_id
    join public.organisation_users m on m.organisation_id in (t.organisation_id,d.organisation_id)
    where t.id=target_transaction_id and m.user_id=v_uid and m.removed_at is null
      and lower(coalesce(nullif(m.membership_status,''),m.status,'')) in ('active','accepted')
  ) then return true; end if;
  if tx.created_by = v_uid or tx.assigned_agent_id = v_uid then return true; end if;
  if exists(select 1 from public.transaction_user_access a where a.transaction_id=target_transaction_id and a.user_id=v_uid) then return true; end if;
  if tx.owner_user_id = v_uid then return true; end if;
  if tx.assigned_user_id = v_uid then return true; end if;
  if v_email <> '' and lower(nullif(btrim(tx.assigned_agent_email), '')) = v_email then return true; end if;
  if v_email <> '' and lower(nullif(btrim(tx.assigned_attorney_email), '')) = v_email then return true; end if;
  if v_email <> '' and lower(nullif(btrim(tx.assigned_bond_originator_email), '')) = v_email then return true; end if;

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
      and ou.removed_at is null
      and lower(coalesce(nullif(ou.membership_status,''),ou.status,'')) in ('active','accepted')
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
      and tp.can_view is true
      and coalesce(tp.status, 'active') in ('active','accepted')
      and tp.removed_at is null
      and (
        tp.user_id = v_uid
        or tp.assigned_user_id = v_uid
        or (tp.user_id is null and tp.assigned_user_id is null and v_email <> '' and lower(nullif(btrim(tp.participant_email), '')) = v_email)
      )
  ) then return true; end if;

  if exists (
    select 1
    from public.transaction_role_players trp
    where trp.transaction_id = target_transaction_id
      and coalesce(trp.status, 'active') in ('active','accepted')
      and trp.removed_at is null
      and (
        trp.user_id = v_uid
        or trp.assigned_user_id = v_uid
        or (trp.user_id is null and trp.assigned_user_id is null and v_email <> '' and lower(nullif(btrim(trp.email_address), '')) = v_email)
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

create or replace function public.bridge_has_transaction_access(target_transaction_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and public.bridge_can_access_transaction_spine(target_transaction_id);
$$;

create or replace function public.bridge_has_development_access(target_development_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and (
  public.bridge_transaction_scope_is_internal_user()
  or exists(select 1 from public.developments d join public.organisation_users m on m.organisation_id=d.organisation_id
    where d.id=target_development_id and m.user_id=auth.uid() and m.removed_at is null
      and lower(coalesce(nullif(m.membership_status,''),m.status,'')) in ('active','accepted')
      and (public.bridge_current_profile_role()='developer' or lower(coalesce(m.workspace_role,m.organisation_role,m.role,'')) in ('owner','principal','admin','manager','director')))
  or exists(select 1 from public.development_participants dp where dp.development_id=target_development_id and dp.is_active and dp.can_view
    and (dp.user_id=auth.uid() or (dp.user_id is null and nullif(btrim(auth.jwt()->>'email'),'') is not null
      and lower(nullif(btrim(dp.participant_email),''))=lower(btrim(auth.jwt()->>'email')))))
  or (public.bridge_current_profile_role()<>'developer' and exists(select 1 from public.transactions t join public.transaction_participants tp on tp.transaction_id=t.id
    where t.development_id=target_development_id and coalesce(tp.status,'active') in ('active','accepted') and tp.removed_at is null and tp.can_view
      and (tp.user_id=auth.uid() or tp.assigned_user_id=auth.uid() or (tp.user_id is null and tp.assigned_user_id is null and nullif(btrim(auth.jwt()->>'email'),'') is not null
        and lower(nullif(btrim(tp.participant_email),''))=lower(btrim(auth.jwt()->>'email'))))))
 );
$$;

CREATE OR REPLACE FUNCTION public.bridge_can_edit_finance_lane(target_transaction_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select auth.uid() is not null
    and public.bridge_can_access_transaction_spine(target_transaction_id)
    and (public.bridge_transaction_scope_is_internal_user()
    or exists (
      select 1
      from public.transactions t
      where t.id = target_transaction_id
        and public.bridge_current_profile_role() in ('developer', 'agent')
        and auth.uid() in (
          t.created_by,
          t.owner_user_id,
          t.assigned_user_id,
          t.assigned_agent_id
        )
    )
    or exists (
      select 1
      from public.transaction_participants tp
      where tp.transaction_id = target_transaction_id
        and (
          tp.user_id = auth.uid()
          or tp.assigned_user_id = auth.uid()
          or (tp.user_id is null and tp.assigned_user_id is null and nullif(btrim(public.bridge_current_user_email()),'') is not null and lower(nullif(btrim(tp.participant_email),'')) = lower(btrim(public.bridge_current_user_email())))
        )
        and tp.can_edit_finance_workflow = true
        and coalesce(tp.status,'active') in ('active','accepted') and tp.removed_at is null
    )
    or exists (
      select 1
      from public.transactions t
      where t.id = target_transaction_id
        and public.bridge_current_profile_role() = 'bond_originator'
        and nullif(btrim(public.bridge_current_user_email()),'') is not null
        and lower(nullif(btrim(t.assigned_bond_originator_email),'')) = lower(btrim(public.bridge_current_user_email()))
    )
    )
$function$;

-- Change only identity candidates in the existing expressions. ALTER POLICY
-- retains their roles, commands and permissive/restrictive composition.
do $email_candidates$
declare p record; old_using text; old_check text; next_using text; next_check text;
 pattern text := 'lower\(COALESCE\((([a-z_][a-z_0-9]*\.)?(assigned_agent_email|assigned_attorney_email|assigned_bond_originator_email|participant_email|email_address)), ''''::text\)\)';
 replacement text := 'lower(NULLIF(btrim(\1), ''''::text))';
begin
 for p in select c.relname, pol.polname,pg_get_expr(pol.polqual,pol.polrelid) as using_expression,pg_get_expr(pol.polwithcheck,pol.polrelid) as check_expression
  from pg_policy pol join pg_class c on c.oid=pol.polrelid join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and (c.relname like 'transaction_%' or c.relname in ('documents','developments','development_participants','units'))
 loop
  old_using:=p.using_expression; old_check:=p.check_expression;
  next_using:=regexp_replace(old_using,pattern,replacement,'gi');
  next_check:=regexp_replace(old_check,pattern,replacement,'gi');
  -- Agency team limits remain unchanged for agency actors. Developers use
  -- the stricter tenant/shared-matter boundary below, even if an old agency
  -- membership also exists on their account.
  if p.polname in ('agency_two_tier_records','agency_two_tier_transaction_id') then
   if next_using is not null and position('bridge_current_profile_role' in next_using)=0 then
    next_using:=format('(public.bridge_current_profile_role() = ''developer'' or (%s))',next_using);
   end if;
   if next_check is not null and position('bridge_current_profile_role' in next_check)=0 then
    next_check:=format('(public.bridge_current_profile_role() = ''developer'' or (%s))',next_check);
   end if;
  end if;
  if next_using is distinct from old_using then execute format('alter policy %I on public.%I using (%s)',p.polname,p.relname,next_using); end if;
  if next_check is distinct from old_check then execute format('alter policy %I on public.%I with check (%s)',p.polname,p.relname,next_check); end if;
 end loop;
end
$email_candidates$;

-- These are restrictive boundaries, never a substitute for capability, legal
-- team, document audience, wet-ink or token policies already on each table.
do $tenant_boundaries$
declare r record; expression text; write_expression text; developer_only boolean;
begin
 for r in select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
  join pg_attribute a on a.attrelid=c.oid and a.attname='transaction_id' and a.atttypid='uuid'::regtype and not a.attisdropped
  where n.nspname='public' and c.relkind='r' and c.relrowsecurity
   and (c.relname like 'transaction_%' or c.relname in ('documents','document_requirement_instances','attorney_workflow_blockers','workflow_alerts','workflow_generated_tasks'))
 loop
  developer_only:=r.relname not in ('transaction_finance_workflows','transaction_bond_applications','transaction_bond_quotes','transaction_bond_instructions','transaction_bond_offer_decisions');
  write_expression:='transaction_id is null or public.bridge_can_access_transaction_spine(transaction_id)';
  expression:=write_expression||' or public.bridge_has_request_transaction_token_access(transaction_id)';
  if developer_only then expression:='coalesce(public.bridge_current_profile_role(),'''')<>''developer'' or ('||expression||')'; end if;
  if developer_only then write_expression:='coalesce(public.bridge_current_profile_role(),'''')<>''developer'' or ('||write_expression||')'; end if;
  execute format('drop policy if exists transaction_actor_read_boundary on public.%I',r.relname);
  execute format('drop policy if exists transaction_actor_insert_boundary on public.%I',r.relname);
  execute format('drop policy if exists transaction_actor_update_boundary on public.%I',r.relname);
  execute format('drop policy if exists transaction_actor_delete_boundary on public.%I',r.relname);
  execute format('create policy transaction_actor_read_boundary on public.%I as restrictive for select to authenticated using (%s)',r.relname,expression);
  execute format('create policy transaction_actor_insert_boundary on public.%I as restrictive for insert to authenticated with check (%s)',r.relname,write_expression);
  execute format('create policy transaction_actor_update_boundary on public.%I as restrictive for update to authenticated using (%s) with check (%s)',r.relname,write_expression,write_expression);
  execute format('create policy transaction_actor_delete_boundary on public.%I as restrictive for delete to authenticated using (%s)',r.relname,write_expression);
 end loop;
 drop policy if exists developer_transaction_read_boundary on public.transactions;
 create policy developer_transaction_read_boundary on public.transactions as restrictive for select to authenticated
  using(coalesce(public.bridge_current_profile_role(),'')<>'developer' or public.bridge_can_access_transaction_spine(id) or public.bridge_has_request_transaction_token_access(id));
 drop policy if exists developer_transaction_write_boundary on public.transactions;
 create policy developer_transaction_write_boundary on public.transactions as restrictive for update to authenticated
  using(coalesce(public.bridge_current_profile_role(),'')<>'developer' or public.bridge_can_access_transaction_spine(id))
  with check(coalesce(public.bridge_current_profile_role(),'')<>'developer' or public.bridge_can_access_transaction_spine(id));
 drop policy if exists developer_development_read_boundary on public.developments;
 create policy developer_development_read_boundary on public.developments as restrictive for select to authenticated
  using(coalesce(public.bridge_current_profile_role(),'')<>'developer' or public.bridge_has_development_access(id));
 if to_regclass('public.units') is not null then
  drop policy if exists developer_unit_boundary on public.units;
  create policy developer_unit_boundary on public.units as restrictive for all to authenticated
   using(coalesce(public.bridge_current_profile_role(),'')<>'developer' or public.bridge_has_development_access(development_id))
   with check(coalesce(public.bridge_current_profile_role(),'')<>'developer' or public.bridge_has_development_access(development_id));
 end if;
end
$tenant_boundaries$;

-- Replacements retain existing function ACLs; do not introduce PUBLIC execute.
revoke all on function public.bridge_has_transaction_access(uuid),public.bridge_has_development_access(uuid),public.bridge_can_edit_finance_lane(uuid),public.bridge_transaction_scope_is_internal_user() from public;
grant execute on function public.bridge_has_transaction_access(uuid),public.bridge_has_development_access(uuid),public.bridge_can_edit_finance_lane(uuid),public.bridge_transaction_scope_is_internal_user() to anon,authenticated,service_role;
notify pgrst,'reload schema';
